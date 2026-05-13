/**
 * PageLoader — tela de carregamento usada pelo Suspense enquanto
 * um chunk lazy ainda não foi descarregado.
 */
export default function PageLoader({ message = 'A carregar…' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #F1F5F9)',
      gap: 20, zIndex: 9999,
    }}>
      {/* Logo + spinner */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <img
          src="/logo512.png"
          alt="Base Familiar"
          loading="eager"
          style={{
            width: 56, height: 56,
            objectFit: 'contain',
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: 14,
          }}
        />
        {/* Anel giratório */}
        <svg
          viewBox="0 0 72 72"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', animation: 'page-spin 0.9s linear infinite' }}
        >
          <circle cx="36" cy="36" r="32"
            fill="none" stroke="var(--primary, #6366F1)" strokeWidth="3"
            strokeDasharray="60 140" strokeLinecap="round"
          />
        </svg>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '1rem', fontWeight: 600,
          color: 'var(--text, #1E293B)',
          fontFamily: 'var(--font-main, Poppins, sans-serif)',
        }}>
          Base Familiar
        </div>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-light, #64748B)',
          marginTop: 4,
          fontFamily: 'var(--font-main, Poppins, sans-serif)',
        }}>
          {message}
        </div>
      </div>

      <style>{`
        @keyframes page-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
