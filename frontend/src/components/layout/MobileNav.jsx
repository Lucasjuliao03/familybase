import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api, { apiOrigin } from '../../services/api';
import { PRESET_AVATARS } from '../AvatarPicker';

/**
 * MobileNav — bottom bar + drawer for mobile screens.
 * Props:
 *   navItems: [{to, icon, label}]
 *   pinnedCount: how many items appear directly in the bottom bar (default 4)
 */
export default function MobileNav({ navItems = [], pinnedCount = 4 }) {
  const { user, family, logout } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Determine which items go in the bar vs drawer
  // Always include the current active route in the bar
  const currentIdx = navItems.findIndex(it => {
    if (it.end) return location.pathname === it.to;
    return location.pathname.startsWith(it.to);
  });

  // Build pinned items: first pinnedCount, but swap one for the current if not included
  let pinnedItems = navItems.slice(0, pinnedCount);
  if (currentIdx >= pinnedCount) {
    // Replace last pinned with the active item
    pinnedItems = [...navItems.slice(0, pinnedCount - 1), navItems[currentIdx]];
  }
  const drawerItems = navItems.filter(it => !pinnedItems.includes(it));
  const hasMore = drawerItems.length > 0;

  const userAvatar = user?.avatar_url
    ? <img src={`${apiOrigin}${user.avatar_url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    : PRESET_AVATARS.find(a => a.id === user?.avatar_preset)?.emoji || user?.name?.[0] || '👤';

  return (
    <>
      {/* ── Bottom Bar ────────────────────────────────── */}
      <nav className="mobile-bottom-bar">
        {pinnedItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mbb-item${isActive ? ' active' : ''}`}
          >
            <span className="mbb-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}

        {hasMore && (
          <button
            className={`mbb-item mbb-more${drawerOpen ? ' open' : ''}`}
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Mais opções"
          >
            <span className="mbb-icon" style={{ transition: 'transform 0.25s', transform: drawerOpen ? 'rotate(45deg)' : 'none' }}>
              {drawerOpen ? '✕' : '⋯'}
            </span>
            <span>{drawerOpen ? 'Fechar' : 'Mais'}</span>
          </button>
        )}
      </nav>

      {/* ── Drawer Overlay ───────────────────────────── */}
      {drawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div className="mobile-drawer-handle" />

            {/* Family header */}
            <div className="mobile-drawer-header">
              <div style={{
                width: 40, height: 40, borderRadius: 12, overflow: 'hidden',
                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', flexShrink: 0
              }}>
                {family?.logo_url
                  ? <img src={`${apiOrigin}${family.logo_url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (family?.emoji || '🏠')}
              </div>
              <div>
                <div className="mobile-drawer-family">{family?.name || 'FamilyBase'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 1 }}>{user?.name}</div>
              </div>
            </div>

            {/* All drawer items in a 4-column grid */}
            <div className="mobile-drawer-grid">
              {drawerItems.map(item => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={`mobile-drawer-item${isActive ? ' active' : ''}`}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="mdi-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>

            {/* Footer: user + logout */}
            <div className="mobile-drawer-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
                  background: 'linear-gradient(135deg, var(--primary-light), var(--accent-light))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', fontWeight: 700, color: '#fff', flexShrink: 0
                }}>
                  {userAvatar}
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{user?.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>
                    <button className={`lang-btn ${lang === 'pt' ? 'active' : ''}`} onClick={() => switchLanguage('pt')}>🇧🇷</button>
                    <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => switchLanguage('en')}>🇺🇸</button>
                  </div>
                </div>
              </div>
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                  borderRadius: 12, border: '1px solid var(--border)', background: 'none',
                  color: 'var(--danger)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                }}
                onClick={() => { setDrawerOpen(false); logout(); }}
              >
                🚪 {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
