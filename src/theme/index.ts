// ─── FAMÍLIA EM HARMONIA — Design System ───────────────────────────────────
// Paleta, espaçamentos, raios, sombras e tipografia

export const Colors = {
  // ── Primário (roxo vibrante)
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryLighter: '#EDE9FE',
  primaryDark: '#5B21B6',

  // ── Gradiente do header
  gradStart: '#5B21B6',
  gradMid:   '#7C3AED',
  gradEnd:   '#818CF8',

  // ── Acentos
  blue:        '#60A5FA',
  blueLight:   '#DBEAFE',
  teal:        '#2DD4BF',
  tealLight:   '#F0FDFA',
  tealMid:     '#99F6E4',
  pink:        '#F472B6',
  pinkLight:   '#FDF2F8',
  yellow:      '#FBBF24',
  yellowLight: '#FFFBEB',
  green:       '#22C55E',
  greenLight:  '#F0FDF4',
  greenMid:    '#86EFAC',

  // ── Neutros
  white:       '#FFFFFF',
  bg:          '#F5F4FF',
  surface:     '#FFFFFF',
  border:      '#EDE9FE',
  borderLight: '#F5F3FF',

  // ── Texto
  text:          '#1E0B4B',
  textSecondary: '#6B6B8A',
  textMuted:     '#9E9EBA',
  textWhite:     '#FFFFFF',

  // ── Status
  success: '#22C55E',
  warning: '#F59E0B',
  danger:  '#EF4444',
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 16,
    elevation: 6,
  },
  lg: {
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  btn: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 14,
    elevation: 10,
  },
} as const;

export const Radii = {
  xs:   6,
  sm:   10,
  md:   16,
  lg:   24,
  xl:   32,
  full: 9999,
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const FontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  xxl:  30,
  xxxl: 38,
} as const;
