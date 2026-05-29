export const USER_DISPLAY_COLOR_PALETTE = [
  '#6C5CE7', '#E84393', '#00B894', '#FDCB6E', '#74B9FF', '#E17055', '#A29BFE', '#55EFC4',
  '#0984E3', '#FD79A8', '#636E72', '#D63031', '#00CEC9', '#F39C12', '#8E44AD', '#16A085',
  '#C0392B', '#2980B9', '#27AE60', '#F1C40F', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
];

export function normalizeHex(color: any): string {
  if (color == null || String(color).trim() === '') return '';
  let s = String(color).trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    s = `#${r}${r}${g}${g}${b}${b}`;
  }
  return s.toUpperCase();
}

interface SwatchOptions {
  primary?: string;
  secondary?: string;
  excludeUserId?: string;
  adultMembers?: Array<{ id: string; display_color?: string }>;
}

export function isUserDisplaySwatchDisabled(hex: string, { primary, secondary, excludeUserId, adultMembers }: SwatchOptions): boolean {
  const n = normalizeHex(hex);
  if (!n) return true;
  const p = normalizeHex(primary || '');
  const s = normalizeHex(secondary || '');
  if (p && n === p) return true;
  if (s && n === s) return true;
  for (const m of adultMembers || []) {
    if (excludeUserId != null && String(m.id) === String(excludeUserId)) continue;
    const mc = normalizeHex(m.display_color || '');
    if (mc && mc === n) return true;
  }
  return false;
}

export function pickFirstAvailableUserDisplayColor({ primary, secondary, excludeUserId, adultMembers }: SwatchOptions): string {
  for (const c of USER_DISPLAY_COLOR_PALETTE) {
    if (!isUserDisplaySwatchDisabled(c, { primary, secondary, excludeUserId, adultMembers })) {
      return normalizeHex(c);
    }
  }
  return normalizeHex(USER_DISPLAY_COLOR_PALETTE[0]);
}

export function calendarEventAccentColor(ev: any): string {
  if (!ev) return '#7C3AED';
  return ev.color || ev.child_color || ev.creator_color || '#7C3AED';
}
