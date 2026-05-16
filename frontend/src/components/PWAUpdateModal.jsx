import { useEffect, useState } from 'react';
import { applyProdPwaUpdate } from '../lib/pwaUpdate';

/** Modal quando existe nova versão do SW (modo prompt do vite-plugin-pwa). */
export default function PWAUpdateModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onAvail = () => setOpen(true);
    window.addEventListener('pwa:update-available', onAvail);
    return () => window.removeEventListener('pwa:update-available', onAvail);
  }, []);

  if (!open) return null;

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
            onClick={() => setOpen(false)}
          >
            Agora não
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try {
                setOpen(false);
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
