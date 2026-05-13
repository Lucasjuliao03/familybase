const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { parentOnly } = require('../../middleware/permissions');
const { requireModule } = require('../../middleware/familyModule');

router.use(authMiddleware, requireModule('calendar'));

// GET /api/calendar — pais veem tudo; filhos veem só os seus + família
router.get('/', async (req, res) => {
  try {
    const db = req.db;
    const { month, year, child_id } = req.query;
    let q = `SELECT ce.*, c.name as child_name, c.color as child_color,
      cu.display_color as creator_color
      FROM calendar_events ce
      LEFT JOIN children c ON ce.child_id=c.id
      LEFT JOIN users cu ON ce.created_by = cu.id
      WHERE ce.family_id=?`;
    const p = [req.user.familyId];

    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) {
        q += ' AND (ce.child_id IS NULL OR ce.child_id=?) AND ce.visible_to_child=TRUE';
        p.push(child.id);
      }
    } else if (child_id) {
      q += ' AND (ce.child_id=? OR ce.child_id IS NULL)';
      p.push(child_id);
    }

    if (month && year) {
      q += " AND substr(ce.date,1,7)=?";
      p.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    q += ' ORDER BY ce.date ASC';
    const events = await db.prepare(q).all(...p);

    let merged = [...events];
    if (month && year) {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      let occQ = `
        SELECT oc.id, oc.occurrence_date AS date, t.title, t.due_time AS time, t.description,
               oc.child_id, t.assignee_user_id
        FROM task_occurrences oc
        JOIN tasks t ON t.id = oc.task_id
        WHERE oc.family_id = ? AND COALESCE(t.is_health_reminder, FALSE) = TRUE AND COALESCE(t.visible_on_calendar, FALSE) = TRUE
        AND substr(oc.occurrence_date, 1, 7) = ?
      `;
      const occP = [req.user.familyId, monthStr];
      if (req.user.role === 'child') {
        const ch = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
        if (ch) {
          occQ += " AND oc.child_id = ? AND COALESCE(t.assignee_user_id, '') = '' ";
          occP.push(ch.id);
        } else {
          occQ += ' AND 1=0 ';
        }
      } else if (child_id) {
        occQ += " AND oc.child_id = ? AND COALESCE(t.assignee_user_id, '') = '' ";
        occP.push(child_id);
      } else if (req.user.role === 'relative') {
        occQ += ` AND (
          t.assignee_user_id = ?
          OR (
            COALESCE(t.assignee_user_id, '') = ''
            AND EXISTS (SELECT 1 FROM relative_children rc WHERE rc.relative_user_id = ? AND rc.child_id = oc.child_id)
          )
        )`;
        occP.push(req.user.id, req.user.id);
      } else if (req.user.role === 'parent') {
        occQ += " AND (COALESCE(t.assignee_user_id, '') = '' OR t.assignee_user_id = ?) ";
        occP.push(req.user.id);
      }
      const occRows = await db.prepare(occQ).all(...occP);
      for (const row of occRows) {
        merged.push({
          id: `task-occ-${row.id}`,
          title: row.title,
          description: row.description,
          date: row.date,
          time: row.time || null,
          end_date: null,
          type: 'task',
          color: '#00B894',
          child_id: row.child_id,
          family_id: req.user.familyId,
          created_by: null,
          visible_to_child: true,
          visibility: 'family',
          child_name: null,
          child_color: null,
        });
      }
    }

    merged.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')));
    res.json(merged);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro' }); }
});

// POST /api/calendar — pais E filhos podem criar eventos
router.post('/', async (req, res) => {
  try {
    const { title, description, date, time, end_date, type, color, child_id, visible_to_child } = req.body;
    const db = req.db;
    const id = uuidv4();

    let targetChildId = child_id || null;
    let isVisibleToChild = visible_to_child !== undefined ? !!visible_to_child : true;

    if (req.user.role === 'child') {
      // Filhos só criam eventos para si mesmos
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (!child) return res.status(400).json({ error: 'Perfil não encontrado' });
      targetChildId = child.id;
      isVisibleToChild = true; // sempre visível para o filho
    }

    let eventColor = color || null;
    if (req.user.role === 'child' && targetChildId) {
      const ch = await db.prepare('SELECT color FROM children WHERE id=?').get(targetChildId);
      if (!eventColor && ch?.color) eventColor = ch.color;
    } else {
      const u = await db.prepare('SELECT display_color FROM users WHERE id=?').get(req.user.id);
      if (!eventColor && u?.display_color) eventColor = u.display_color;
      if (!eventColor) eventColor = '#6C5CE7';
    }

    await db.prepare(`INSERT INTO calendar_events (id,title,description,date,time,end_date,type,color,child_id,family_id,visible_to_child,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, title, description || null, date, time || null, end_date || null,
      type || 'family', eventColor, targetChildId, req.user.familyId, isVisibleToChild,
      req.user.id,
    );

    res.status(201).json(await db.prepare(`SELECT ce.*, c.name as child_name, c.color as child_color, cu.display_color as creator_color
      FROM calendar_events ce
      LEFT JOIN children c ON ce.child_id=c.id
      LEFT JOIN users cu ON ce.created_by = cu.id
      WHERE ce.id=?`).get(id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar evento' }); }
});

// PUT /api/calendar/:id
router.put('/:id', async (req, res) => {
  try {
    const { title, description, date, time, end_date, type, color, child_id, visible_to_child } = req.body;
    const db = req.db;
    const event = await db.prepare('SELECT * FROM calendar_events WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (!child || child.id !== event.child_id) return res.status(403).json({ error: 'Sem permissão' });
    }
    const vis = visible_to_child !== undefined ? !!visible_to_child : event.visible_to_child;
    await db.prepare("UPDATE calendar_events SET title=COALESCE(?,title),description=COALESCE(?,description),date=COALESCE(?,date),time=COALESCE(?,time),end_date=COALESCE(?,end_date),type=COALESCE(?,type),color=COALESCE(?,color),child_id=COALESCE(?,child_id),visible_to_child=? WHERE id=? AND family_id=?")
      .run(title, description, date, time, end_date, type, color, child_id, vis, req.params.id, req.user.familyId);
    res.json(await db.prepare(`SELECT ce.*, c.name as child_name, c.color as child_color, cu.display_color as creator_color
      FROM calendar_events ce
      LEFT JOIN children c ON ce.child_id=c.id
      LEFT JOIN users cu ON ce.created_by = cu.id
      WHERE ce.id=?`).get(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/calendar/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = req.db;
    const event = await db.prepare('SELECT * FROM calendar_events WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (!child || child.id !== event.child_id) return res.status(403).json({ error: 'Sem permissão' });
    }
    await db.prepare('DELETE FROM calendar_events WHERE id=?').run(req.params.id);
    res.json({ message: 'Removido' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
