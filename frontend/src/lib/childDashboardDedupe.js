import { formatLocalYMD } from './familyCalendarRange';

/** Data local YYYY-MM-DD (atalho único para o dashboard). */
export function childDashboardTodayYMD() {
  return formatLocalYMD(new Date());
}

/** Elimina linhas repetidas pela mesma ocorrência (id). */
export function dedupeOccurrencesById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const id = r?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

/**
 * Agrupa várias “Arrumar cama” com task_id diferentes (tarefas duplicadas criadas pela família).
 * Mantém apenas uma linha por (data + título normalizado).
 */
export function dedupeOccurrencesByDayAndTitle(rows) {
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

/**
 * Chave lógica “uma conquista = uma medalha”: tipo de requisito + limiar normalizado + grupo.
 * Sem requirement_type na definição, cai no nome normalizado (legado).
 */
export function normalizedMedalDedupeKey(m) {
  if (!m) return '';
  const rt = String(m.requirement_type || '').trim().toLowerCase();
  const mg = String(m.medal_group || '').trim().toLowerCase();
  if (!rt) {
    const name = String(m.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return name ? `name:${name}` : '';
  }
  let rv = Number(m.requirement_value);
  if (rt === 'task_count' || rt === 'task_streak') {
    if (!Number.isFinite(rv) || rv < 1) rv = 1;
  } else if (!Number.isFinite(rv)) {
    rv = 0;
  }
  return `req:${rt}|${rv}|${mg}`;
}

/**
 * Medalhas duplicadas na BD (vários UUIDs, mesma conquista) — mostra/atribui uma só.
 */
export function dedupeEarnedMedalsForDisplay(objs) {
  const seen = new Set();
  const out = [];
  for (const medal of objs || []) {
    const k = normalizedMedalDedupeKey(medal);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(medal);
  }
  return out;
}

/** Ordena defs da família antes das globais; depois a mais antiga — para escolher canónica por conquista. */
export function dedupeMedalsForAwardingCatalog(medals) {
  const sorted = [...(medals || [])].sort((a, b) => {
    const fa = a.family_id ? 1 : 0;
    const fb = b.family_id ? 1 : 0;
    if (fb !== fa) return fb - fa;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  const seen = new Set();
  const out = [];
  for (const m of sorted) {
    const k = normalizedMedalDedupeKey(m);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}
