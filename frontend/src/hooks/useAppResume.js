import { useEffect, useRef } from 'react';

/** 1200 ms — debounce único ao voltar ao app (evitar disparos duplos de visibilitychange + focus). */
const DEBOUNCE_MS = 1200;

/**
 * Retomada global da PWA: debounce para visibility → visible, focus e online — mais
 * `pageshow` / `resume` quando o navegador reactiva tabs suspensas (BFCache/PWA/Android).
 * mutex em `resumeInFlightRef` e espera até `visibilityState === 'visible'` para correr callbacks.
 *
 * @param {{
 *   onResume: () => void | Promise<void>,
 *   enabled?: boolean,
 * }} opts
 */
export function useAppResume({ onResume, enabled = true }) {
  const onResumeRef = useRef(onResume);
  /** Evita dois `onResume` em paralelo mesmo com vários timers. */
  const resumeInFlightRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const lastResumeAt = useRef(0);

  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    const flush = async () => {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      if (document.visibilityState !== 'visible') return;
      if (resumeInFlightRef.current) return;

      // Evitar chamadas duplicadas em menos de 2s
      const now = Date.now();
      if (now - lastResumeAt.current < 2000) return;
      lastResumeAt.current = now;

      resumeInFlightRef.current = true;
      try {
        const fn = onResumeRef.current;
        if (typeof fn === 'function') await fn();
      } catch (e) {
        console.warn('[useAppResume]', e);
      } finally {
        resumeInFlightRef.current = false;
      }
    };

    const schedule = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(flush, DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') schedule();
    };

    /** `focus`: outra app → browser deixa de ter foco; ao voltar reforço após debounce único */
    const onFocus = schedule;
    /** `online`: rede voltou mantendo página visível */
    const onOnline = schedule;

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('resume', schedule);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', schedule);
      document.removeEventListener('resume', schedule);
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    };
  }, [enabled]);
}
