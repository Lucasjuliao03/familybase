import { useEffect, useRef } from 'react';

const DEBOUNCE_MS = 180;

/**
 * Reage ao regresso da PWA ao primeiro plano (aba, foco ou rede).
 * Escuta visibilitychange → visible, window focus, online, pageshow e document resume.
 *
 * @param {{
 *   onResume: () => void | Promise<void>,
 *   enabled?: boolean,
 * }} opts
 */
export function useAppResume({ onResume, enabled = true }) {
  const onResumeRef = useRef(onResume);
  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    let debTimer;

    const runWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(debTimer);
      debTimer = setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        const fn = onResumeRef.current;
        if (typeof fn !== 'function') return;
        Promise.resolve(fn()).catch((e) => console.warn('[useAppResume]', e));
      }, DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return;
      runWhenVisible();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', runWhenVisible);
    window.addEventListener('online', runWhenVisible);
    document.addEventListener('resume', runWhenVisible);
    window.addEventListener('pageshow', runWhenVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', runWhenVisible);
      window.removeEventListener('online', runWhenVisible);
      document.removeEventListener('resume', runWhenVisible);
      window.removeEventListener('pageshow', runWhenVisible);
      clearTimeout(debTimer);
    };
  }, [enabled]);
}
