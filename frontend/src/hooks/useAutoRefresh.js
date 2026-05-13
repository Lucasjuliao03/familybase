import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * useAutoRefresh — invoca `callback` automaticamente em três eventos:
 *  1. Quando a rota muda (montagem inicial e mudança de pathname)
 *  2. Quando a aba volta a estar visível (visibilitychange → visible)
 *  3. Quando a janela ganha foco (window focus)
 *
 * Útil para garantir que dashboards/listas estão sempre actualizados sem
 * F5 manual do utilizador.
 *
 * @param {() => void} callback   — função de refresh (idempotente)
 * @param {number} [throttleMs=2000] — não chama mais que uma vez por janela
 */
export default function useAutoRefresh(callback, throttleMs = 2000) {
  const location = useLocation();
  const cbRef = useRef(callback);
  const lastRunRef = useRef(0);

  // Mantém o ref do callback sempre actualizado
  useEffect(() => { cbRef.current = callback; }, [callback]);

  const trigger = () => {
    const now = Date.now();
    if (now - lastRunRef.current < throttleMs) return;
    lastRunRef.current = now;
    try { cbRef.current?.(); } catch { /* engole */ }
  };

  // 1. ao mudar de rota
  useEffect(() => { trigger(); }, [location.pathname, location.search]);

  // 2. quando a aba volta a estar visível + 3. window focus
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') trigger(); };
    const onFocus = () => trigger();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
