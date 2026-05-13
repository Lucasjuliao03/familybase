const { v4: uuidv4 } = require('uuid');
const { MODULE_KEYS, PREMIUM_KEYS, DEFAULT_ENABLED, isPremiumPlan } = require('./familyModulesCatalog');

async function seedSystemModules(db) {
  for (let i = 0; i < MODULE_KEYS.length; i++) {
    const k = MODULE_KEYS[i];
    await db.prepare(`
      INSERT INTO system_modules (module_key, sort_order, is_premium, default_enabled)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE module_key = ?)
    `).run(k, i, PREMIUM_KEYS.has(k), DEFAULT_ENABLED.has(k), k);
  }
}

async function ensureFamilyModules(db, familyId, plan) {
  const premiumOk = isPremiumPlan(plan);
  for (const key of MODULE_KEYS) {
    const exists = await db.prepare('SELECT id FROM family_modules WHERE family_id = ? AND module_key = ?').get(familyId, key);
    if (exists) continue;
    const isPremium = PREMIUM_KEYS.has(key);
    let isEnabled = !!DEFAULT_ENABLED.has(key);
    if (isPremium && !premiumOk) isEnabled = false;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO family_modules (id, family_id, module_key, is_enabled, enabled_at, disabled_at, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      uuidv4(),
      familyId,
      key,
      isEnabled,
      isEnabled ? now : null,
      isEnabled ? null : now,
      null,
    );
  }
}

async function setFamilyModules(db, familyId, updates, updatedByUserId, plan) {
  const premiumOk = isPremiumPlan(plan);
  const now = new Date().toISOString();
  for (const [key, enabled] of Object.entries(updates)) {
    if (!MODULE_KEYS.includes(key)) continue;
    const want = enabled === true || enabled === 1 || enabled === '1';
    if (PREMIUM_KEYS.has(key) && want && !premiumOk) continue;

    const cur = await db.prepare('SELECT * FROM family_modules WHERE family_id = ? AND module_key = ?').get(familyId, key);
    if (!cur) continue;
    const was = !!cur.is_enabled;
    if (was === want) continue;

    let enabledAt = cur.enabled_at;
    let disabledAt = cur.disabled_at;
    if (!was && want) {
      enabledAt = now;
      disabledAt = null;
    } else if (was && !want) {
      disabledAt = now;
    }

    await db.prepare(`
      UPDATE family_modules SET
        is_enabled = ?,
        enabled_at = ?,
        disabled_at = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE family_id = ? AND module_key = ?
    `).run(!!want, enabledAt, disabledAt, updatedByUserId || null, familyId, key);
  }
}

module.exports = { seedSystemModules, ensureFamilyModules, setFamilyModules, MODULE_KEYS, PREMIUM_KEYS, DEFAULT_ENABLED };
