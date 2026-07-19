import { Component } from 'react';
import { getSupabaseConfigDiagnostics } from '../lib/supabase';

/**
 * Evita tela branca silenciosa quando o bundle falha ou a config Supabase está inválida.
 */
export class BootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[BootErrorBoundary]', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const cfg = getSupabaseConfigDiagnostics();
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
      }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: 12 }}>Não foi possível iniciar a Base Familiar</h1>
          <p style={{ opacity: 0.85, lineHeight: 1.5, marginBottom: 16 }}>
            {error?.message || 'Erro inesperado ao carregar a aplicação.'}
          </p>
          <p style={{ fontSize: '0.85rem', opacity: 0.65 }}>
            Supabase: {cfg.url || 'não configurado'}
            {cfg.usedFallback ? ' (fallback basefamiliar2)' : ''}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}

/** Aviso visível se o build foi feito sem variáveis VITE (comum na Vercel antes do redeploy). */
export function SupabaseBootNotice() {
  const cfg = getSupabaseConfigDiagnostics();
  if (!cfg.usedFallback || import.meta.env.DEV) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '8px 12px',
        fontSize: '0.75rem',
        textAlign: 'center',
        background: 'rgba(30, 58, 95, 0.95)',
        color: '#cbd5e1',
      }}
    >
      Ligação Supabase: projecto basefamiliar2 (fallback). Actualize VITE_SUPABASE_* na Vercel e faça redeploy.
    </div>
  );
}
