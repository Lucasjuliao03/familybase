import { formatLocalYMD } from './familyCalendarRange';

export function childDashboardTodayYMD(): string {
  return formatLocalYMD(new Date());
}

export function dedupeOccurrencesById(rows: any[]): any[] {
  const seen = new Set();
  const out: any[] = [];
  for (const r of rows || []) {
    const id = r?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export function dedupeOccurrencesByDayAndTitle(rows: any[]): any[] {
  const m = new Map();
  for (const r of rows || []) {
    const day = r.occurrence_date || '';
    const t = String(r.title || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const k = `${day}|||${t}`;
    if (!m.has(k)) m.set(k, r);
  }
  return [...m.values()];
}

export function canonicalMedalRequirementType(rt: string): string {
  const x = String(rt || '').trim().toLowerCase();
  switch (x) {
    case 'tasks_completed':
      return 'task_count';
    case 'streak':
      return 'task_streak';
    case 'first_reward':
      return 'reward_redemptions';
    case 'allowance_goal':
      return 'allowance_paid_cycles';
    default:
      return x;
  }
}

export function normalizedMedalDedupeKey(m: any): string {
  if (!m) return '';
  const rtRaw = String(m.requirement_type || '').trim().toLowerCase();
  const crt = canonicalMedalRequirementType(rtRaw);
  const mg = String(m.medal_group || '').trim().toLowerCase();
  if (crt === 'custom') {
    const name = String(m.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return name ? `custom:${name}|${mg}` : '';
  }
  if (!rtRaw) {
    const name = String(m.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return name ? `name:${name}` : '';
  }
  let rv = Number(m.requirement_value);
  if (
    crt === 'task_count' ||
    crt === 'task_streak' ||
    crt === 'perfect_grade' ||
    crt === 'reward_redemptions' ||
    crt === 'allowance_paid_cycles'
  ) {
    if (!Number.isFinite(rv) || rv < 1) rv = 1;
  } else if (crt === 'points_goal') {
    if (!Number.isFinite(rv) || rv < 1) rv = 1;
  } else if (!Number.isFinite(rv)) {
    rv = 0;
  }
  return `req:${crt}|${rv}|${mg}`;
}

export function dedupeEarnedMedalsForDisplay(objs: any[]): any[] {
  const seen = new Set();
  const out: any[] = [];
  for (const medal of objs || []) {
    const k = normalizedMedalDedupeKey(medal);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(medal);
  }
  return out;
}

export function dedupeMedalsForAwardingCatalog(medals: any[]): any[] {
  const sorted = [...(medals || [])].sort((a, b) => {
    const fa = a.family_id ? 1 : 0;
    const fb = b.family_id ? 1 : 0;
    if (fb !== fa) return fb - fa;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  const seen = new Set();
  const out: any[] = [];
  for (const m of sorted) {
    const k = normalizedMedalDedupeKey(m);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}
