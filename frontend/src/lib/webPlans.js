// Valores de apresentação definidos pelo proprietário. Google Play confirma a cobrança.
export const DEFAULT_WEB_PLANS = [
  { code: 'premium_mensal', label: 'Mensal', regular_price:39.90, display_price:19.90, interval: '/mês', description: 'Flexibilidade para a rotina da sua família.', enabled: true, features: ['Todos os módulos', 'Acesso web e aplicativo', 'Perfis e permissões da família'] },
  { code: 'premium_anual', label: 'Anual', regular_price:478.80, display_price:199.00, interval: '/ano', description: 'Mais organização durante o ano inteiro.', enabled: true, features: ['Todos os módulos', 'Acesso web e aplicativo', 'Perfis e permissões da família'], featured: true },
];
export const formatBRL = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export function displayPrice(plan) {
  return Number(plan.display_price ?? DEFAULT_WEB_PLANS.find(p=>p.code===plan.code)?.display_price);
}
export function planPromotion(plan) {
  // Null explicitly removes an offer; undefined supports catalog versions before the migration.
  const reference = plan.regular_price === undefined
    ? DEFAULT_WEB_PLANS.find(p=>p.code===plan.code)?.regular_price : plan.regular_price;
  const regular = Math.round(Number(reference) * 100);
  const current = Math.round(displayPrice(plan) * 100);
  if (!Number.isFinite(regular) || !Number.isFinite(current) || current <= 0 || regular <= current) return null;
  return { regularPrice: regular / 100, saving: (regular - current) / 100, percent: Math.floor((regular - current) * 100 / regular) };
}
export function annualSaving(plans) {
  const monthly=plans.find(p=>p.code==='premium_mensal'&&p.enabled);
  const annual=plans.find(p=>p.code==='premium_anual'&&p.enabled);
  if(!monthly||!annual)return 0;
  return Math.max(0,(Math.round(displayPrice(monthly)*100)*12-Math.round(displayPrice(annual)*100))/100);
}
