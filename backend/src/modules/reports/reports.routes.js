const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const { parentOnly } = require('../../middleware/permissions');
const { isEnabled } = require('../../middleware/familyModule');

// GET /api/reports/dashboard
router.get('/dashboard', authMiddleware, parentOnly, async (req, res) => {
  try {
    const db = req.db; const fid = req.user.familyId;
    const children = await db.prepare('SELECT * FROM children WHERE family_id=? ORDER BY name').all(fid);
    let pendingTasks = { c: 0 }; let completedTasks = { c: 0 }; let approvedTasks = { c: 0 };
    if (isEnabled(db, fid, 'tasks')) {
      pendingTasks = await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE family_id=? AND status=?').get(fid, 'pending');
      completedTasks = await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE family_id=? AND status=?').get(fid, 'completed');
      approvedTasks = await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE family_id=? AND status=?').get(fid, 'approved');
    }
    let pendingRedemptions = { c: 0 };
    if (isEnabled(db, fid, 'family_shop')) {
      pendingRedemptions = await db.prepare('SELECT COUNT(*) as c FROM redemptions r JOIN rewards rw ON r.reward_id=rw.id WHERE rw.family_id=? AND r.status=?').get(fid, 'pending');
    }
    let upcomingEvents = [];
    if (isEnabled(db, fid, 'calendar')) {
      upcomingEvents = await db.prepare("SELECT ce.*,c.name as child_name,c.color as child_color FROM calendar_events ce LEFT JOIN children c ON ce.child_id=c.id WHERE ce.family_id=? AND ce.date>=date('now') ORDER BY ce.date LIMIT 5").all(fid);
    }
    let recentHistory = [];
    if (isEnabled(db, fid, 'medals') || isEnabled(db, fid, 'tasks')) {
      recentHistory = await db.prepare('SELECT h.*,c.name as child_name,c.color as child_color, c.avatar_url, c.avatar_preset FROM history h JOIN children c ON h.child_id=c.id WHERE h.family_id=? ORDER BY h.created_at DESC LIMIT 10').all(fid);
      if (!isEnabled(db, fid, 'tasks')) {
        recentHistory = recentHistory.filter((h) => h.type !== 'task');
      }
      if (!isEnabled(db, fid, 'medals')) {
        recentHistory = recentHistory.filter((h) => h.type !== 'medal');
      }
    }

    res.json({
      children, upcomingEvents, recentHistory,
      stats: { pending: pendingTasks.c, completed: completedTasks.c, approved: approvedTasks.c, pendingRedemptions: pendingRedemptions.c },
    });
  } catch (err) { console.error('Dashboard error:', err); res.status(500).json({ error: 'Erro' }); }
});

// GET /api/reports/child/:childId
router.get('/child/:childId', authMiddleware, async (req, res) => {
  try {
    const db = req.db; const cid = req.params.childId;
    const child = await db.prepare('SELECT * FROM children WHERE id=? AND family_id=?').get(cid, req.user.familyId);
    if (!child) return res.status(404).json({ error: 'Não encontrado' });
    const fid = req.user.familyId;

    let taskStats = { pending: 0, completed: 0, approved: 0, rejected: 0 };
    if (isEnabled(db, fid, 'tasks')) {
      taskStats = {
        pending: await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE child_id=? AND status=?').get(cid, 'pending').c,
        completed: await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE child_id=? AND status=?').get(cid, 'completed').c,
        approved: await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE child_id=? AND status=?').get(cid, 'approved').c,
        rejected: await db.prepare('SELECT COUNT(*) as c FROM tasks WHERE child_id=? AND status=?').get(cid, 'rejected').c,
      };
    }

    let grades = [];
    if (isEnabled(db, fid, 'grades')) {
      grades = await db.prepare('SELECT * FROM grades WHERE child_id=? ORDER BY date DESC').all(cid);
    }
    const gradesBySubject = {};
    for (const g of grades) {
      if (!gradesBySubject[g.subject]) gradesBySubject[g.subject] = [];
      gradesBySubject[g.subject].push(g);
    }
    const avgBySubject = {};
    for (const [subj, gs] of Object.entries(gradesBySubject)) {
      const scored = gs.filter(g => g.score != null);
      avgBySubject[subj] = scored.length ? (scored.reduce((a,g) => a+g.score, 0) / scored.length).toFixed(1) : null;
    }

    let medals = [];
    if (isEnabled(db, fid, 'medals')) {
      medals = await db.prepare('SELECT m.*,em.earned_at FROM earned_medals em JOIN medals m ON em.medal_id=m.id WHERE em.child_id=?').all(cid);
    }
    let allowance_settings = null;
    let allowance_cycles = [];
    if (isEnabled(db, fid, 'allowance')) {
      allowance_settings = await db.prepare('SELECT * FROM allowance_settings WHERE child_id=?').get(cid);
      allowance_cycles = db.prepare('SELECT * FROM allowance_cycles WHERE child_id=? ORDER BY year DESC, month DESC LIMIT 12').all(cid);
    }
    let history = [];
    if (isEnabled(db, fid, 'tasks') || isEnabled(db, fid, 'medals') || isEnabled(db, fid, 'grades')) {
      history = await db.prepare('SELECT * FROM history WHERE child_id=? ORDER BY created_at DESC LIMIT 30').all(cid);
      history = history.filter((h) => {
        if (h.type === 'task' && !isEnabled(db, fid, 'tasks')) return false;
        if (h.type === 'medal' && !isEnabled(db, fid, 'medals')) return false;
        if (h.type === 'grade' && !isEnabled(db, fid, 'grades')) return false;
        return true;
      });
    }

    res.json({ child, taskStats, grades, gradesBySubject, avgBySubject, medals, allowance_settings, allowance_cycles, history });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/reports/export/:type
router.get('/export/:type', authMiddleware, parentOnly, async (req, res) => {
  try {
    const db = req.db; const fid = req.user.familyId;
    const { type } = req.params;
    const { child_id } = req.query;

    if (!isEnabled(db, fid, 'reports')) {
      return res.status(403).json({ error: 'Relatórios desativados para esta família', code: 'MODULE_DISABLED', module: 'reports' });
    }
    if (type === 'tasks' && !isEnabled(db, fid, 'tasks')) {
      return res.status(403).json({ error: 'Módulo de tarefas desativado', code: 'MODULE_DISABLED', module: 'tasks' });
    }
    if (type === 'grades' && !isEnabled(db, fid, 'grades')) {
      return res.status(403).json({ error: 'Módulo de notas desativado', code: 'MODULE_DISABLED', module: 'grades' });
    }

    let data;
    if (type === 'tasks') {
      let q = 'SELECT t.title,t.type,t.points,t.status,t.frequency,t.created_at,t.completed_at,c.name as child_name FROM tasks t JOIN children c ON t.child_id=c.id WHERE t.family_id=?';
      const p = [fid];
      if (child_id) { q += ' AND t.child_id=?'; p.push(child_id); }
      data = await db.prepare(q+' ORDER BY t.created_at DESC').all(...p);
    } else if (type === 'grades') {
      let q = 'SELECT g.subject,g.type,g.score,g.max_score,g.concept,g.observation,g.date,c.name as child_name FROM grades g JOIN children c ON g.child_id=c.id WHERE g.family_id=?';
      const p = [fid];
      if (child_id) { q += ' AND g.child_id=?'; p.push(child_id); }
      data = await db.prepare(q+' ORDER BY g.date DESC').all(...p);
    } else if (type === 'history') {
      let q = 'SELECT h.event,h.points,h.coins,h.type,h.created_at,c.name as child_name FROM history h JOIN children c ON h.child_id=c.id WHERE h.family_id=?';
      const p = [fid];
      if (child_id) { q += ' AND h.child_id=?'; p.push(child_id); }
      data = await db.prepare(q+' ORDER BY h.created_at DESC').all(...p);
    } else {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
