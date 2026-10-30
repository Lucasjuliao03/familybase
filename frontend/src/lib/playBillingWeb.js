export const PLAY_PACKAGE = 'com.familybase.mobile';
export const PLAY_PRODUCT = 'tudodefamilia_premium';
export const PLAY_APP_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
export const PLAY_MANAGE_URL = `https://play.google.com/store/account/subscriptions?sku=${PLAY_PRODUCT}&package=${PLAY_PACKAGE}`;
export function subscriptionDestination(user, entitlement) {
  if (!user) return '/login';
  if (user.role === 'master') return '/master';
  if (entitlement?.has_access === true) return user.role === 'child' ? '/child' : '/parent';
  return entitlement?.can_manage_billing === true ? '/subscribe' : '/billing-wait-gestor';
}
export function playStatusLabel(entitlement) {
  const labels = { active: 'Assinatura ativa', grace_period: 'Período de carência', cancelled: 'Renovação cancelada', on_hold: 'Pagamento precisa de atenção', paused: 'Assinatura pausada', pending: 'Compra aguardando confirmação', expired: 'Assinatura expirada', trial: 'Período de experiência' };
  return labels[entitlement?.subscription_status] || 'Verifique a assinatura da família';
}
