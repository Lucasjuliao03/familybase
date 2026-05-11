const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { gestorOnly, parentOnly } = require('../../middleware/permissions');
const { requireModule, isEnabled } = require('../../middleware/familyModule');

function accessProfile(req) {
  return req.user.accessProfile ?? req.user.access_profile ?? 'gestor';
}

function isGestor(req) {
  return req.user.role === 'parent' && accessProfile(req) === 'gestor';
}

function parseJson(str, fallback = []) {
  if (!str) return fallback;
  try {
    const x = JSON.parse(str);
    return Array.isArray(x) ? x : fallback;
  } catch {
    return fallback;
  }
}

async function childRow(db, userId) {
  return await db.prepare('SELECT * FROM children WHERE user_id=?').get(userId);
}

function userSeesNotice(db, user, notice) {
  if (notice.family_id !== user.familyId) return false;
  if (['archived', 'cancelled'].includes(notice.status)) return false;

  // Parents (gestores/criadores) devem conseguir ver tudo para acompanhar
  if (user.role === 'parent' || notice.created_by === user.id) return true;

  switch (notice.target_type) {
    case 'all':
      return user.role !== 'master';
    case 'parents':
      return user.role === 'parent';
    case 'child': {
      const ids = parseJson(notice.target_child_ids);
      if (user.role !== 'child') return false;
      const c = childRow(db, user.id);
      return c && ids.includes(c.id);
    }
    case 'relative': {
      const ids = parseJson(notice.target_user_ids);
      return user.role === 'relative' && ids.includes(user.id);
    }
    case 'selected': {
      const uids = parseJson(notice.target_user_ids);
      const cids = parseJson(notice.target_child_ids);
      if (uids.includes(user.id)) return true;
      if (user.role === 'child') {
        const c = childRow(db, user.id);
        return c && cids.includes(c.id);
      }
      return false;
    }
    default:
      return false;
  }
}

function canEditNotice(req, notice) {
  if (req.user.role !== 'parent') return false;
  if (isGestor(req)) return true;
  return notice.created_by === req.user.id;
}

async function notifyTargets(db, familyId, notice, actorUserId) {
  if (!isEnabled(db, familyId, 'notifications')) return;
  const title = notice.title;
  const msg = (notice.description || '').slice(0, 200);
  const recipients = new Set();

  const addUser = (uid) => {
    if (uid && uid !== actorUserId) recipients.add(uid);
  };

  switch (notice.target_type) {
    case 'all': {
      const users = await db.prepare('SELECT id FROM users WHERE family_id=? AND role IN (\'parent\',\'relative\')').all(familyId);
      users.forEach((u) => addUser(u.id));
      const children = await db.prepare('SELECT user_id FROM children WHERE family_id=? AND user_id IS NOT NULL').all(familyId);
      children.forEach((c) => addUser(c.user_id));
      break;
    }
    case 'parents': {
      await db.prepare('SELECT id FROM users WHERE family_id=? AND role=?').all(familyId, 'parent').forEach((u) => addUser(u.id));
      break;
    }
    case 'child': {
      parseJson(notice.target_child_ids).forEachasync ((cid) => {
        const r = await db.prepare('SELECT user_id FROM children WHERE id=?').get(cid);
        if (r?.user_id) addUser(r.user_id);
      });
      break;
    }
    case 'relative': {
      parseJson(notice.target_user_ids).forEach((uid) => addUser(uid));
      break;
    }
    case 'selected': {
      parseJson(notice.target_user_ids).forEach((uid) => addUser(uid));
      parseJson(notice.target_child_ids).forEachasync ((cid) => {
        const r = await db.prepare('SELECT user_id FROM children WHERE id=?').get(cid);
        if (r?.user_id) addUser(r.user_id);
      });
      break;
    }
    default:
      break;
  }

  for (const uid of recipients) {
    const childRef = await db.prepare('SELECT id FROM children WHERE user_id=?').get(uid);
    if (childRef) {
      await db.prepare(`INSERT INTO notifications (id,title,message,type,icon,user_id,child_id,family_id) VALUES (?,?,?,?,?,?,?,?)`).run(
        uuidv4(), title, msg || 'Novo aviso no mural', 'info', '📌', null, childRef.id, familyId,
      );
    } else {
      await db.prepare(`INSERT INTO notifications (id,title,message,type,icon,user_id,child_id,family_id) VALUES (?,?,?,?,?,?,?,?)`).run(
        uuidv4(), title, msg || 'Novo aviso no mural', 'info', '📌', uid, null, familyId,
      );
    }
  }
}

router.use(authMiddleware, requireModule('mural'));

router.get('/notices', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const { status, type, priority } = req.query;
    let rows = await db.prepare(`
      SELECT n.*, u.name as author_name, u.display_color as author_color FROM family_notices n
      LEFT JOIN users u ON u.id=n.created_by
      WHERE n.family_id=? ORDER BY n.is_pinned DESC, n.due_datetime ASC, n.created_at DESC
    `).all(fid);

    rows = rows.filter((n) => userSeesNotice(db, req.user, n));
    if (status) rows = rows.filter((n) => n.status === status);
    if (type) rows = rows.filter((n) => n.type === type);
    if (priority) rows = rows.filter((n) => n.priority === priority);

    const withReads = rows.mapasync ((n) => {
      const reads = await db.prepare(`
        SELECT nr.*, u.name FROM notice_reads nr JOIN users u ON u.id=nr.user_id WHERE nr.notice_id=?
      `).all(n.id);
      const myRead = await db.prepare('SELECT * FROM notice_reads WHERE notice_id=? AND user_id=?').get(n.id, req.user.id);
      return { ...n, reads, myRead };
    });

    res.json(withReads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

router.get('/notices/:id', async (req, res) => {
  try {
    const db = req.db;
    const n = await db.prepare(`
      SELECT n.*, u.name as author_name, u.display_color as author_color
      FROM family_notices n
      LEFT JOIN users u ON u.id=n.created_by
      WHERE n.id=? AND n.family_id=?
    `).get(req.params.id, req.user.familyId);
    if (!n || !userSeesNotice(db, req.user, n)) return res.status(404).json({ error: 'Não encontrado' });
    const reads = await db.prepare(`SELECT nr.*, u.name FROM notice_reads nr JOIN users u ON u.id=nr.user_id WHERE nr.notice_id=?`).all(n.id);
    const myRead = db.prepare('SELECT * FROM notice_reads WHERE notice_id=? AND user_id=?').get(n.id, req.user.id);
    res.json({ ...n, reads, myRead });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/notices', async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    if (req.user.role === 'relative') {
      return res.status(403).json({ error: 'Parentes não podem criar avisos nesta versão' });
    }
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Sem permissão' });

    const {
      title, description, type, priority, target_type, target_user_ids, target_child_ids,
      start_datetime, due_datetime, notice_time, is_recurring, recurrence_rule,
      is_pinned, requires_read_confirmation, status,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Título obrigatório' });

    if (is_pinned && !isGestor(req)) return res.status(403).json({ error: 'Apenas gestor pode fixar' });

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO family_notices (
        id,family_id,title,description,type,priority,target_type,target_user_ids,target_child_ids,
        start_datetime,due_datetime,notice_time,is_recurring,recurrence_rule,is_pinned,requires_read_confirmation,status,created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, fid, title, description || null, type || 'notice', priority || 'normal', target_type || 'all',
      JSON.stringify(target_user_ids || []),
      JSON.stringify(target_child_ids || []),
      start_datetime || null, due_datetime || null, notice_time || null,
      is_recurring ? 1 : 0, recurrence_rule || null, is_pinned ? 1 : 0, requires_read_confirmation ? 1 : 0,
      status || 'active', req.user.id,
    );
    const notice = await db.prepare('SELECT * FROM family_notices WHERE id=?').get(id);
    notifyTargets(db, fid, notice, req.user.id);
    res.status(201).json(notice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

router.put('/notices/:id', parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const notice = await db.prepare('SELECT * FROM family_notices WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!notice) return res.status(404).json({ error: 'Não encontrado' });
    if (!canEditNotice(req, notice)) return res.status(403).json({ error: 'Sem permissão' });

    const u = req.body;
    if (u.is_pinned && !isGestor(req)) return res.status(403).json({ error: 'Apenas gestor pode fixar' });

    await db.prepare(`
      UPDATE family_notices SET
        title=COALESCE(?,title), description=COALESCE(?,description), type=COALESCE(?,type), priority=COALESCE(?,priority),
        target_type=COALESCE(?,target_type),
        target_user_ids=COALESCE(?,target_user_ids), target_child_ids=COALESCE(?,target_child_ids),
        start_datetime=COALESCE(?,start_datetime), due_datetime=COALESCE(?,due_datetime), notice_time=COALESCE(?,notice_time),
        is_recurring=COALESCE(?,is_recurring), recurrence_rule=COALESCE(?,recurrence_rule),
        is_pinned=COALESCE(?,is_pinned), requires_read_confirmation=COALESCE(?,requires_read_confirmation),
        status=COALESCE(?,status), updated_at=datetime('now')
      WHERE id=?
    `).run(
      u.title, u.description, u.type, u.priority, u.target_type,
      u.target_user_ids != null ? JSON.stringify(u.target_user_ids) : null,
      u.target_child_ids != null ? JSON.stringify(u.target_child_ids) : null,
      u.start_datetime, u.due_datetime, u.notice_time,
      u.is_recurring !== undefined ? (u.is_recurring ? 1 : 0) : null,
      u.recurrence_rule,
      u.is_pinned !== undefined ? (u.is_pinned ? 1 : 0) : null,
      u.requires_read_confirmation !== undefined ? (u.requires_read_confirmation ? 1 : 0) : null,
      u.status,
      req.params.id,
    );
    res.json(await db.prepare('SELECT * FROM family_notices WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/notices/:id/read', async (req, res) => {
  try {
    const db = req.db;
    const notice = await db.prepare('SELECT * FROM family_notices WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!notice || !userSeesNotice(db, req.user, notice)) return res.status(404).json({ error: 'Não encontrado' });

    const now = new Date().toISOString();
    const existing = await db.prepare('SELECT * FROM notice_reads WHERE notice_id=? AND user_id=?').get(notice.id, req.user.id);
    if (existing) {
      await db.prepare('UPDATE notice_reads SET read_at=? WHERE id=?').run(now, existing.id);
    } else {
      await db.prepare('INSERT INTO notice_reads (id,notice_id,user_id,read_at) VALUES (?,?,?,?)').run(uuidv4(), notice.id, req.user.id, now);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/notices/:id/confirm', async (req, res) => {
  try {
    const db = req.db;
    const notice = await db.prepare('SELECT * FROM family_notices WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!notice || !userSeesNotice(db, req.user, notice)) return res.status(404).json({ error: 'Não encontrado' });
    if (!notice.requires_read_confirmation) return res.status(400).json({ error: 'Confirmação não exigida' });
    const now = new Date().toISOString();
    let row = await db.prepare('SELECT * FROM notice_reads WHERE notice_id=? AND user_id=?').get(notice.id, req.user.id);
    if (!row) {
      await db.prepare('INSERT INTO notice_reads (id,notice_id,user_id,read_at,confirmed_at) VALUES (?,?,?,?,?)').run(uuidv4(), notice.id, req.user.id, now, now);
    } else {
      await db.prepare('UPDATE notice_reads SET read_at=COALESCE(read_at,?), confirmed_at=? WHERE id=?').run(now, now, row.id);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/notices/:id/complete', async (req, res) => {
  try {
    const db = req.db;
    const notice = await db.prepare('SELECT * FROM family_notices WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!notice || !userSeesNotice(db, req.user, notice)) return res.status(404).json({ error: 'Não encontrado' });

    if (notice.type === 'quick_task' && req.user.role === 'child') {
      const c = childRow(db, req.user.id);
      const targets = parseJson(notice.target_child_ids);
      if (!c || !targets.includes(c.id)) return res.status(403).json({ error: 'Acesso negado' });
    } else if (!isGestor(req) && notice.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await db.prepare(`UPDATE family_notices SET status='completed', completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/notices/:id/archive', gestorOnly, async (req, res) => {
  try {
    const db = req.db;
    const n = await db.prepare('SELECT * FROM family_notices WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!n) return res.status(404).json({ error: 'Não encontrado' });
    await db.prepare(`UPDATE family_notices SET status='archived', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/notices/:id', gestorOnly, async (req, res) => {
  try {
    const db = req.db;
    const n = await db.prepare('SELECT * FROM family_notices WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!n) return res.status(404).json({ error: 'Não encontrado' });
    db.prepare('DELETE FROM notice_reads WHERE notice_id=?').run(req.params.id);
    await db.prepare('DELETE FROM family_notices WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
