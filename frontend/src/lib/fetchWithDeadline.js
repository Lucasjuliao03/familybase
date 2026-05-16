/** Tempo máximo por pedido HTTP antes de Abort (evita aba suspensa/conexões zombie). */
const DEFAULT_DEADLINE_MS =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_FETCH_DEADLINE_MS
    ? Number(import.meta.env.VITE_FETCH_DEADLINE_MS)
    : 38_000;

/**
 * Igual ao fetch habitual, mas com `cache: 'no-store'` e abort após deadline.
 * Liga o sinal herdado (Supabase pode passar `signal`) ao timeout.
 */
export function fetchNoStoreWithDeadline(input, options = {}) {
  const merged = typeof options === 'object' && options !== null ? { ...options } : {};
  if (merged.cache == null) merged.cache = 'no-store';

  const parentSignal = merged.signal;
  const deadlineMs = Number.isFinite(merged.deadlineMs) ? merged.deadlineMs : DEFAULT_DEADLINE_MS;

  const controller = new AbortController();
  let tid = null;

  const clearTimer = () => {
    if (tid != null) {
      clearTimeout(tid);
      tid = null;
    }
  };

  if (deadlineMs > 0) {
    tid = setTimeout(() => {
      clearTimer();
      if (!controller.signal.aborted) {
        controller.abort(new DOMException(`fetch_deadline_${deadlineMs}`, 'AbortError'));
      }
    }, deadlineMs);
  }

  if (parentSignal) {
    const onParentAbort = () => {
      clearTimer();
      if (!controller.signal.aborted) {
        controller.abort(parentSignal.reason);
      }
    };
    if (parentSignal.aborted) {
      onParentAbort();
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  return fetch(input, { ...merged, signal: controller.signal }).finally(() => {
    clearTimer();
  });
}

/** Alias (mesma função) — nome curto onde se assume `no-store` + deadline. */
export function fetchNoStore(...args) {
  return fetchNoStoreWithDeadline(...args);
}
