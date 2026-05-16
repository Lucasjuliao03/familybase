import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

function dispatchResumeEvent() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('familia-app-visible'));
  } catch {
    /* noop */
  }
}

/**
 * Invoca dados ao mudar rota e, com throttle, ao regressar ao foco / rede online.
 *
 * Ao voltar para a **aba** (`visibilitychange` → visible) o pedido corre **logo** —
 * sem esperar pela janela de throttle que deixaria a SPA vazia após suspensão do navegador.
 *
 * Mudanças de `pathname` / `search` NUNCA passam pelo throttle entre módulos.
 *
 * @param {() => void} callback — idempotente
 * @param {number} [throttleMs=2500] — foco/janela/online apenas
 * @param {{ includeRouteChanges?: boolean }} [opts]
 */
export default function useAutoRefresh(callback, throttleMs = 2500, opts = {}) {
  const { includeRouteChanges = true } = opts;
  const location = useLocation();
  const cbRef = useRef(callback);
  const lastThrottledRunRef = useRef(0);

  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const notifyResume = useCallback(() => {
    dispatchResumeEvent();
  }, []);

  const throttledLifecycleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottledRunRef.current < throttleMs) return;
    lastThrottledRunRef.current = now;
    try {
      cbRef.current?.();
    } catch {
      /* engole para não partir o ciclo React */
    }
    notifyResume();
  }, [throttleMs, notifyResume]);

  useEffect(() => {
    if (!includeRouteChanges) return;
    try {
      cbRef.current?.();
    } catch {
      /* idem */
    }
  }, [location.pathname, location.search, includeRouteChanges]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      /** Imediato: aba recuperada ≠ evento foco (evita esperar throttle). */
      lastThrottledRunRef.current = Date.now();
      try {
        cbRef.current?.();
      } catch {
        /* idem */
      }
      notifyResume();
    };
    /** Regressar à app sem troca visível estrita — reforço. */
    const onWindowFocus = () => throttledLifecycleRefresh();
    const onOnline = () => throttledLifecycleRefresh();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [throttledLifecycleRefresh, notifyResume]);
}
