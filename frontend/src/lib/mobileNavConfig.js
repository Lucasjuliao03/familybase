/**
 * Abas inferiores alinhadas ao app Expo (`mobile/src/components/ui/BottomNavBar.tsx`).
 * Rotas usam paths do frontend web.
 */
export const PARENT_MOBILE_TABS = [
  { to: '/parent', end: true, label: 'Início', iconKey: 'dashboard', png: '/icons/mobile/home.png' },
  { to: '/parent/calendar', label: 'Calendário', iconKey: 'calendar', module: 'calendar', png: '/icons/mobile/calendario.png' },
  { to: '/parent/tasks', label: 'Tarefas', iconKey: 'tasks', module: 'tasks', png: '/icons/mobile/tarefas.png' },
  { to: '/parent/grades', label: 'Notas', iconKey: 'grades', module: 'grades', png: '/icons/mobile/notas.png' },
  { to: '/parent/allowance', label: 'Mesada', iconKey: 'allowance', anyOf: ['allowance', 'piggy_bank', 'goals'], png: '/icons/mobile/cofrinho.png' },
  { to: '/parent/family-shop', label: 'Loja', iconKey: 'family_shop', module: 'family_shop', png: '/icons/mobile/loja.png' },
  { to: '/parent/health', label: 'Saúde', iconKey: 'health', module: 'health', png: '/icons/mobile/saude.png' },
  { to: '/parent/mural', label: 'Mural', iconKey: 'mural', module: 'mural', png: '/icons/mobile/mural.png' },
  { to: '/parent/shopping', label: 'Compras', iconKey: 'shopping', module: 'shopping', png: '/icons/mobile/compras.png' },
  { to: '/parent/location', label: 'Localização', iconKey: 'location', module: 'location', png: '/icons/mobile/localizacao.png' },
  { to: '/parent/family-administration', label: 'Perfil', iconKey: 'settings', png: '/icons/mobile/perfil.png' },
];

export const CHILD_MOBILE_TABS = [
  { to: '/child', end: true, label: 'Início', key: 'dashboard', icon: '🏠', iconKey: 'dashboard', png: '/icons/mobile/home.png' },
  { to: '/child/tasks', label: 'Tarefas', key: 'my_tasks', icon: '✅', iconKey: 'tasks', module: 'tasks', png: '/icons/mobile/tarefas.png' },
  { to: '/child/grades', label: 'Notas', key: 'my_grades', icon: '📚', iconKey: 'grades', module: 'grades', png: '/icons/mobile/notas.png' },
  { to: '/child/allowance', label: 'Mesada', key: 'my_allowance', icon: '🐷', iconKey: 'allowance', anyOf: ['allowance', 'piggy_bank', 'goals'], png: '/icons/mobile/cofrinho.png' },
  { to: '/child/family-shop', label: 'Loja', key: 'nav_family_shop', icon: '🛍️', iconKey: 'family_shop', module: 'family_shop', png: '/icons/mobile/loja.png' },
  { to: '/child/calendar', label: 'Calendário', key: 'my_calendar', icon: '📅', iconKey: 'calendar', module: 'calendar', png: '/icons/mobile/calendario.png' },
  { to: '/child/health', label: 'Saúde', key: 'nav_health', icon: '❤️', iconKey: 'health', module: 'health', png: '/icons/mobile/saude.png' },
  { to: '/child/mural', label: 'Mural', key: 'nav_mural', icon: '📌', iconKey: 'mural', module: 'mural', png: '/icons/mobile/mural.png' },
  { to: '/child/shopping', label: 'Compras', key: 'nav_shopping', icon: '🛒', iconKey: 'shopping', module: 'shopping', png: '/icons/mobile/compras.png' },
  { to: '/child/location', label: 'Localização', key: 'nav_location', icon: '📍', iconKey: 'location', module: 'location', png: '/icons/mobile/localizacao.png' },
];

export function filterMobileTabs(tabs, modules, moduleAllowed, anyModuleAllowed) {
  return tabs.filter((tab) => {
    if (tab.anyOf) return anyModuleAllowed(modules, tab.anyOf);
    if (tab.module) return moduleAllowed(modules, tab.module);
    return true;
  });
}
