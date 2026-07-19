import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { setApplyProdPwaUpdate } from './lib/pwaUpdate';
import { initCapacitorNative, isNativeApp } from './lib/capacitorNative';
import { queryMobileShell } from './hooks/useLayoutMode';
import { BootErrorBoundary, SupabaseBootNotice } from './components/BootGuard';

if (queryMobileShell()) {
  document.documentElement.classList.add('mobile-shell');
}

if (import.meta.env.PROD && !isNativeApp()) {
  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('pwa:update-available'));
    },
    onOfflineReady() {},
  });
  setApplyProdPwaUpdate(() => updateSW(true));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <App />
      <SupabaseBootNotice />
    </BootErrorBoundary>
  </React.StrictMode>,
);

initCapacitorNative().catch(() => {});
