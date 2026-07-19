/** Ícones SVG do painel do responsável (sem emojis). */
const ICONS = {
  dashboard: (
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
  ),
  tasks: (
    <>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.75" fill="none" />
    </>
  ),
  grades: (
    <>
      <path d="M6 4h8l4 4v12H6V4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
      <path d="M14 4v4h4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
    </>
  ),
  allowance: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M3 11h18" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="15" r="1.5" fill="currentColor" />
    </>
  ),
  family_shop: (
    <>
      <path d="M6 8 7.5 4h9L18 8" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
      <path d="M6 8h12v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  health: (
    <path d="M12 20s-6-4.2-6-9a4 4 0 0 1 7-2.4A4 4 0 0 1 18 11c0 4.8-6 9-6 9Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
  ),
  mural: (
    <>
      <path d="M8 4h8v16H8V4Z" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  shopping: (
    <>
      <circle cx="9" cy="20" r="1.5" fill="currentColor" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" />
      <path d="M3 4h2l2.5 11h11l2-7H7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.75" fill="none" />
    </>
  ),
  reports: (
    <>
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" />
      <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  bell: (
    <>
      <path d="M15 17H9a3 3 0 0 0 6 0Z" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  add: (
    <>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  approval: (
    <path d="M7 12l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  pending: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  completed: (
    <>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" fill="none" />
    </>
  ),
  clipboard: (
    <>
      <rect x="7" y="4" width="10" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M9 4.5h6a1 1 0 0 1 1 1V7H8V5.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.75" fill="none" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" fill="none" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  star: (
    <path d="m12 4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.2l5-.7L12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
  ),
  streak: (
    <path d="M12 3c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-3.5 2.5-5 4-8Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
  ),
  points: (
    <path d="m12 4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.2l5-.7L12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
  ),
};

export default function ParentNavIcon({ name, size = 20, className = '' }) {
  const content = ICONS[name] || ICONS.dashboard;
  return (
    <svg
      className={`parent-nav-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      {content}
    </svg>
  );
}

export { ICONS as PARENT_ICON_NAMES };
