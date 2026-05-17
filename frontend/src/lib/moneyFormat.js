/** Rótulo de moeda na UI — BRL aparece sempre como «R$». */
export function allowanceCurrencyLabel(currency) {
  const c = String(currency ?? '').trim().toUpperCase();
  if (!c || c === 'BRL') return 'R$';
  if (c === 'USD') return 'US$';
  return String(currency || '').trim() || 'R$';
}

export function fmtMoney(currency, value) {
  const sym = allowanceCurrencyLabel(currency);
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return `${sym} 0.00`;
  return `${sym} ${n.toFixed(2)}`;
}
