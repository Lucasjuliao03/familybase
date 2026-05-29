import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/** Ajustes visuais e plugins nativos (Android/iOS). */
export async function initCapacitorNative() {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('capacitor-native');
  document.documentElement.lang = 'pt-BR';

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#1e3a5f' });
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* plugin opcional em web */
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }

  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch {
    /* ignore */
  }
}
