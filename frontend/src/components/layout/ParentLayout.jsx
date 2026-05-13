import { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api, { publicAssetUrl } from '../../services/api';
import { PRESET_AVATARS } from '../../components/AvatarPicker';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import MobileNav from './MobileNav';

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
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch {}
  };

  const navItems = useMemo(() => {
    const items = [
      { to: '/parent', icon: '📊', label: t('dashboard'), end: true },
      { to: '/parent/tasks', icon: '✅', label: t('tasks'), module: 'tasks' },
      { to: '/parent/grades', icon: '📚', label: t('grades'), module: 'grades' },
      { to: '/parent/allowance', icon: '💰', label: t('nav_allowance'), anyOf: ['allowance', 'piggy_bank', 'goals'] },
      { to: '/parent/family-shop', icon: '🛍️', label: t('nav_family_shop'), module: 'family_shop' },
      { to: '/parent/calendar', icon: '📅', label: t('calendar'), module: 'calendar' },
      { to: '/parent/health', icon: '❤️', label: t('nav_health'), module: 'health' },
      { to: '/parent/mural', icon: '📌', label: t('nav_mural'), module: 'mural' },
      { to: '/parent/shopping', icon: '🛒', label: t('nav_shopping'), module: 'shopping' },
      { to: '/parent/reports', icon: '📈', label: t('reports'), module: 'reports' },
      { to: '/parent/family-administration', icon: '⚙️', label: t('fam_admin_nav') },
    ];
    return items.filter((it) => {
      if (it.anyOf) return anyModuleAllowed(modules, it.anyOf);
      if (it.module) return moduleAllowed(modules, it.module);
      return true;
    });
  }, [t, modules]);

  return (
    <div className="app-layout">
      {mobileOpen && <div className="mobile-overlay show" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
          {family?.logo_url ? (
            <img src={publicAssetUrl(family.logo_url)} alt="" style={{ height: collapsed ? 32 : 40, maxWidth: collapsed ? 40 : 160, objectFit: 'contain' }} />
          ) : (
            <img src="/logo.png" alt="FamilyBase" style={{ height: collapsed ? 32 : 40 }} />
          )}
          {!collapsed && (
            <>
              <h1 style={{ margin: 0, lineHeight: 1.15 }}>FamilyBase</h1>
              {family?.name && <div className="sidebar-family-name">{family.name}</div>}
            </>
          )}
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="link-icon">{item.icon}</span>
              {!collapsed && <span className="link-text">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar" style={{ overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)' }}>
              {user?.avatar_url ? (
                <img src={publicAssetUrl(user.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                user?.avatar_preset ? PRESET_AVATARS.find(a => a.id === user.avatar_preset)?.emoji : (user?.name?.[0] || 'P')
              )}
            </div>
            {!collapsed && (
              <div className="user-info">
                <div className="user-name">{user?.name}</div>
                <div className="user-role">{t('parents')}</div>
              </div>
            )}
          </div>
          <button className="sidebar-link" onClick={logout} style={{marginTop:8}}>
            <span className="link-icon">🚪</span>
            {!collapsed && <span className="link-text">{t('logout')}</span>}
          </button>
        </div>
      </aside>

      <div className={`app-main ${collapsed ? 'expanded' : ''}`}>
        <header className="app-header">
          <div className="flex gap-12" style={{alignItems:'center'}}>
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>☰</button>
            <button className="btn-icon btn-ghost hide-mobile" onClick={() => setCollapsed(!collapsed)} style={{fontSize:'1.2rem'}}>
              {collapsed ? '▶' : '◀'}
            </button>
          </div>
          <div className="flex gap-16" style={{alignItems:'center'}}>
            <div className="flex gap-10" style={{ alignItems: 'center', marginRight: 4 }} title={family?.name || ''}>
              {family?.logo_url ? (
                <img src={publicAssetUrl(family.logo_url)} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} />
              ) : family?.emoji ? (
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{family.emoji}</span>
              ) : null}
              {family?.name && (
                <span className="hide-mobile" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {family.name}
                </span>
              )}
            </div>
            <div className="lang-switch">
              <button className={`lang-btn ${lang==='pt'?'active':''}`} onClick={() => switchLanguage('pt')}>🇧🇷</button>
              <button className={`lang-btn ${lang==='en'?'active':''}`} onClick={() => switchLanguage('en')}>🇺🇸</button>
            </div>
            {notificationsOn && (
            <div className="notif-bell" onClick={openNotifications} style={{position:'relative'}}>
              <span style={{fontSize:'1.3rem',cursor:'pointer'}}>🔔</span>
              {notifCount > 0 && <span className="notif-count">{notifCount}</span>}
              {notifOpen && (
                <div onClick={(e) => e.stopPropagation()} style={{position:'absolute',right:0,top:'100%',marginTop:8,width:340,background:'var(--bg-card)',borderRadius:'var(--radius)',boxShadow:'var(--shadow-lg)',border:'1px solid var(--border)',zIndex:200,maxHeight:400,overflow:'auto'}}>
                  <div className="flex-between" style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                    <strong style={{fontSize:'0.9rem'}}>{t('notifications')}</strong>
                    <button className="btn btn-sm btn-ghost" onClick={markAllRead}>{t('mark_all_read')}</button>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{padding:24,textAlign:'center',color:'var(--text-light)',fontSize:'0.85rem'}}>{t('no_notifications')}</div>
                  ) : notifications.slice(0,10).map(n => (
                    <div key={n.id} style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',background: n.read ? 'transparent' : 'rgba(108,92,231,0.04)',display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span style={{fontSize:'1.1rem'}}>{n.icon}</span>
                      <div>
                        <div style={{fontWeight:600,fontSize:'0.82rem'}}>{n.title}</div>
                        <div style={{fontSize:'0.75rem',color:'var(--text-light)'}}>{n.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
      <MobileNav navItems={navItems} pinnedCount={4} />
    </div>
  );
}
