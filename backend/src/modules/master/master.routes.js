const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');

// Middleware: Master Only
function masterOnly(req, res, next) {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao Master' });
  next();
}

// GET /api/master/stats - Global stats
router.get('/stats', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const totalFamilies = await db.prepare("SELECT COUNT(*) as c FROM families").get().c;
    const totalUsers = await db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'master'").get().c;
    const totalChildren = await db.prepare("SELECT COUNT(*) as c FROM children").get().c;
    const activeFamilies = await db.prepare("SELECT COUNT(*) as c FROM families WHERE status = 'active'").get().c;
    const blockedFamilies = await db.prepare("SELECT COUNT(*) as c FROM families WHERE status = 'blocked'").get().c;
    res.json({ totalFamilies, totalUsers, totalChildren, activeFamilies, blockedFamilies });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro' }); }
});

// GET /api/master/families - List all families
router.get('/families', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const families = await db.prepare(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM users u WHERE u.family_id=f.id AND u.role='parent') as parent_count,
        (SELECT COUNT(*) FROM children c WHERE c.family_id=f.id) as children_count,
        s.plan, s.status as subscription_status, s.expires_at
      FROM families f
      LEFT JOIN subscriptions s ON s.family_id = f.id
      ORDER BY f.created_at DESC
    `).all();
    res.json(families);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/master/families/:id/status - Block/Unblock family
router.put('/families/:id/status', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const { status } = req.body;
    await db.prepare("UPDATE families SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
    
    // Audit log
    await db.prepare("INSERT INTO audit_logs (id, user_id, role, module, action, description, new_value) VALUES (?,?,?,?,?,?,?)")
      .run(uuidv4(), req.user.id, req.user.role, 'families', 'status_change', `Family ${req.params.id} status changed to ${status}`, status);
    
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/master/users - List all users
router.get('/users', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.status, u.created_at, u.last_login_at,
             f.name as family_name
      FROM users u
      LEFT JOIN families f ON u.family_id = f.id
      WHERE u.role != 'master'
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/master/users/:id/status - Block/unblock user
router.put('/users/:id/status', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const { status } = req.body;
    await db.prepare("UPDATE users SET status=?, updated_at=datetime('now') WHERE id=? AND role != 'master'").run(status, req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/master/subscriptions - All subscriptions
router.get('/subscriptions', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const subs = db.prepare(`
      SELECT s.*, f.name as family_name
      FROM subscriptions s JOIN families f ON s.family_id=f.id
      ORDER BY s.created_at DESC
    `).all();
    res.json(subs);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/master/subscriptions/:familyId - Update plan/subscription
router.put('/subscriptions/:familyId', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const { plan, status, expires_at, max_children, max_parents, max_relatives, enabled_modules } = req.body;
    const fid = req.params.familyId;
    
    const existing = await db.prepare("SELECT id FROM subscriptions WHERE family_id=?").get(fid);
    if (existing) {
      db.prepare("UPDATE subscriptions SET plan=COALESCE(?,plan), status=COALESCE(?,status), expires_at=COALESCE(?,expires_at), max_children=COALESCE(?,max_children), max_parents=COALESCE(?,max_parents), max_relatives=COALESCE(?,max_relatives), enabled_modules=COALESCE(?,enabled_modules) WHERE family_id=?")
        .run(plan, status, expires_at, max_children, max_parents, max_relatives, enabled_modules, fid);
    } else {
      db.prepare("INSERT INTO subscriptions (id, family_id, plan, status, expires_at, max_children, max_parents, max_relatives, enabled_modules) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(uuidv4(), fid, plan||'free', status||'active', expires_at, max_children||1, max_parents||2, max_relatives||0, enabled_modules||'tasks,calendar,grades');
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/master/audit-logs - Global audit logs
router.get('/audit-logs', authMiddleware, masterOnly, async (req, res) => {
  try {
    const db = req.db;
    const { limit = 100, module, action } = req.query;
    let q = "SELECT al.*, u.name as user_name, f.name as family_name FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id LEFT JOIN families f ON al.family_id=f.id WHERE 1=1";
    const params = [];
    if (module) { q += ' AND al.module=?'; params.push(module); }
    if (action) { q += ' AND al.action=?'; params.push(action); }
    q += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json(db.prepare(q).all(...params));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
