import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { anyModuleAllowed, moduleAllowed } from '../../lib/familyModules';
import { roleLabel } from '../../lib/webNavigation';
import api, { publicAssetUrl } from '../../services/api';
import ParentNavIcon from '../ui/ParentNavIcon';
import UserAvatar from '../profile/UserAvatar';
import TrialBanner from '../TrialBanner';

export default function WebFamilyLayout({ role, sections }) {
  const { user, family, modules, effectiveSubscription, logout } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState('');
  const [count, setCount] = useState(0);
  const menuButton = useRef(null);
  const drawer = useRef(null);
  const notificationsOn = moduleAllowed(modules, 'notifications');
  const navigation = useMemo(() => sections.map(section => ({ ...section, items: section.items.filter(item => {
    if (item.to === '/parent/family-administration') return user?.role === 'parent' && user?.access_profile === 'gestor';
    if (item.anyOf) return anyModuleAllowed(modules, item.anyOf);
    return !item.module || moduleAllowed(modules, item.module);
  }) })).filter(section => section.items.length), [sections, modules, user?.role, user?.access_profile]);
  const active = navigation.flatMap(section => section.items).find(item => item.end ? pathname === item.to : pathname.startsWith(item.to));
  const itemLabel = item => item.key === 'dashboard' ? (lang==='pt'?'Visão geral':'Overview') : t(item.key);
  const title = active ? itemLabel(active) : 'Visão geral';

  useEffect(() => {
    if (!notificationsOn) return;
    let alive = true;
    const load = async () => { try { const { data } = await api.get('/notifications/unread-count'); if (alive) setCount(Number(data.count) || 0); } catch { /* notification reads can be retried independently */ } };
    load(); const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [notificationsOn]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.current?.querySelector('a')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus(); }
      if (event.key !== 'Tab') return;
      const focusable = [...drawer.current.querySelectorAll('a,button')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const onResize = () => { if (window.matchMedia('(min-width:901px)').matches) setOpen(false); };
    window.addEventListener('resize',onResize);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey); window.removeEventListener('resize',onResize); };
  }, [open]);
  const toggleNotifications = async () => {
    setNotificationOpen(value => !value);
    if (!notificationOpen) {
      setNotificationError('');
      try { const { data } = await api.get('/notifications'); setNotifications(data || []); }
      catch { setNotificationError('Não foi possível carregar as notificações. Abra novamente para tentar.'); }
    }
  };
  const readAll = async () => { try { await api.put('/notifications/read-all'); setCount(0); setNotifications(rows => rows.map(row => ({ ...row, read: true }))); } catch { setNotificationError('Não foi possível marcar as notificações como lidas. Tente novamente.'); } };
  const closeMenu = () => { setOpen(false); setNotificationOpen(false); };

  return <div className={`professional-workspace ${collapsed ? 'is-collapsed' : ''}`}>
    <a className="site-skip" href="#workspace-content">Pular para o conteúdo</a>
    {open && <button className="workspace-overlay" aria-label="Fechar navegação" onClick={closeMenu} />}
    <aside ref={drawer} className={`workspace-sidebar ${open ? 'is-open' : ''}`} role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label="Navegação da família">
      <NavLink to={role === 'child' ? '/child' : '/parent'} className="workspace-brand" aria-label="Tudo de Família · início" onClick={closeMenu}><img src="/brand/logo.webp" width="42" height="42" alt=""/><span>Tudo de Família<small>GESTÃO E ORGANIZAÇÃO</small></span></NavLink>
      <div className="workspace-family"><span className="workspace-family-icon">{family?.logo_url?<img src={publicAssetUrl(family.logo_url)} width="24" height="24" alt=""/>:<ParentNavIcon name="users" size={19}/>}</span><div><strong>{family?.name || 'Minha família'}</strong><small>{role === 'child' ? 'Perfil do filho' : roleLabel(user)}</small></div></div>
      <nav aria-label="Módulos da família" className="workspace-navigation">{navigation.map(section => <div key={section.label}><p>{section.label}</p>{section.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMenu} aria-label={itemLabel(item)} title={collapsed ? itemLabel(item) : undefined} className={({isActive})=>isActive?'is-active':''}><ParentNavIcon name={item.iconKey || item.module || (item.anyOf ? 'allowance' : 'dashboard')} size={19}/><span>{itemLabel(item)}</span></NavLink>)}</div>)}</nav>
      {effectiveSubscription?.can_manage_billing && <NavLink className="workspace-billing-link" aria-label="Assinatura da família" to="/parent/billing" onClick={closeMenu}><ParentNavIcon name="allowance" size={18}/><span>Assinatura da família</span></NavLink>}
      <div className="workspace-account"><UserAvatar name={user?.name} avatarUrl={user?.avatar_url} avatarPreset={user?.avatar_preset} size={32} bordered={false}/><div><strong>{user?.name}</strong><small>{role === 'child' ? 'Perfil do filho' : roleLabel(user)}</small></div><button type="button" onClick={logout} aria-label="Sair da conta" title="Sair da conta"><ParentNavIcon name="logout" size={18}/></button></div>
    </aside>
    <div className="workspace-main"><header className="workspace-header"><div className="workspace-header-leading"><button ref={menuButton} type="button" className="workspace-menu-button" aria-label="Abrir navegação" aria-expanded={open} onClick={()=>setOpen(true)}><ParentNavIcon name="menu" size={20}/></button><button type="button" className="workspace-collapse-button" aria-label={collapsed?'Expandir navegação':'Recolher navegação'} onClick={()=>setCollapsed(value=>!value)}><ParentNavIcon name="menu" size={18}/></button><nav aria-label="Localização atual" className="workspace-breadcrumb"><span>{family?.name || 'Minha família'}</span><span aria-hidden="true">/</span><strong>{title}</strong></nav></div><div className="workspace-header-actions"><label className="sr-only" htmlFor="workspace-language">Idioma</label><select id="workspace-language" aria-label="Idioma" value={lang} onChange={e=>switchLanguage(e.target.value)}><option value="pt">PT</option><option value="en">EN</option></select>{notificationsOn && <div className="workspace-notifications"><button type="button" aria-label={`Notificações${count ? ` · ${count} não lidas` : ''}`} aria-expanded={notificationOpen} onClick={toggleNotifications}><ParentNavIcon name="bell" size={20}/>{count>0&&<span className="workspace-notification-count">{count>9?'9+':count}</span>}</button>{notificationOpen&&<section className="workspace-notification-panel" aria-label="Notificações"><header><h2>Notificações</h2><button type="button" onClick={readAll}>Marcar como lidas</button></header>{notificationError?<p role="alert">{notificationError}</p>:notifications.length===0?<p>Nenhuma notificação no momento.</p>:notifications.slice(0,10).map(row=><article key={row.id}><strong>{row.title}</strong><p>{row.message}</p></article>)}</section>}</div>}<span className="workspace-profile-label">{user?.name?.split(' ')[0]}</span></div></header><TrialBanner/><main id="workspace-content" className="workspace-content"><Outlet/></main><footer className="workspace-footer"><span>© {new Date().getFullYear()} Tudo de Família</span><nav aria-label="Links institucionais"><a href="/privacy.html">Privacidade</a><a href="/terms.html">Termos de uso</a></nav></footer></div>
  </div>;
}

