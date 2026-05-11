const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const authMiddleware = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Configure VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@familybase.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️ Push notifications disabled: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing in .env');
}

router.use(authMiddleware);

// GET /api/push/vapid-public-key
router.get('/vapid-public-key', async (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe - save push subscription
router.post('/subscribe', async (req, res) => {
  try {
    const db = req.db;
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    const endpoint = subscription.endpoint;
    const subJson = JSON.stringify(subscription);

    // Check if push_subscriptions table exists; create if not
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        family_id TEXT,
        endpoint TEXT NOT NULL UNIQUE,
        subscription TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
    `);

    // Upsert subscription
    const existing = await db.prepare('SELECT id FROM push_subscriptions WHERE endpoint=?').get(endpoint);
    if (existing) {
      db.prepare('UPDATE push_subscriptions SET subscription=?, user_id=?, family_id=? WHERE id=?')
        .run(subJson, req.user.id, req.user.familyId || null, existing.id);
    } else {
      db.prepare('INSERT INTO push_subscriptions (id, user_id, family_id, endpoint, subscription) VALUES (?,?,?,?,?)')
        .run(uuidv4(), req.user.id, req.user.familyId || null, endpoint, subJson);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Erro ao salvar subscription' });
  }
});

// DELETE /api/push/unsubscribe
router.delete('/unsubscribe', async (req, res) => {
  try {
    const db = req.db;
    const { endpoint } = req.body;
    if (endpoint) {
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(endpoint, req.user.id);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

// Internal helper - exported for use by other routes
async function sendPushToUser(db, userId, payload) {
  try {
    const subs = db.prepare('SELECT subscription FROM push_subscriptions WHERE user_id=?').all(userId);
    const promises = subs.map(async (row) => {
      try {
        const sub = JSON.parse(row.subscription);
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (err) {
        // Remove expired/invalid subscription (410 Gone)
        if (err.statusCode === 410 || err.statusCode === 404) {
          try {
            db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?')
              .run(userId, JSON.parse(row.subscription).endpoint);
          } catch {}
        }
      }
    });
    await Promise.allSettled(promises);
  } catch (err) {
    console.error('sendPushToUser error:', err);
  }
}

// POST /api/push/test - send test notification to self
router.post('/test', async (req, res) => {
  try {
    const db = req.db;
    await sendPushToUser(db, req.user.id, {
      title: '🔔 FamilyBase',
      body: 'Notificações funcionando! ✅',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      url: '/'
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar notificação' });
  }
});

module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
