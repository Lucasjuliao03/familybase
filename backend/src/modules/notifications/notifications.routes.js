const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const { requireModule, filterNotificationsByModules } = require('../../middleware/familyModule');

router.use(authMiddleware, requireModule('notifications'));

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const db = req.db;
    let q, p;
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      q = 'SELECT * FROM notifications WHERE family_id=? AND (child_id=? OR child_id IS NULL) ORDER BY created_at DESC LIMIT 50';
      p = [req.user.familyId, child?.id];
    } else {
      q = 'SELECT * FROM notifications WHERE family_id=? AND (user_id=? OR user_id IS NULL) AND child_id IS NULL ORDER BY created_at DESC LIMIT 50';
      p = [req.user.familyId, req.user.id];
    }
    let rows = await db.prepare(q).all(...p);
    rows = filterNotificationsByModules(db, req.user.familyId, rows);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const db = req.db;
    let q, p;
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      q = 'SELECT * FROM notifications WHERE family_id=? AND (child_id=? OR child_id IS NULL) AND read=0';
      p = [req.user.familyId, child?.id];
    } else {
      q = 'SELECT * FROM notifications WHERE family_id=? AND (user_id=? OR user_id IS NULL) AND child_id IS NULL AND read=0';
      p = [req.user.familyId, req.user.id];
    }
    const all = await db.prepare(q).all(...p);
    const filtered = filterNotificationsByModules(db, req.user.familyId, all);
    res.json({ count: filtered.length });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try { req.db.prepare('UPDATE notifications SET read=1 WHERE id=?').run(req.params.id); res.json({ok:true}); }
  catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    const db = req.db;
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      db.prepare('UPDATE notifications SET read=1 WHERE family_id=? AND child_id=?').run(req.user.familyId, child?.id);
    } else {
      await db.prepare('UPDATE notifications SET read=1 WHERE family_id=? AND user_id=?').run(req.user.familyId, req.user.id);
    }
    res.json({ok:true});
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
