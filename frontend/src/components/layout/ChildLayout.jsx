import { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api, { publicAssetUrl } from '../../services/api';
import AvatarPicker, { PRESET_AVATARS } from '../../components/AvatarPicker';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import MobileNav from './MobileNav';
import TrialBanner from '../TrialBanner';

const NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/child', icon: '🏠', label: null, key: 'dashboard', end: true },
      { to: '/child/tasks', icon: '✅', label: null, key: 'my_tasks', module: 'tasks' },
      { to: '/child/grades', icon: '📚', label: null, key: 'my_grades', module: 'grades' },
      { to: '/child/allowance', icon: '💰', label: null, key: 'my_allowance', anyOf: ['allowance', 'piggy_bank', 'goals'] },
    ],
  },
  {
    label: 'Explorar',
    items: [
      { to: '/child/family-shop', icon: '🛍️', label: null, key: 'nav_family_shop', module: 'family_shop' },
      { to: '/child/calendar', icon: '📅', label: null, key: 'my_calendar', module: 'calendar' },
      { to: '/child/health', icon: '❤️', label: null, key: 'nav_health', module: 'health' },
      { to: '/child/mural', icon: '📌', label: null, key: 'nav_mural', module: 'mural' },
      { to: '/child/shopping', icon: '🛒', label: null, key: 'nav_shopping', module: 'shopping' },
    ],
  },
];

export default function ChildLayout() {
  const { user, childProfile, family, logout, modules, fetchMe } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  /** Saldo previsível de mesada (BRL), igual à lógica de “Mesada” — não confundir com ⭐ pontos (loja). */
  const [estimatedAllowance, setEstimatedAllowance] = useState(null);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);
  useEffect(() => {
    if (!childProfile?.id) {
      setEstimatedAllowance(null);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/allowance/estimated-balance', { params: { child_id: childProfile.id } });
        if (!cancelled) setEstimatedAllowance(data || null);
      } catch {
        if (!cancelled) setEstimatedAllowance(null);
      }
    };
    load();
    const iv = setInterval(load, 45000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [childProfile?.id]);

  const notificationsOn = moduleAllowed(modules, 'notifications');

  useEffect(() => {
    if (!notificationsOn) {
      setNotifCount(0);
      return undefined;
    }
    const fetchNotifs = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        setNotifCount(data.count);
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [notificationsOn]);

  const openNotifications = async () => {
    setNotifOpen(!notifOpen);
    if (!notifOpen) {
      try {
        const { data } = await api.get('/notifications');
        setNotifications(data);
      } catch {}
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch {}
  };

  const filteredSections = useMemo(
    () =>
      NAV_SECTIONS.map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => {
          if (it.anyOf) return anyModuleAllowed(modules, it.anyOf);
          if (it.module) return moduleAllowed(modules, it.module);
          return true;
        }),
      })).filter((sec) => sec.items.length > 0),
    [modules]
  );

  const flatNav = useMemo(
    () => filteredSections.flatMap((s) => s.items.map((it) => ({ ...it, label: t(it.key) }))),
    [filteredSections, t]
  );

  const profileName = childProfile?.name || user?.name || '';

  const childAvatarContent =
    childProfile?.avatar_url ? (
      <img src={publicAssetUrl(childProfile.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    ) : (
      PRESET_AVATARS.find((a) => a.id === childProfile?.avatar_preset)?.emoji || profileName?.[0] || '⭐'
    );

  return (
    <div className="app-layout child-theme">
      {mobileOpen && <div className="mobile-overlay show" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ flexDirection: collapsed ? 'row' : 'column', gap: collapsed ? 8 : 6 }}>
          {family?.logo_url ? (
            <img
              src={publicAssetUrl(family.logo_url)}
              alt=""
              style={{
                height: collapsed ? 32 : 44,
                maxWidth: collapsed ? 40 : 160,
                objectFit: 'contain',
              }}
            />
          ) : (
            <img src="/logo512.png" alt="Base Familiar" style={{ height: collapsed ? 36 : 52, objectFit: 'contain' }} />
          )}
          {!collapsed && (
            <div style={{ overflow: 'hidden', textAlign: 'center', width: '100%' }}>
              <h1 style={{ margin: 0, lineHeight: 1.15 }}>Base Familiar</h1>
              {family?.name && (
                <div className="sidebar-family-name" style={{ fontSize: '0.85rem', fontWeight: 500, opacity: 0.92 }}>
                  {family.name}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, padding: collapsed ? '4px 0' : '8px 10px', textAlign: 'center' }}>
          {!collapsed ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                <AvatarPicker
                  currentAvatarUrl={childProfile?.avatar_url}
                  currentPreset={childProfile?.avatar_preset}
                  endpoint="/auth/avatar"
                  size="md"
                  onSave={() => {
                    fetchMe?.();
                  }}
                />
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>{profileName}</div>
              <div className="level-badge" style={{ marginTop: 6, fontSize: '0.78rem', padding: '3px 10px', display: 'inline-flex' }}>
                ⭐ Nível {childProfile?.level || 1}
              </div>
            </>
          ) : (
            <div style={{ margin: '0 auto', fontSize: '1.5rem', lineHeight: 1 }} title={profileName}>
              {typeof childAvatarContent === 'string' ? (
                childAvatarContent
              ) : (
                <span style={{ display: 'block', overflow: 'hidden', borderRadius: '50%', width: 36, height: 36 }}>
                  {childAvatarContent}
                </span>
              )}
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {filteredSections.map((sec, si) => (
            <div key={si}>
              {!collapsed && <div className="sidebar-section">{sec.label}</div>}
              {sec.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                  <span className="link-icon">{item.icon}</span>
                  {!collapsed && <span className="link-text">{t(item.key)}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{childAvatarContent}</div>
            {!collapsed && (
              <div className="user-info">
                <div className="user-name">{profileName}</div>
                <div className="user-role">👶 Área infantil</div>
              </div>
            )}
          </div>
          <button className="sidebar-link" type="button" onClick={logout} style={{ marginTop: 4, color: 'rgba(239,245,168,0.95)' }}>
            <span className="link-icon">🚪</span>
            {!collapsed && <span className="link-text">{t('logout')}</span>}
          </button>
        </div>
      </aside>

      <div className={`app-main ${collapsed ? 'expanded' : ''}`}>
        <header className="app-header">
          <div className="flex gap-12" style={{ alignItems: 'center' }}>
            <button className="mobile-menu-btn" type="button" onClick={() => setMobileOpen(true)}>
              ☰
            </button>
            <button
              className="btn btn-sm btn-ghost hide-mobile"
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              style={{ padding: '6px 10px', fontSize: '1rem', color: 'var(--primary)' }}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? '→' : '←'}
            </button>

            {family?.name && (
              <div className="header-family-name hide-mobile" style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.9rem' }}>
                {family.name}
              </div>
            )}
          </div>

          <div className="flex gap-16" style={{ alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap', rowGap: 8 }}>
            <div className="lang-switch">
              <button type="button" className={`lang-btn ${lang === 'pt' ? 'active' : ''}`} onClick={() => switchLanguage('pt')}>
                🇧🇷
              </button>
              <button type="button" className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => switchLanguage('en')}>
                🇺🇸
              </button>
            </div>
            {notificationsOn && (
              <div className="notif-bell" onClick={openNotifications} style={{ position: 'relative' }}>
                <span style={{ fontSize: '1.25rem', cursor: 'pointer' }}>🔔</span>
                {notifCount > 0 && <span className="notif-count">{notifCount > 9 ? '9+' : notifCount}</span>}
                {notifOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: 8,
                      width: 'min(340px, calc(100vw - 24px))',
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius)',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border)',
                      zIndex: 200,
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    <div className="flex-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{t('notifications')}</strong>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={markAllRead}>
                        {t('mark_all_read')}
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                        {t('no_notifications')}
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          style={{
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: n.read ? 'transparent' : 'rgba(108,92,231,0.04)',
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                          }}
                        >
                          <span style={{ fontSize: '1.1rem' }}>{n.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{n.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{n.message}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <span
                style={{ fontWeight: 700, color: 'var(--primary)', cursor: 'default' }}
                title="Pontos — servem para trocar por recompensas na loja da família (podem incluir valores em dinheiro a crédito da mesada, conforme cada recompensa)."
              >
                ⭐ {childProfile?.points ?? 0}
              </span>
              <span
                style={{ fontWeight: 700, color: 'var(--warning)', cursor: 'default' }}
                title="Mesada estimada neste período — dinheiro do cofrinho, metas e regras de mesada (separado dos pontos da loja)."
              >
                💰{' '}
                {estimatedAllowance != null && estimatedAllowance.balance != null
                  ? `${estimatedAllowance.symbol || 'R$'} ${Number(estimatedAllowance.balance).toFixed(2)}`
                  : '—'}
              </span>
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
