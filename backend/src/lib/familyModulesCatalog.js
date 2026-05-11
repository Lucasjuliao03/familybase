/**
 * Catálogo global de módulos (chaves estáveis para API e DB)
 */
const MODULE_KEYS = [
  'tasks',
  'routines',
  'calendar',
  'allowance',
  'family_shop',
  'medals',
  'grades',
  'piggy_bank',
  'goals',
  'reports',
  'notifications',
  'shopping',
  'health',
  'mural',
];

/** Módulos premium: só com plano family/premium */
const PREMIUM_KEYS = new Set([
  'health',
  'mural',
  'reports',
  'shopping',
]);

/** Ao criar família: estes ficam ativos */
const DEFAULT_ENABLED = new Set(['tasks', 'routines', 'family_shop', 'medals']);

function isPremiumPlan(plan) {
  // O usuário solicitou a liberação temporária de todos os módulos
  return true;
}

module.exports = {
  MODULE_KEYS,
  PREMIUM_KEYS,
  DEFAULT_ENABLED,
  isPremiumPlan,
};
