/** Utilitários de intervalo/data para o calendário (timezone local). */

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatLocalYMD(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

export function todayLocalYMD() {
  return formatLocalYMD(new Date());
}

export function normalizeAnchorMidday(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return new Date();
  x.setHours(12, 0, 0, 0);
  return x;
}

/** Lista de YYYY-MM-DD entre from e to (inclusive), timezone local */
export function datesBetweenInclusive(fromStr, toStr) {
  if (!fromStr || !toStr || fromStr.length < 10 || toStr.length < 10) return [];
  const [yf, mf, df] = fromStr.slice(0, 10).split('-').map(Number);
  const [yt, mt, dt] = toStr.slice(0, 10).split('-').map(Number);
  if (!yf || !mf || !df || !yt || !mt || !dt) return [];
  const out = [];
  const cur = new Date(yf, mf - 1, df);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(yt, mt - 1, dt);
  end.setHours(12, 0, 0, 0);
  while (cur <= end) {
    out.push(formatLocalYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** @param {'month' | 'week' | 'day'} viewMode */
export function deriveCalendarRange(viewMode, anchorDate) {
  const a = new Date(anchorDate);
  if (Number.isNaN(a.getTime())) return { from: '', to: '' };
  a.setHours(12, 0, 0, 0);
  const y = a.getFullYear();
  const m = a.getMonth();
  const d = a.getDate();
  if (viewMode === 'month') {
    const from = `${y}-${pad2(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${pad2(m + 1)}-${pad2(lastDay)}`;
    return { from, to };
  }
  if (viewMode === 'week') {
    const wd = new Date(y, m, d);
    const dowMonday0 = (wd.getDay() + 6) % 7;
    const start = new Date(wd);
    start.setDate(start.getDate() - dowMonday0);
    start.setHours(12, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: formatLocalYMD(start), to: formatLocalYMD(end) };
  }
  const one = `${y}-${pad2(m + 1)}-${pad2(d)}`;
  return { from: one, to: one };
}

/** @param {number} delta -1 anterior, +1 próximo */
export function navigateAnchor(viewMode, anchorDate, delta) {
  const a = new Date(anchorDate);
  if (Number.isNaN(a.getTime())) return new Date();
  a.setHours(12, 0, 0, 0);
  if (viewMode === 'month') {
    return new Date(a.getFullYear(), a.getMonth() + delta, 1);
  }
  if (viewMode === 'week') {
    const n = new Date(a);
    n.setDate(n.getDate() + delta * 7);
    return n;
  }
  const n = new Date(a);
  n.setDate(n.getDate() + delta);
  return n;
}
