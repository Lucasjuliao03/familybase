import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Invoca dados ao mudar rota e, com throttle, ao voltar à aba, foco ou rede (online).
 *
 * Mudanças de `pathname` / `search` NUNCA passam pelo throttle (evita módulos vazios ao navegar rápido entre itens do menu).
 *
 * @param {() => void} callback — idempotente
 * @param {number} [throttleMs=2500] — só ciclo de vida (aba/foco/rede), não navegação
 * @param {{ includeRouteChanges?: boolean }} [opts] — includeRouteChanges default true (defina false quando outro useEffect gere o carregamento na rota, ex.: dependência childProfile).
 */
export default function useAutoRefresh(callback, throttleMs = 2500, opts = {}) {
  const { includeRouteChanges = true } = opts;
  const location = useLocation();
  const cbRef = useRef(callback);
  const lastThrottledRunRef = useRef(0);

  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const throttledLifecycleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottledRunRef.current < throttleMs) return;
    lastThrottledRunRef.current = now;
    try {
      cbRef.current?.();
    } catch {
      /* engole para não partir o ciclo React */
    }
  }, [throttleMs]);

  /** Ao entrar no módulo / mudar query (sem throttle). Opcional quando o ecrã já tem useEffect próprio. */
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
      if (document.visibilityState === 'visible') throttledLifecycleRefresh();
    };
    const onFocus = () => throttledLifecycleRefresh();
    const onOnline = () => throttledLifecycleRefresh();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [throttledLifecycleRefresh]);
}
