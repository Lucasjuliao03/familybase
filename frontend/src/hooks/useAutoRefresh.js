import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ensureAuthResumeBeforeNetwork } from '../lib/authResumeCoordinator';

function dispatchResumeEvent() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('familia-app-visible'));
  } catch {
    /* noop */
  }
}

/**
 * Recarrega dados ao mudar rota (`pathname` / `search`) e ao regressar ao foco / rede.
 * Antes de cada callback de ciclo-de-vida, corre `ensureAuthResumeBeforeNetwork` (mesma fila que o `api.get`)
 * para não pedir dados com sessão/token ainda congelados após a aba ter estado em segundo plano.
 *
 * Mudanças de rota não passam pelo throttle de foco; o throttle limita apenas `focus` / `online` na mesma tela.
 *
 * @param {() => void} callback
 * @param {number} [throttleMs=2500]
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

  useEffect(() => {
    if (!includeRouteChanges) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        await ensureAuthResumeBeforeNetwork();
        if (!cancelled) cbRef.current?.();
      } catch {
        /* idem */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, includeRouteChanges]);

  useEffect(() => {
    const runAfterCoordinator = () => {
      try {
        cbRef.current?.();
      } catch {
        /* idem */
      }
      notifyResume();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      /** Imediato: aba recuperada ≠ evento foco (evita esperar throttle). */
      lastThrottledRunRef.current = Date.now();
      void (async () => {
        await ensureAuthResumeBeforeNetwork();
        runAfterCoordinator();
      })();
    };
    /** Regressar à app sem troca visível estrita — reforço. */
    const onWindowFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastThrottledRunRef.current < throttleMs) return;
      lastThrottledRunRef.current = now;
      void (async () => {
        await ensureAuthResumeBeforeNetwork();
        runAfterCoordinator();
      })();
    };
    const onOnline = () => onWindowFocus();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [throttleMs, notifyResume]);
}
