// Navigation contracts shared by browser layouts and the archived Capacitor shell.
export const PARENT_NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/parent', iconKey: 'dashboard', label: null, key: 'dashboard', end: true },
      { to: '/parent/tasks', iconKey: 'tasks', label: null, key: 'tasks', module: 'tasks' },
      { to: '/parent/grades', iconKey: 'grades', label: null, key: 'grades', module: 'grades' },
      { to: '/parent/allowance', iconKey: 'allowance', label: null, key: 'nav_allowance', anyOf: ['allowance', 'piggy_bank', 'goals'] },
    ],
  },
  {
    label: 'Módulos',
    items: [
      { to: '/parent/family-shop', iconKey: 'family_shop', label: null, key: 'nav_family_shop', module: 'family_shop' },
      { to: '/parent/calendar', iconKey: 'calendar', label: null, key: 'calendar', module: 'calendar' },
      { to: '/parent/health', iconKey: 'health', label: null, key: 'nav_health', module: 'health' },
      { to: '/parent/mural', iconKey: 'mural', label: null, key: 'nav_mural', module: 'mural' },
      { to: '/parent/shopping', iconKey: 'shopping', label: null, key: 'nav_shopping', module: 'shopping' },
      { to: '/parent/location', iconKey: 'location', label: null, key: 'nav_location', module: 'location' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/parent/reports', iconKey: 'reports', label: null, key: 'reports', module: 'reports' },
      { to: '/parent/family-administration', iconKey: 'settings', label: null, key: 'fam_admin_nav' },
    ],
  },
];
export const CHILD_NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/child', icon: '🏠', label: null, key: 'dashboard', end: true },
      { to: '/child/tasks', icon: '✅', label: null, key: 'my_tasks', module: 'tasks' },
      { to: '/child/grades', icon: '📚', label: null, key: 'my_grades', module: 'grades' },
      { to: '/child/allowance', icon: '💰', label: null, key: 'my_allowance', anyOf: ['allowance', 'piggy_bank', 'goals'] },
    ],
  },
  {
    label: 'Explorar',
    items: [
      { to: '/child/family-shop', icon: '🛍️', label: null, key: 'nav_family_shop', module: 'family_shop' },
      { to: '/child/calendar', icon: '📅', label: null, key: 'my_calendar', module: 'calendar' },
      { to: '/child/health', icon: '❤️', label: null, key: 'nav_health', module: 'health' },
      { to: '/child/mural', icon: '📌', label: null, key: 'nav_mural', module: 'mural' },
      { to: '/child/shopping', icon: '🛒', label: null, key: 'nav_shopping', module: 'shopping' },
      { to: '/child/location', icon: '📍', label: null, key: 'nav_location', module: 'location' },
    ],
  },
];
