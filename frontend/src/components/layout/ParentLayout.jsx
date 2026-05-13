import { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api, { publicAssetUrl } from '../../services/api';
import { PRESET_AVATARS } from '../../components/AvatarPicker';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import MobileNav from './MobileNav';
import TrialBanner from '../TrialBanner';

const NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/parent', icon: '🏠', label: null, key: 'dashboard', end: true },
      { to: '/parent/tasks', icon: '✅', label: null, key: 'tasks', module: 'tasks' },
      { to: '/parent/grades', icon: '📚', label: null, key: 'grades', module: 'grades' },
      { to: '/parent/allowance', icon: '💰', label: null, key: 'nav_allowance', anyOf: ['allowance', 'piggy_bank', 'goals'] },
    ],
  },
  {
    label: 'Módulos',
    items: [
      { to: '/parent/family-shop', icon: '🛍️', label: null, key: 'nav_family_shop', module: 'family_shop' },
      { to: '/parent/calendar', icon: '📅', label: null, key: 'calendar', module: 'calendar' },
      { to: '/parent/health', icon: '❤️', label: null, key: 'nav_health', module: 'health' },
      { to: '/parent/mural', icon: '📌', label: null, key: 'nav_mural', module: 'mural' },
      { to: '/parent/shopping', icon: '🛒', label: null, key: 'nav_shopping', module: 'shopping' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/parent/reports', icon: '📈', label: null, key: 'reports', module: 'reports' },
      { to: '/parent/family-administration', icon: '⚙️', label: null, key: 'fam_admin_nav' },
    ],
  },
];

export default function ParentLayout() {
  const { user, family, logout, modules } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location]);

  const notificationsOn = moduleAllowed(modules, 'notifications');

  useEffect(() => {
    if (!notificationsOn) { setNotifCount(0); return undefined; }
    const fetchNotifs = async () => {
      try { const { data } = await api.get('/notifications/unread-count'); setNotifCount(data.count); } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [notificationsOn]);

  const openNotifications = async () => {
    setNotifOpen(!notifOpen);
    if (!notifOpen) {
      try { const { data } = await api.get('/notifications'); setNotifications(data); } catch {}
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch {}
  };

  const filteredSections = useMemo(() => NAV_SECTIONS.map(sec => ({
    ...sec,
    items: sec.items.filter(it => {
      if (it.anyOf) return anyModuleAllowed(modules, it.anyOf);
      if (it.module) return moduleAllowed(modules, it.module);
      return true;
    }),
  })).filter(sec => sec.items.length > 0), [modules]);

  const flatNav = useMemo(
    () => filteredSections.flatMap(s => s.items.map(it => ({ ...it, label: t(it.key) }))),
    [filteredSections, t]
  );

  const avatarContent = user?.avatar_url
    ? <img src={publicAssetUrl(user.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : (PRESET_AVATARS.find(a => a.id === user?.avatar_preset)?.emoji || user?.name?.[0] || '👤');

  return (
    <div className="app-layout">
      {mobileOpen && <div className="mobile-overlay show" onClick={() => setMobileOpen(false)} />}

      {/* ── Sidebar ────────────────────────────── */}
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>

        {/* Logo area */}
        <div className="sidebar-logo">
          {family?.logo_url ? (
            <img src={publicAssetUrl(family.logo_url)} alt=""
              style={{ height: collapsed ? 30 : 38, maxWidth: collapsed ? 38 : 150, objectFit: 'contain' }} />
          ) : (
            <img src="/logo512.png" alt="Base Familiar"
              style={{ height: collapsed ? 34 : 42, objectFit: 'contain' }} />
          )}
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <h1>Base Familiar</h1>
              {family?.name && <div className="sidebar-family-name">{family.name}</div>}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {filteredSections.map((sec, si) => (
            <div key={si}>
              {!collapsed && <div className="sidebar-section">{sec.label}</div>}
              {sec.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                  <span className="link-icon">{item.icon}</span>
                  {!collapsed && <span className="link-text">{t(item.key)}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{avatarContent}</div>
            {!collapsed && (
              <div className="user-info">
                <div className="user-name">{user?.name}</div>
                <div className="user-role">🏅 Gestor</div>
              </div>
            )}
          </div>
          <button className="sidebar-link" onClick={logout} style={{ marginTop: 4, color: 'rgba(239,68,68,0.85)' }}>
            <span className="link-icon">🚪</span>
            {!collapsed && <span className="link-text">Sair</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────── */}
      <div className={`app-main ${collapsed ? 'expanded' : ''}`}>

        {/* Header */}
        <header className="app-header">
          <div className="flex gap-12" style={{ alignItems: 'center' }}>
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>☰</button>
            <button
              className="btn btn-sm btn-ghost hide-mobile"
              onClick={() => setCollapsed(!collapsed)}
              style={{ padding: '6px 10px', fontSize: '1rem' }}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? '→' : '←'}
            </button>
            {/* Greeting */}
            <div className="hide-mobile" style={{ fontSize: '0.875rem', color: 'var(--text-light)', fontWeight: 500 }}>
              Bem-vindo, <strong style={{ color: 'var(--text)' }}>{user?.name?.split(' ')[0]}</strong>! 👋
            </div>
          </div>

          <div className="flex gap-12" style={{ alignItems: 'center' }}>
            {/* Language switch */}
            <div className="lang-switch">
              <button className={`lang-btn ${lang === 'pt' ? 'active' : ''}`} onClick={() => switchLanguage('pt')}>🇧🇷</button>
              <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => switchLanguage('en')}>🇺🇸</button>
            </div>

            {/* Notifications */}
            {notificationsOn && (
              <div className="notif-bell" onClick={openNotifications} style={{ position: 'relative' }}>
                <button className="btn btn-sm btn-ghost" style={{ padding: '7px 10px', position: 'relative' }}>
                  🔔
                  {notifCount > 0 && <span className="notif-count">{notifCount > 9 ? '9+' : notifCount}</span>}
                </button>
                {notifOpen && (
                  <div onClick={e => e.stopPropagation()} style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                    width: 'min(340px, calc(100vw - 24px))', background: 'var(--bg-card)', borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
                    zIndex: 200, maxHeight: 400, overflow: 'auto',
                  }}>
                    <div className="flex-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <strong style={{ fontSize: '0.9rem' }}>{t('notifications')}</strong>
                      <button className="btn btn-sm btn-ghost" onClick={markAllRead}>{t('mark_all_read')}</button>
                    </div>
                    {notifications.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                        {t('no_notifications')}
                      </div>
                    ) : notifications.slice(0, 10).map(n => (
                      <div key={n.id} style={{
                        padding: '10px 16px', borderBottom: '1px solid var(--border)',
                        background: n.read ? 'transparent' : 'rgba(99,102,241,0.04)',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{ fontSize: '1.1rem' }}>{n.icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{n.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{n.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Profile chip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg)', borderRadius: 10,
              padding: '6px 10px 6px 6px',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--grad-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem', fontWeight: 700, color: '#fff', overflow: 'hidden',
                flexShrink: 0,
              }}>
                {user?.avatar_url
                  ? <img src={publicAssetUrl(user.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (PRESET_AVATARS.find(a => a.id === user?.avatar_preset)?.emoji || user?.name?.[0] || '👤')}
              </div>
              <div className="hide-mobile">
                <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>{user?.name?.split(' ')[0]}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1 }}>Gestor</div>
              </div>
            </div>
          </div>
        </header>

        <TrialBanner />
        <div className="app-content">
          <Outlet />
        </div>
      </div>

      <MobileNav navItems={flatNav} pinnedCount={4} />
    </div>
  );
}
