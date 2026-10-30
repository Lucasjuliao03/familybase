import { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import api, { publicAssetUrl } from '../../services/api';
import ParentNavIcon from '../../components/ui/ParentNavIcon';
import UserAvatar from '../../components/profile/UserAvatar';
import MobileNav from './MobileNav';
import TrialBanner from '../../components/TrialBanner';
import { roleLabel } from '../../lib/webNavigation';

import { PARENT_NAV_SECTIONS as NAV_SECTIONS } from '../../lib/familyNavigation';

export default function LegacyParentLayout() {
  const { user, family, logout, modules, effectiveSubscription } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const { isMobileShell } = useLayoutMode();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const location = useLocation();
  const [previousLocation, setPreviousLocation] = useState(location);

  if (previousLocation !== location) {
    setPreviousLocation(location);
    setMobileOpen(false);
  }

  const notificationsOn = moduleAllowed(modules, 'notifications');
  const [previousNotificationsOn, setPreviousNotificationsOn] = useState(notificationsOn);
  if (previousNotificationsOn !== notificationsOn) {
    setPreviousNotificationsOn(notificationsOn);
    if (!notificationsOn) setNotifCount(0);
  }

  useEffect(() => {
    if (!notificationsOn) return undefined;
    const fetchNotifs = async () => {
      try { const { data } = await api.get('/notifications/unread-count'); setNotifCount(data.count); } catch { /* Falha tolerada; mantém o fallback existente. */ }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [notificationsOn]);

  const openNotifications = async () => {
    setNotifOpen(!notifOpen);
    if (!notifOpen) {
      try { const { data } = await api.get('/notifications'); setNotifications(data); } catch { /* Falha tolerada; mantém o fallback existente. */ }
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch { /* Falha tolerada; mantém o fallback existente. */ }
  };

  const filteredSections = useMemo(() => NAV_SECTIONS.map(sec => ({
    ...sec,
    items: sec.items.filter(it => {
      if (it.to === '/parent/family-administration') return user?.role === 'parent' && user?.access_profile === 'gestor';
      if (it.anyOf) return anyModuleAllowed(modules, it.anyOf);
      if (it.module) return moduleAllowed(modules, it.module);
      return true;
    }),
  })).filter(sec => sec.items.length > 0), [modules, user?.role, user?.access_profile]);

  const flatNav = useMemo(
    () => filteredSections.flatMap(s => s.items.map(it => ({ ...it, label: t(it.key) }))),
    [filteredSections, t]
  );

  const avatarContent = (
    <UserAvatar
      avatarUrl={user?.avatar_url}
      avatarPreset={user?.avatar_preset}
      name={user?.name}
      size={36}
      bordered={false}
    />
  );

  return (
    <div className={`app-layout${isMobileShell ? ' mobile-shell-layout' : ''}`}>
      {!isMobileShell && mobileOpen && <div className="mobile-overlay show" onClick={() => setMobileOpen(false)} />}

      {!isMobileShell && (
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>

        {/* Logo area */}
        <div className="sidebar-logo">
          {family?.logo_url ? (
            <img src={publicAssetUrl(family.logo_url)} alt=""
              style={{ height: collapsed ? 30 : 38, maxWidth: collapsed ? 38 : 150, objectFit: 'contain' }} />
          ) : (
            <img src="/brand/logo.webp" alt="Tudo de Família"
              style={{ height: collapsed ? 34 : 42, objectFit: 'contain' }} />
          )}
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <h1>Tudo de Família</h1>
              {family?.name && <div className="sidebar-family-name">{family.name}</div>}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Módulos da família">
          {filteredSections.map((sec, si) => (
            <div key={si}>
              {!collapsed && <div className="sidebar-section">{sec.label}</div>}
              {sec.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                  <span className="link-icon"><ParentNavIcon name={item.iconKey} size={18} /></span>
                  {!collapsed && <span className="link-text">{t(item.key)}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {!collapsed && effectiveSubscription?.can_manage_billing === true && <div className="web-sidebar-plan">Sua família conectada<NavLink to="/parent/billing">Assinatura · Google Play →</NavLink></div>}
        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{avatarContent}</div>
            {!collapsed && (
              <div className="user-info">
                <div className="user-name">{user?.name}</div>
                <div className="user-role">{roleLabel(user)}</div>
              </div>
            )}
          </div>
          <button className="sidebar-link" onClick={logout} style={{ marginTop: 4, color: 'rgba(239,68,68,0.85)' }}>
            <span className="link-icon"><ParentNavIcon name="logout" size={18} /></span>
            {!collapsed && <span className="link-text">Sair</span>}
          </button>
        </div>
      </aside>
      )}

      <div className={`app-main ${collapsed && !isMobileShell ? 'expanded' : ''}`}>

        {!isMobileShell && (
        <header className="app-header">
          <div className="flex gap-12" style={{ alignItems: 'center' }}>
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Menu">
              <ParentNavIcon name="menu" size={20} />
            </button>
            <button
              className="btn btn-sm btn-ghost hide-mobile"
              onClick={() => setCollapsed(!collapsed)}
              style={{ padding: '6px 10px', fontSize: '1rem' }}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? '→' : '←'}
            </button>
            {/* Greeting */}
            <div className="hide-mobile" style={{ fontSize: '0.875rem', color: 'var(--text-light)', fontWeight: 500 }}>
              Bem-vindo, <strong style={{ color: 'var(--text)' }}>{user?.name?.split(' ')[0]}</strong>
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
                <button className="btn btn-sm btn-ghost" style={{ padding: '7px 10px', position: 'relative' }} aria-label={t('notifications')}>
                  <ParentNavIcon name="bell" size={18} />
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
              <UserAvatar
                avatarUrl={user?.avatar_url}
                avatarPreset={user?.avatar_preset}
                name={user?.name}
                size={28}
                bordered={false}
              />
              </div>
              <div className="hide-mobile">
                <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>{user?.name?.split(' ')[0]}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1 }}>{roleLabel(user)}</div>
              </div>
            </div>
          </div>
        </header>
        )}

        <TrialBanner />
        <div className="app-content">
          {!isMobileShell && <div className="web-breadcrumb">{family?.name || 'Minha família'} / <span>{flatNav.find(n => n.to === location.pathname)?.label || 'Painel'}</span></div>}
          <Outlet />
        </div>
      </div>

      <MobileNav role="parent" navItems={flatNav} />
    </div>
  );
}
