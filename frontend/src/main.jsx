import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import LandingPage from './pages/public/LandingPage';
import AuthenticatedEntry from './components/web/AuthenticatedEntry';
import './styles/index.css';
import { setApplyProdPwaUpdate, markProdPwaUpdateAvailable } from './lib/pwaUpdate';
import { queryMobileShell } from './hooks/useLayoutMode';
const isLegacyCapacitor = import.meta.env.MODE === 'capacitor';
const isPublicLanding = window.location.pathname === '/' && !isLegacyCapacitor;

if (queryMobileShell()) {
  document.documentElement.classList.add('mobile-shell');
}

if (import.meta.env.PROD && !isLegacyCapacitor) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (isPublicLanding) updateSW(true);
      else markProdPwaUpdateAvailable();
    },
    onOfflineReady() {},
  });
  setApplyProdPwaUpdate(() => updateSW(true));
}

const content = (
  <React.StrictMode>
    {isPublicLanding ? <LandingPage /> : <AuthenticatedEntry />}
  </React.StrictMode>
);
const root = document.getElementById('root');
if (isPublicLanding && root.hasChildNodes()) ReactDOM.hydrateRoot(root, content);
else ReactDOM.createRoot(root).render(content);

// Removed at build time from the browser bundle. Unrelated to the Expo app.
if (isLegacyCapacitor) {
  import('./platform/legacy-capacitor/bootstrap').then(module => module.initialize()).catch(() => {});
}
