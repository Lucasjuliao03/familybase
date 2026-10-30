/** Estado de instalação por provider; preserva a confirmação manual e os eventos do navegador. */
export function createPwaInstallationStore(browser = window) {
  let installed = false;
  let stopListening;
  const listeners = new Set();

  const setInstalled = (value) => {
    if (Object.is(installed, value)) return;
    installed = value;
    for (const listener of [...listeners]) listener();
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      const media = browser.matchMedia('(display-mode: standalone)');
      setInstalled(media.matches || browser.navigator.standalone === true);
      const onChange = (event) => setInstalled(event.matches);
      media.addEventListener('change', onChange);
      stopListening = () => media.removeEventListener('change', onChange);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopListening?.();
        stopListening = undefined;
      }
    };
  };

  return { subscribe, getSnapshot: () => installed, setInstalled };
}
