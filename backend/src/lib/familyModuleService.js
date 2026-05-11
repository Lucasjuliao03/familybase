const { v4: uuidv4 } = require('uuid');
const { MODULE_KEYS, PREMIUM_KEYS, DEFAULT_ENABLED, isPremiumPlan } = require('./familyModulesCatalog');

async function seedSystemModules(db) {
  for (let i = 0; i < MODULE_KEYS.length; i++) {
    const k = MODULE_KEYS[i];
    await db.prepare(`
      INSERT OR IGNORE INTO system_modules (module_key, sort_order, is_premium, default_enabled)
      VALUES (?, ?, ?, ?)
    `).run(k, i, PREMIUM_KEYS.has(k) ? 1 : 0, DEFAULT_ENABLED.has(k) ? 1 : 0);
  }
}

async function ensureFamilyModules(db, familyId, plan) {
  const premiumOk = isPremiumPlan(plan);
  for (const key of MODULE_KEYS) {
    const exists = await db.prepare('SELECT id FROM family_modules WHERE family_id = ? AND module_key = ?').get(familyId, key);
    if (exists) continue;
    const isPremium = PREMIUM_KEYS.has(key);
    let isEnabled = DEFAULT_ENABLED.has(key) ? 1 : 0;
    if (isPremium && !premiumOk) isEnabled = 0;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO family_modules (id, family_id, module_key, is_enabled, enabled_at, disabled_at, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
    const was = cur.is_enabled === 1;
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
        updated_at = datetime('now')
      WHERE family_id = ? AND module_key = ?
    `).run(want ? 1 : 0, enabledAt, disabledAt, updatedByUserId || null, familyId, key);
  }
}

module.exports = { seedSystemModules, ensureFamilyModules, setFamilyModules, MODULE_KEYS, PREMIUM_KEYS, DEFAULT_ENABLED };
