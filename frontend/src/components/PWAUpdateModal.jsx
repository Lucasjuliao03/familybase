import { useState, useSyncExternalStore } from 'react';
import { applyProdPwaUpdate, hasProdPwaUpdate, subscribeToProdPwaUpdate } from '../lib/pwaUpdate';

/** Modal quando existe nova versão do SW (modo prompt do vite-plugin-pwa). */
export default function PWAUpdateModal() {
  const available = useSyncExternalStore(subscribeToProdPwaUpdate, hasProdPwaUpdate, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} role="dialog" aria-labelledby="pwa-update-title">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 id="pwa-update-title" className="modal-title">Atualização disponível</h2>
        </div>
        <p style={{ marginBottom: 20, color: 'var(--text-muted, var(--text-light))', lineHeight: 1.5 }}>
          Nova atualização disponível. Deseja atualizar agora?
        </p>
        <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDismissed(true)}
          >
            Agora não
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try {
                setDismissed(true);
                await applyProdPwaUpdate();
              } catch (e) {
                console.warn('[PWA] atualização:', e);
                window.location.reload();
              }
            }}
          >
            Sim, atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
