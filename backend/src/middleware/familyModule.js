const { PREMIUM_KEYS, isPremiumPlan } = require('../lib/familyModulesCatalog');

async function getMap(db, familyId) {
  const rows = await db.prepare('SELECT module_key, is_enabled FROM family_modules WHERE family_id = ?').all(familyId);
  const m = {};
  for (const r of rows) {
    m[r.module_key] = r.is_enabled === 1;
  }
  return m;
}

async function isEnabled(db, familyId, moduleKey) {
  if (!familyId) return true;
  const r = await db.prepare('SELECT is_enabled FROM family_modules WHERE family_id = ? AND module_key = ?').get(familyId, moduleKey);
  if (!r) return false;
  return r.is_enabled === 1;
}

function requireModule(moduleKey) {
  return async (req, res, next) => {
    if (!req.user || !req.user.familyId) return next();
    const db = req.db;
    const enabled = await isEnabled(db, req.user.familyId, moduleKey);
    if (!enabled) {
      return res.status(403).json({
        error: 'Este módulo está desativado para a sua família',
        code: 'MODULE_DISABLED',
        module: moduleKey,
      });
    }
    next();
  };
}

function requireAnyModule(...keys) {
  return async (req, res, next) => {
    if (!req.user || !req.user.familyId) return next();
    const db = req.db;
    const fid = req.user.familyId;
    for (const k of keys) {
      if (await isEnabled(db, fid, k)) return next();
    }
    return res.status(403).json({
      error: 'Este módulo está desativado para a sua família',
      code: 'MODULE_DISABLED',
      module: keys.join('|'),
    });
  };
}

function moduleForNotificationType(type) {
  const t = (type || '').toLowerCase();
  if (t === 'task' || t === 'tasks') return 'tasks';
  if (t === 'grade' || t === 'grades') return 'grades';
  if (t === 'reward' || t === 'rewards' || t === 'redemption') return 'family_shop';
  if (t === 'allowance' || t === 'mesada') return 'allowance';
  if (t === 'calendar' || t === 'event') return 'calendar';
  if (t === 'medal') return 'medals';
  if (t === 'notice' || t === 'mural') return 'mural';
  if (t === 'info' || t === 'welcome') return null;
  return null;
}

async function filterNotificationsByModules(db, familyId, notifications) {
  const map = await getMap(db, familyId);
  return notifications.filter((n) => {
    const mod = moduleForNotificationType(n.type);
    if (mod == null) return true;
    return map[mod] !== false;
  });
}

module.exports = {
  requireModule,
  requireAnyModule,
  isEnabled,
  getMap,
  moduleForNotificationType,
  filterNotificationsByModules,
  PREMIUM_KEYS,
  isPremiumPlan,
};
