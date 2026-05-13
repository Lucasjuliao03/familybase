import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';

const PWAContext = createContext(null);

const VAPID_PUBLIC_KEY = 'BPuvpeJetZ5xTGhtFaN99Z926gYSPWeBlOLIrHJuH6kdJg_adS70Pco11g6ARIVfHHaDfltxde99-zbsjHN32sc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PWAProvider({ children }) {
  const [swRegistration, setSwRegistration] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    'Notification' in window ? Notification.permission : 'denied'
  );
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const subscribedRef = useRef(false);

  // Register Service Worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        setSwRegistration(reg);
        setSwReady(true);
        console.log('[PWA] Service Worker registered:', reg.scope);

        // Check if already subscribed
        reg.pushManager?.getSubscription().then((sub) => {
          setIsPushSubscribed(!!sub);
        });
      })
      .catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
  }, []);

  // Catch install prompt event
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Check if already installed (standalone mode)
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsInstalled(mq.matches || window.navigator.standalone === true);
    const handler = (e) => setIsInstalled(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Prompt install
  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
    return outcome === 'accepted';
  }, [installPrompt]);

  // Request notification permission + subscribe to push
  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (subscribedRef.current) return true;

    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== 'granted') return false;

      if (!swRegistration) return false;

      // Subscribe to push
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Send subscription to backend
      await api.post('/push/subscribe', { subscription: sub.toJSON() });
      setIsPushSubscribed(true);
      subscribedRef.current = true;
      return true;
    } catch (err) {
      console.warn('[PWA] Push subscribe failed:', err);
      return false;
    }
  }, [swRegistration]);

  // Unsubscribe from push
  const unsubscribeNotifications = useCallback(async () => {
    if (!swRegistration) return;
    const sub = await swRegistration.pushManager.getSubscription();
    if (sub) {
      await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
      setIsPushSubscribed(false);
      subscribedRef.current = false;
    }
  }, [swRegistration]);

  // Send test notification
  const sendTestNotification = useCallback(async () => {
    try {
      await api.post('/push/test');
    } catch (err) {
      console.error('[PWA] Test notification failed:', err);
    }
  }, []);

  const value = {
    swReady,
    isInstalled,
    canInstall: !!installPrompt && !isInstalled,
    promptInstall,
    notifPermission,
    isPushSubscribed,
    requestNotifications,
    unsubscribeNotifications,
    sendTestNotification,
  };

  return <PWAContext.Provider value={value}>{children}</PWAContext.Provider>;
}

export function usePWA() {
  return useContext(PWAContext);
}
