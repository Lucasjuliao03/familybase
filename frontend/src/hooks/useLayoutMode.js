import { useState, useEffect } from 'react';

/** PWA instalado (Android/iOS/desktop). */
function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

/** Touch device (celular/tablet). */
function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  );
}

/**
 * Mobile shell = visual do app Expo (bottom nav, fundo lavanda, sem sidebar/header web).
 * Desktop shell = painel web com sidebar.
 */
export function queryMobileShell() {
  if (typeof window === 'undefined') return false;

  const html = document.documentElement;
  if (html.classList.contains('capacitor-native')) return true;

  if (window.matchMedia('(max-width: 768px)').matches) return true;

  if (isStandaloneDisplay() && isTouchDevice()) return true;

  return false;
}

export function useLayoutMode() {
  const [isMobileShell, setIsMobileShell] = useState(() => queryMobileShell());

  useEffect(() => {
    const update = () => setIsMobileShell(queryMobileShell());
    update();

    const mediaQueries = [
      '(max-width: 768px)',
      '(display-mode: standalone)',
      '(display-mode: fullscreen)',
      '(pointer: coarse)',
      '(hover: none)',
    ].map((q) => window.matchMedia(q));

    mediaQueries.forEach((mq) => mq.addEventListener('change', update));
    window.addEventListener('resize', update);

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mediaQueries.forEach((mq) => mq.removeEventListener('change', update));
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, []);

  return { isMobileShell, isDesktop: !isMobileShell };
}
