import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { setApplyProdPwaUpdate } from './lib/pwaUpdate';
import { initCapacitorNative, isNativeApp } from './lib/capacitorNative';

if (import.meta.env.PROD && !isNativeApp()) {
  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('pwa:update-available'));
    },
    onOfflineReady() {},
  });
  setApplyProdPwaUpdate(() => updateSW(true));
}

initCapacitorNative().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
