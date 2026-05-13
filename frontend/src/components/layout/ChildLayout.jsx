import { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';
import AvatarPicker from '../../components/AvatarPicker';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import MobileNav from './MobileNav';
import TrialBanner from '../TrialBanner';

export default function ChildLayout() {
  const { user, childProfile, family, logout, modules } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
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
      try { const { data } = await api.get('/notifications/unread-count'); setNotifCount(data.count); } catch {}
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
      setNotifications(notifications.map(n => ({...n, read: 1})));
    } catch {}
  };

  const navItems = useMemo(() => {
    const items = [
      { to: '/child', icon: '🏠', label: t('dashboard'), end: true },
      { to: '/child/tasks', icon: '✅', label: t('my_tasks'), module: 'tasks' },
      { to: '/child/grades', icon: '📚', label: t('my_grades'), module: 'grades' },
      { to: '/child/allowance', icon: '💰', label: t('my_allowance'), anyOf: ['allowance', 'piggy_bank', 'goals'] },
      { to: '/child/family-shop', icon: '🛍️', label: t('nav_family_shop'), module: 'family_shop' },
      { to: '/child/calendar', icon: '📅', label: t('my_calendar'), module: 'calendar' },
      { to: '/child/health', icon: '❤️', label: t('nav_health'), module: 'health' },
      { to: '/child/mural', icon: '📌', label: t('nav_mural'), module: 'mural' },
      { to: '/child/shopping', icon: '🛒', label: t('nav_shopping'), module: 'shopping' },
    ];
    return items.filter((it) => {
      if (it.anyOf) return anyModuleAllowed(modules, it.anyOf);
      if (it.module) return moduleAllowed(modules, it.module);
      return true;
    });
  }, [t, modules]);

  return (
    <div className="app-layout child-theme">
      {mobileOpen && <div className="mobile-overlay show" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
          {family?.logo_url ? (
            <img src={`${api.defaults.baseURL?.replace('/api', '') || ''}${family.logo_url}`} alt="Logo" style={{ height: 44, maxWidth: 160, objectFit: 'contain' }} />
          ) : (
            <img src="/logo512.png" alt="Base Familiar" style={{ height: 52, objectFit: 'contain' }} />
          )}
          <h1 style={{ margin: 0, lineHeight: 1.15 }}>Base Familiar</h1>
          {family?.name && <div className="sidebar-family-name" style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 500 }}>{family.name}</div>}
        </div>
        <div style={{textAlign:'center',padding:'8px 0',flexShrink:0}}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <AvatarPicker
              currentAvatarUrl={childProfile?.avatar_url}
              currentPreset={childProfile?.avatar_preset}
              endpoint="/auth/avatar"
              size="md"
              onSave={() => { window.location.reload(); }}
            />
          </div>
          <div style={{fontWeight:700,fontSize:'1rem',lineHeight:1.2}}>{childProfile?.name || user?.name}</div>
          <div className="level-badge" style={{marginTop:4,fontSize:'0.8rem',padding:'2px 10px'}}>⭐ Nível {childProfile?.level || 1}</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="link-icon">{item.icon}</span>
              <span className="link-text">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={logout}>
            <span className="link-icon">🚪</span>
            <span className="link-text">{t('logout')}</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button className="mobile-menu-btn" type="button" onClick={() => setMobileOpen(true)}>☰</button>
          
          {family?.name && (
            <div className="header-family-name" style={{ fontWeight: 600, color: 'var(--primary)' }}>
              {family.name}
            </div>
          )}

          <div className="flex gap-16" style={{ alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap', rowGap: 8 }}>
            <div className="lang-switch">
              <button className={`lang-btn ${lang==='pt'?'active':''}`} onClick={() => switchLanguage('pt')}>🇧🇷</button>
              <button className={`lang-btn ${lang==='en'?'active':''}`} onClick={() => switchLanguage('en')}>🇺🇸</button>
            </div>
            {notificationsOn && (
            <div className="notif-bell" onClick={openNotifications} style={{position:'relative'}}>
              <span style={{fontSize:'1.3rem',cursor:'pointer'}}>🔔</span>
              {notifCount > 0 && <span className="notif-count">{notifCount}</span>}
              {notifOpen && (
                <div onClick={(e) => e.stopPropagation()} style={{position:'absolute',right:0,top:'100%',marginTop:8,width:'min(340px, calc(100vw - 24px))',background:'var(--bg-card)',borderRadius:'var(--radius)',boxShadow:'var(--shadow-lg)',border:'1px solid var(--border)',zIndex:200,maxHeight:400,overflow:'auto'}}>
                  <div className="flex-between" style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                    <strong style={{fontSize:'0.9rem',color:'var(--text)'}}>{t('notifications')}</strong>
                    <button className="btn btn-sm btn-ghost" onClick={markAllRead}>{t('mark_all_read')}</button>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{padding:24,textAlign:'center',color:'var(--text-light)',fontSize:'0.85rem'}}>{t('no_notifications')}</div>
                  ) : notifications.slice(0,10).map(n => (
                    <div key={n.id} style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',background: n.read ? 'transparent' : 'rgba(108,92,231,0.04)',display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span style={{fontSize:'1.1rem'}}>{n.icon}</span>
                      <div>
                        <div style={{fontWeight:600,fontSize:'0.82rem',color:'var(--text)'}}>{n.title}</div>
                        <div style={{fontSize:'0.75rem',color:'var(--text-light)'}}>{n.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
            <div className="flex gap-8" style={{alignItems:'center'}}>
              <span style={{fontWeight:700,color:'var(--primary)'}}>⭐ {childProfile?.points || 0}</span>
              <span style={{fontWeight:700,color:'var(--warning)'}}>💰 {childProfile?.coins || 0}</span>
            </div>
          </div>
        </header>
        <TrialBanner />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
      <MobileNav navItems={navItems} pinnedCount={4} />
    </div>
  );
}

