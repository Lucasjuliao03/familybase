import { useState, useEffect } from 'react';
import { usePWA } from '../contexts/PWAContext';

export default function PWAInstallBanner() {
  const pwaCtx = usePWA();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa-banner-dismissed') === '1');
  const [notifDismissed, setNotifDismissed] = useState(() => localStorage.getItem('pwa-notif-dismissed') === '1');
  const [installing, setInstalling] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Auto-dismiss banner after install
  useEffect(() => {
    if (pwaCtx?.isInstalled) setDismissed(true);
  }, [pwaCtx?.isInstalled]);

  if (!pwaCtx) return null;
  const { canInstall, promptInstall, isInstalled, notifPermission, isPushSubscribed, requestNotifications, swReady } = pwaCtx;

  const handleInstall = async () => {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-banner-dismissed', '1');
  };

  const handleNotifDismiss = () => {
    setNotifDismissed(true);
    localStorage.setItem('pwa-notif-dismissed', '1');
  };

  const handleEnableNotifs = async () => {
    setSubscribing(true);
    const ok = await requestNotifications();
    setSubscribing(false);
    if (ok) {
      setNotifDismissed(true);
      localStorage.setItem('pwa-notif-dismissed', '1');
    }
  };

  const showInstallBanner = canInstall && !dismissed && !isInstalled;
  const showNotifBanner = swReady && !isPushSubscribed && notifPermission !== 'denied' && !notifDismissed && !showInstallBanner;

  if (!showInstallBanner && !showNotifBanner) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(420px, calc(100vw - 32px))',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(108,92,231,0.25)',
      padding: '16px 20px',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      backdropFilter: 'blur(12px)',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: 'linear-gradient(135deg, #6C5CE7, #a29bfe)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.6rem',
        flexShrink: 0,
      }}>
        {showInstallBanner ? '📲' : '🔔'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: 2 }}>
          {showInstallBanner ? 'Instalar FamilyBase' : 'Ativar Notificações'}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
          {showInstallBanner
            ? 'Adicione ao seu celular para acesso rápido, mesmo sem internet.'
            : 'Receba avisos de tarefas, compras e atualizações da família em tempo real.'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: 8 }}
          onClick={showInstallBanner ? handleInstall : handleEnableNotifs}
          disabled={installing || subscribing}
        >
          {installing || subscribing ? '...' : showInstallBanner ? 'Instalar' : 'Ativar'}
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: 8 }}
          onClick={showInstallBanner ? handleDismiss : handleNotifDismiss}
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
