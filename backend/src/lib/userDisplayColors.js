/**
 * Cores exclusivas para identidade visual de utilizadores adultos (pais/parentes).
 * Não usar para primary_color/secondary_color da família — essas são validadas à parte.
 */
const USER_DISPLAY_COLOR_PALETTE = [
  '#6C5CE7', '#E84393', '#00B894', '#FDCB6E', '#74B9FF', '#E17055', '#A29BFE', '#55EFC4',
  '#0984E3', '#FD79A8', '#636E72', '#D63031', '#00CEC9', '#F39C12', '#8E44AD', '#16A085',
  '#C0392B', '#2980B9', '#27AE60', '#F1C40F', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
];

function normalizeHex(color) {
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

function isInPalette(hex) {
  const n = normalizeHex(hex);
  return USER_DISPLAY_COLOR_PALETTE.some((c) => normalizeHex(c) === n);
}

function familyThemeColors(db, familyId) {
  const fam = db.prepare('SELECT primary_color, secondary_color FROM families WHERE id=?').get(familyId);
  const primary = normalizeHex(fam?.primary_color || '');
  const secondary = normalizeHex(fam?.secondary_color || '');
  return { primary, secondary };
}

function colorConflictsWithFamily(hex, familyId, db) {
  const { primary, secondary } = familyThemeColors(db, familyId);
  const n = normalizeHex(hex);
  if (!n) return true;
  if (primary && n === primary) return true;
  if (secondary && n === secondary) return true;
  return false;
}

function isUserColorTaken(db, familyId, hex, excludeUserId) {
  const n = normalizeHex(hex);
  if (!n) return false;
  const row = db.prepare(`
    SELECT id FROM users
    WHERE family_id = ?
      AND role IN ('parent', 'relative', 'master')
      AND display_color IS NOT NULL
      AND TRIM(display_color) != ''
      AND UPPER(TRIM(display_color)) = ?
      AND id != ?
    LIMIT 1
  `).get(familyId, n, excludeUserId || '');
  return !!row;
}

/** Valida e normaliza cor de utilizador; lança Error com mensagem em PT */
function assertValidUserDisplayColor(db, familyId, hex, excludeUserId) {
  const n = normalizeHex(hex);
  if (!n) throw new Error('Selecione uma cor');
  if (!isInPalette(hex)) throw new Error('Cor inválida: use uma das cores da paleta');
  if (colorConflictsWithFamily(n, familyId, db)) {
    throw new Error('Esta cor está reservada à identidade da família (cores principal ou secundária). Escolha outra.');
  }
  if (isUserColorTaken(db, familyId, n, excludeUserId)) {
    throw new Error('Outro utilizador já usa esta cor. Cada responsável deve ter uma cor diferente.');
  }
  return n;
}

function pickFirstAvailableUserColor(db, familyId, excludeUserId) {
  const { primary, secondary } = familyThemeColors(db, familyId);
  for (const c of USER_DISPLAY_COLOR_PALETTE) {
    const n = normalizeHex(c);
    if (primary && n === primary) continue;
    if (secondary && n === secondary) continue;
    if (isUserColorTaken(db, familyId, n, excludeUserId)) continue;
    return n;
  }
  return normalizeHex(USER_DISPLAY_COLOR_PALETTE[0]);
}

module.exports = {
  USER_DISPLAY_COLOR_PALETTE,
  normalizeHex,
  isInPalette,
  assertValidUserDisplayColor,
  pickFirstAvailableUserColor,
  colorConflictsWithFamily,
  isUserColorTaken,
};
