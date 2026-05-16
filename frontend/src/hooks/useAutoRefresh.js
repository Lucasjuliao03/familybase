import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FAMILIA_CONTROLLED_RESUME } from '../lib/appResumeEvents';

/**
 * - Ao mudar rota (`pathname` / `search`): uma chamada ao callback do ecrã.
 * - Ao retomar a app: **uma** rodada quando o Auth dispara `familia-controlled-resume`
 *   (não duplica listeners de visibility/focus aqui → evita centenas de pedidos).
 *
 * O parâmetro `throttleMs` mantém‑se apenas por compatibilidade com chamadas antigas e é ignorado.
 *
 * @param {() => void} callback idempotente
 * @param {number} [_throttleMs]
 * @param {{ includeRouteChanges?: boolean }} [opts]
 */
export default function useAutoRefresh(callback, _throttleMs = 2500, opts = {}) {
  const { includeRouteChanges = true } = opts;
  const location = useLocation();
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  /** Refetch apenas ao navegar dentro da SPA (sem gate global duplicado). */
  useEffect(() => {
    if (!includeRouteChanges) return undefined;
    try {
      cbRef.current?.();
    } catch {
      /* noop */
    }
    return undefined;
  }, [location.pathname, location.search, includeRouteChanges]);

  useEffect(() => {
    const onControlled = () => {
      try {
        cbRef.current?.();
      } catch {
        /* noop */
      }
    };

    window.addEventListener(FAMILIA_CONTROLLED_RESUME, onControlled);
    return () => {
      window.removeEventListener(FAMILIA_CONTROLLED_RESUME, onControlled);
    };
  }, []);
}
