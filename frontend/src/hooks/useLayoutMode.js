/**
 * Browser/PWA always uses responsive web layouts, including on a phone.
 * Only an explicit archived Capacitor build uses the legacy shell.
 * The production Expo app has independent layouts in /mobile.
 */
export function queryMobileShell() {
  return import.meta.env.MODE === 'capacitor';
}

export function useLayoutMode() {
  const isMobileShell = queryMobileShell();
  return { isMobileShell, isDesktop: !isMobileShell };
}
