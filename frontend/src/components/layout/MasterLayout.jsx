import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function MasterLayout() {
  const { logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100,
        overflowY: 'auto'
      }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.6rem' }}>🌐</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>FamilyBase</div>
              <div style={{ fontSize: '0.7rem', color: '#FDCB6E', letterSpacing: 1 }}>MASTER ADMIN</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {[
            { to: '/master', label: '📊 Dashboard', end: true },
          ].map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 10, marginBottom: 4, textDecoration: 'none', fontSize: '0.9rem',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'linear-gradient(135deg, #FDCB6E30, #E17055220)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
            })}>{label}</NavLink>
          ))}
        </nav>

        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={logout} style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,118,117,0.15)', color: '#FF7675',
            border: '1px solid rgba(255,118,117,0.2)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem'
          }}>🚪 Sair</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: 240, flex: 1, padding: '24px', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
