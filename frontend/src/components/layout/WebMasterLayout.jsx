import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { MASTER_SECTIONS } from '../../lib/webNavigation';
import { useAuth } from '../../contexts/AuthContext';
import ParentNavIcon from '../ui/ParentNavIcon';
const sectionIcons = {overview:'dashboard',families:'users',users:'users',subscriptions:'allowance',payments:'allowance',plans:'clipboard',modules:'settings',content:'mural',notifications:'bell',settings:'settings',audit:'reports',operations:'activity'};
export default function WebMasterLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const label = MASTER_SECTIONS.find(([key]) => pathname.endsWith('/'+key))?.[1] || 'Visão geral';
  useEffect(()=>{
    if (!open) return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=event=>{if(event.key==='Escape')setOpen(false);};
    window.addEventListener('keydown',onKey);
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey);};
  },[open]);
  return <div className="web-master-layout">
    <a href="#master-content" className="site-skip">Pular para o conteúdo</a>
    {open && <button className="web-master-overlay" aria-label="Fechar navegação" onClick={() => setOpen(false)} />}
    <aside className={`web-master-sidebar ${open ? 'is-open' : ''}`} role={open?'dialog':undefined} aria-modal={open||undefined} aria-label="Navegação administrativa">
      <a href="/" className="web-master-brand"><img src="/brand/logo.webp" width="52" height="52" alt="" /><div>Tudo de Família<small>ADMINISTRADOR MASTER</small></div></a>
      <nav aria-label="Administração da plataforma">{MASTER_SECTIONS.map(([key, text]) => <NavLink key={key} end to={key === 'overview' ? '/master' : `/master/${key}`} onClick={() => setOpen(false)} className={({isActive}) => isActive ? 'active' : ''}><ParentNavIcon name={sectionIcons[key]} size={18}/>{text}</NavLink>)}</nav>
      <div className="web-master-account"><strong>{user?.name}</strong><small>Segundo fator confirmado</small><button className="btn btn-ghost" onClick={logout}>Sair da administração</button></div>
    </aside>
    <main id="master-content" className="web-master-main"><header className="web-master-header"><button className="web-master-menu btn btn-ghost" aria-label="Abrir menu administrativo" aria-expanded={open} onClick={() => setOpen(!open)}><ParentNavIcon name="menu" size={20}/></button><span>Plataforma / <strong>{label}</strong></span><span className="web-secure-badge">Acesso protegido</span></header><div className="web-master-content"><Outlet /></div></main>
  </div>;
}
