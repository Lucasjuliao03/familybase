import { supabase } from '../supabase';
import type { UserProfile } from '../../contexts/AuthContext';

/** Converte "DD/MM/AAAA" → "AAAA-MM-DD" (ou null se inválida). */
export function toISODate(masked: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export function yearsSince(iso: string): number {
  const dob = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Máscara progressiva de data DD/MM/AAAA. */
export function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 4);
  const p3 = digits.slice(4, 8);
  let out = p1;
  if (p2) out += '/' + p2;
  if (p3) out += '/' + p3;
  return out;
}

export const COLOR_PRESETS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];
export const GUARDIAN_EMOJI_PRESETS = ['👩', '👨', '🧔', '👩‍🦰', '👨‍🦱', '🧑', '👵', '👴'];

export const SUGGESTED_TASKS = [
  { id: 't1', emoji: '🛏️', titleKey: 'taskBed', descKey: 'taskBedDesc', points: 10, bonus: 0.5 },
  { id: 't2', emoji: '🦷', titleKey: 'taskTeeth', descKey: 'taskTeethDesc', points: 5, bonus: 0.2 },
  { id: 't3', emoji: '📚', titleKey: 'taskHomework', descKey: 'taskHomeworkDesc', points: 20, bonus: 1.0 },
  { id: 't4', emoji: '🗑️', titleKey: 'taskTrash', descKey: 'taskTrashDesc', points: 10, bonus: 0.5 },
  { id: 't5', emoji: '🍽️', titleKey: 'taskDishes', descKey: 'taskDishesDesc', points: 15, bonus: 0.8 },
] as const;

export const FEATURE_KEYS = [
  'tasks', 'allowance', 'grades', 'location', 'shopping', 'mural', 'stats',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface LocalChild {
  id: string;
  name: string;
  nickname?: string;
  birthday?: string;
  age?: number;
  color: string;
  emoji?: string;
  avatar_preset?: string;
  hasPhone: boolean;
}

export interface LocalGuardian {
  name: string;
  email: string;
  role: 'gestor' | 'auxiliar';
  emoji?: string;
}

export async function logOnboardingAudit(
  user: UserProfile | null,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: user?.id ?? null,
      role: user?.role ?? null,
      module: 'onboarding',
      action,
      description: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[Onboarding] audit log failed:', err);
  }
}
