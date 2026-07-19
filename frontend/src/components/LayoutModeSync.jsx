import { useEffect } from 'react';
import { useLayoutMode } from '../hooks/useLayoutMode';

/** Sincroniza `html.mobile-shell` para CSS global (PWA, celular, Capacitor). */
export default function LayoutModeSync() {
  const { isMobileShell } = useLayoutMode();

  useEffect(() => {
    document.documentElement.classList.toggle('mobile-shell', isMobileShell);
    document.documentElement.classList.toggle('desktop-shell', !isMobileShell);
    return () => {
      document.documentElement.classList.remove('mobile-shell', 'desktop-shell');
    };
  }, [isMobileShell]);

  return null;
}
