import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import {
  PARENT_MOBILE_TABS,
  CHILD_MOBILE_TABS,
  filterMobileTabs,
} from '../../lib/mobileNavConfig';
import { publicAssetUrl } from '../../services/api';
import UserAvatar from '../profile/UserAvatar';
import ParentNavIcon from '../ui/ParentNavIcon';

function NavTabIcon({ item, active }) {
  if (active && item.png) {
    return <img src={item.png} alt="" className="mbb-icon-img" draggable={false} />;
  }
  if (item.iconKey) {
    return <ParentNavIcon name={item.iconKey} size={22} className="mbb-icon" />;
  }
  return <span className="mbb-icon">{item.icon}</span>;
}

function DrawerTabIcon({ item, active }) {
  if (active && item.png) {
    return <img src={item.png} alt="" className="mobile-drawer-icon-img" draggable={false} />;
  }
  if (item.iconKey) {
    return <ParentNavIcon name={item.iconKey} size={24} />;
  }
  return <span className="mdi-icon">{item.icon}</span>;
}

/**
 * Bottom bar + drawer — visual alinhado ao app Expo.
 * `role`: 'parent' | 'child' usa abas do mobile; `navItems` é fallback legado.
 */
export default function MobileNav({ role, navItems = [], pinnedCount: pinnedProp = 4 }) {
  const { user, family, logout, modules } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [narrowBar, setNarrowBar] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 380px)');
    const apply = () => setNarrowBar(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const pinnedCount = narrowBar ? Math.min(pinnedProp, 3) : pinnedProp;

  const tabs = useMemo(() => {
    if (role === 'parent') {
      return filterMobileTabs(PARENT_MOBILE_TABS, modules, moduleAllowed, anyModuleAllowed);
    }
    if (role === 'child') {
      return filterMobileTabs(CHILD_MOBILE_TABS, modules, moduleAllowed, anyModuleAllowed);
    }
    return navItems;
  }, [role, modules, navItems, t]);

  const resolvedTabs = useMemo(() => {
    if (role) {
      return tabs.map((tab) => ({
        ...tab,
        label: tab.key ? t(tab.key) : tab.label,
      }));
    }
    return tabs;
  }, [role, tabs, t]);

  const currentIdx = resolvedTabs.findIndex((it) => {
    if (it.end) return location.pathname === it.to;
    return location.pathname === it.to || location.pathname.startsWith(`${it.to}/`);
  });

  let pinnedItems = [];
  let drawerItems = [];

  if (resolvedTabs.length > pinnedCount + 1) {
    if (currentIdx >= pinnedCount - 1 && currentIdx >= 0) {
      pinnedItems = [...resolvedTabs.slice(0, pinnedCount - 1), resolvedTabs[currentIdx]];
      drawerItems = resolvedTabs.filter((it) => !pinnedItems.includes(it));
    } else {
      pinnedItems = resolvedTabs.slice(0, pinnedCount);
      drawerItems = resolvedTabs.slice(pinnedCount);
    }
  } else {
    pinnedItems = resolvedTabs;
    drawerItems = [];
  }

  const hasMore = drawerItems.length > 0;

  const userAvatar = (
    <UserAvatar
      avatarUrl={user?.avatar_url}
      avatarPreset={user?.avatar_preset}
      name={user?.name}
      size={36}
      bordered={false}
    />
  );

  return (
    <>
      <nav className="mobile-bottom-bar" aria-label="Navegação principal">
        {pinnedItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mbb-item${isActive ? ' active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <span className="mbb-icon-wrap" aria-hidden>
                  <NavTabIcon item={item} active={isActive} />
                </span>
                <span className="mbb-label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {hasMore && (
          <button
            type="button"
            className={`mbb-item mbb-more${drawerOpen ? ' open' : ''}`}
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Mais opções"
          >
            <span className="mbb-icon-wrap" aria-hidden>
              <span
                className="mbb-icon mbb-icon--more"
                style={{ transition: 'transform 0.25s', transform: drawerOpen ? 'rotate(45deg)' : 'none' }}
              >
                {drawerOpen ? '✕' : '⋯'}
              </span>
            </span>
            <span className="mbb-label">{drawerOpen ? 'Fechar' : 'Mais'}</span>
          </button>
        )}
      </nav>

      {drawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-handle" />
            <div className="mobile-drawer-header">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  flexShrink: 0,
                }}
              >
                {family?.logo_url ? (
                  <img src={publicAssetUrl(family.logo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  family?.emoji || '🏠'
                )}
              </div>
              <div>
                <div className="mobile-drawer-family">{family?.name || 'Base Familiar'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 1 }}>{user?.name}</div>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.05rem', margin: '0 0 12px', color: 'var(--text)' }}>
              Mais Módulos 🎛️
            </p>

            <div className="mobile-drawer-grid">
              {drawerItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={`mobile-drawer-item${isActive ? ' active' : ''}`}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="mobile-drawer-icon-wrap" aria-hidden>
                      <DrawerTabIcon item={item} active={isActive} />
                    </span>
                    <span className="mobile-drawer-label">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>

            <div className="mobile-drawer-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, var(--primary-light), var(--accent-light))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {userAvatar}
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{user?.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>
                    <button type="button" className={`lang-btn ${lang === 'pt' ? 'active' : ''}`} onClick={() => switchLanguage('pt')}>
                      🇧🇷
                    </button>
                    <button type="button" className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => switchLanguage('en')}>
                      🇺🇸
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'none',
                  color: 'var(--danger)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setDrawerOpen(false);
                  logout();
                }}
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
