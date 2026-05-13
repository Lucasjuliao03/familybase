const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { parentOnly } = require('../../middleware/permissions');
const { requireModule, isEnabled } = require('../../middleware/familyModule');

router.use(authMiddleware, requireModule('grades'));

// GET /api/grades — pais veem tudo, filhos veem só os seus
router.get('/', async (req, res) => {
  try {
    const db = req.db;
    const { child_id, subject } = req.query;
    let q = 'SELECT g.*,c.name as child_name,c.color as child_color, c.avatar_url, c.avatar_preset FROM grades g JOIN children c ON g.child_id=c.id WHERE g.family_id=?';
    const p = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND g.child_id=?'; p.push(child.id); }
    } else if (child_id) { q += ' AND g.child_id=?'; p.push(child_id); }
    if (subject) { q += ' AND g.subject=?'; p.push(subject); }
    q += ' ORDER BY g.date DESC, g.created_at DESC';
    res.json(await db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro ao listar notas' }); }
});

// POST /api/grades — pais E filhos podem cadastrar
router.post('/', async (req, res) => {
  try {
    const { subject, type, score, max_score, concept, observation, date, child_id } = req.body;
    const db = req.db;
    const id = uuidv4();

    let targetChildId = child_id;
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (!child) return res.status(400).json({ error: 'Perfil não encontrado' });
      targetChildId = child.id;
    } else if (!child_id) {
      return res.status(400).json({ error: 'Selecione um filho' });
    }

    await db.prepare('INSERT INTO grades (id,subject,type,score,max_score,concept,observation,date,child_id,family_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      id, subject, type || 'test', score != null ? parseFloat(score) : null,
      parseFloat(max_score) || 10, concept || null, observation || null,
      date || new Date().toISOString().split('T')[0], targetChildId, req.user.familyId
    );

    // Check perfect score medal
    if (score != null && parseFloat(score) >= parseFloat(max_score || 10) && (await isEnabled(db, req.user.familyId, 'medals'))) {
      const perfects = await db.prepare('SELECT COUNT(*) as c FROM grades WHERE child_id=? AND score>=max_score').get(targetChildId);
      const medals = await db.prepare('SELECT * FROM medals WHERE requirement_type=? AND requirement_value<=?').all('perfect_grade', perfects.c);
      for (const m of medals) {
        if (!await db.prepare('SELECT id FROM earned_medals WHERE medal_id=? AND child_id=?').get(m.id, targetChildId)) {
          await db.prepare('INSERT INTO earned_medals (id,medal_id,child_id) VALUES (?,?,?)').run(uuidv4(), m.id, targetChildId);
          if (await isEnabled(db, req.user.familyId, 'notifications')) {
            await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
              uuidv4(), 'Nova medalha!', m.name, 'achievement', m.icon, targetChildId, req.user.familyId);
          }
        }
      }
      await db.prepare("UPDATE children SET points=points+20, xp=xp+20, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(targetChildId);
      await db.prepare('INSERT INTO history (id,event,points,type,child_id,family_id) VALUES (?,?,?,?,?,?)').run(
        uuidv4(), `Nota máxima em ${subject}!`, 20, 'grade', targetChildId, req.user.familyId);
    }

    res.status(201).json(await db.prepare('SELECT g.*,c.name as child_name FROM grades g JOIN children c ON g.child_id=c.id WHERE g.id=?').get(id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao adicionar nota' }); }
});

// PUT /api/grades/:id — pais e o próprio filho podem editar
router.put('/:id', async (req, res) => {
  try {
    const { subject, type, score, max_score, concept, observation, date } = req.body;
    const db = req.db;
    const grade = await db.prepare('SELECT * FROM grades WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!grade) return res.status(404).json({ error: 'Nota não encontrada' });
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (!child || child.id !== grade.child_id) return res.status(403).json({ error: 'Sem permissão' });
    }
    await db.prepare("UPDATE grades SET subject=COALESCE(?,subject), type=COALESCE(?,type), score=COALESCE(?,score), max_score=COALESCE(?,max_score), concept=COALESCE(?,concept), observation=COALESCE(?,observation), date=COALESCE(?,date) WHERE id=? AND family_id=?")
      .run(subject, type, score != null ? parseFloat(score) : null, max_score, concept, observation, date, req.params.id, req.user.familyId);
    res.json(await db.prepare('SELECT * FROM grades WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar nota' }); }
});

// DELETE /api/grades/:id
router.delete('/:id', parentOnly, async (req, res) => {
  try { await req.db.prepare('DELETE FROM grades WHERE id=? AND family_id=?').run(req.params.id, req.user.familyId); res.json({ message: 'Removida' }); }
  catch (err) { res.status(500).json({ error: 'Erro ao remover' }); }
});

// GET /api/grades/subjects
router.get('/subjects', async (req, res) => {
  try {
    const subjects = await req.db.prepare('SELECT DISTINCT subject FROM grades WHERE family_id=? ORDER BY subject').all(req.user.familyId);
    res.json(subjects.map(s => s.subject));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
