import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { moduleAllowed } from '../../lib/familyModules';
import api, { apiOrigin } from '../../services/api';
import { PRESET_AVATARS } from '../../components/AvatarPicker';

export default function ParentDashboard() {
  const { t } = useLanguage();
  const { user, modules } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const { data: d } = await api.get('/reports/dashboard'); setData(d); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex-center" style={{padding:60}}><span style={{fontSize:'2rem'}}>⏳</span></div>;
  if (!data) return null;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('welcome')}, {user?.name?.split(' ')[0]}! 👋</h1>
        <p className="page-subtitle">{t('report_overview')}</p>
      </div>

      <div className={`grid mb-24 ${moduleAllowed(modules, 'family_shop') ? 'grid-4' : 'grid-3'}`}>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(108,92,231,0.1)',color:'var(--primary)'}}>📋</div>
          <div className="stat-info">
            <h3>{data.stats.pending}</h3>
            <p>{t('pending_tasks')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(0,184,148,0.1)',color:'var(--success)'}}>✅</div>
          <div className="stat-info">
            <h3>{data.stats.completed}</h3>
            <p>{t('pending_approvals')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(253,203,110,0.15)',color:'#E67E22'}}>🏆</div>
          <div className="stat-info">
            <h3>{data.stats.approved}</h3>
            <p>{t('tasks_completed')}</p>
          </div>
        </div>
        {moduleAllowed(modules, 'family_shop') && (
          <div className="stat-card">
            <div className="stat-icon" style={{background:'rgba(232,67,147,0.1)',color:'var(--accent)'}}>🛍️</div>
            <div className="stat-info">
              <h3>{data.stats.pendingRedemptions}</h3>
              <p>{t('nav_family_shop')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-3 mb-24">
        {data.children.map(child => (
          <div key={child.id} className="card" style={{borderLeft:`4px solid ${child.color}`}}>
            <div className="flex gap-12" style={{alignItems:'center',marginBottom:16}}>
              <div className="avatar" style={{background:`linear-gradient(135deg, ${child.color}, ${child.color}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
                {child.avatar_url ? (
                  <img src={`${apiOrigin}${child.avatar_url}`} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                ) : (
                  child.avatar_preset ? PRESET_AVATARS.find(a => a.id === child.avatar_preset)?.emoji : child.name[0]
                )}
              </div>
              <div>
                <h3 style={{fontWeight:700,fontSize:'1.05rem'}}>{child.name}</h3>
                <div className="flex gap-8" style={{marginTop:4}}>
                  <span className="badge badge-primary">⭐ {t('level')} {child.level}</span>
                  <span className="badge badge-success">{child.points} {t('points')}</span>
                </div>
              </div>
            </div>
            <div className="xp-bar mb-8">
              <div className="xp-fill" style={{width:`${(child.xp / child.xp_next_level) * 100}%`}}></div>
              <div className="xp-text">{child.xp}/{child.xp_next_level} XP</div>
            </div>
            <div className="flex-between" style={{fontSize:'0.82rem',color:'var(--text-light)'}}>
              <span>💰 {child.coins} {t('coins')}</span>
              <span className="streak-flame">🔥 {child.streak_current} {t('days')}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📅 {t('upcoming_events')}</h3>
            <Link to="/parent/calendar" className="btn btn-sm btn-ghost">{t('calendar')}</Link>
          </div>
          {data.upcomingEvents.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📅</div><h3>{t('no_events')}</h3></div>
          ) : data.upcomingEvents.map(ev => (
            <div key={ev.id} className="flex gap-12" style={{padding:'10px 0',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
              <div style={{width:4,height:36,borderRadius:2,background: ev.child_color || 'var(--primary)',flexShrink:0}}></div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:'0.88rem'}}>{ev.title}</div>
                <div style={{fontSize:'0.78rem',color:'var(--text-light)'}}>{new Date(ev.date).toLocaleDateString('pt-BR')} {ev.child_name ? `• ${ev.child_name}` : ''}</div>
              </div>
              <span className="badge badge-info">{t(ev.type)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🕐 {t('recent_activity')}</h3>
          </div>
          {data.recentHistory.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📝</div><h3>Nenhuma atividade</h3></div>
          ) : data.recentHistory.map(h => (
            <div key={h.id} className="flex gap-12" style={{padding:'10px 0',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
              <div className="avatar-sm" style={{background: h.child_color ? `${h.child_color}22` : 'var(--bg)',color: h.child_color || 'var(--text)',fontSize:'1rem',fontWeight:700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
                {h.avatar_url ? (
                  <img src={`${apiOrigin}${h.avatar_url}`} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                ) : (
                  h.avatar_preset ? PRESET_AVATARS.find(a => a.id === h.avatar_preset)?.emoji : h.child_name?.[0]
                )}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:500,fontSize:'0.85rem'}}>{h.event}</div>
                <div style={{fontSize:'0.75rem',color:'var(--text-light)'}}>{h.child_name}</div>
              </div>
              {h.points > 0 && <span className="badge badge-success">+{h.points}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
