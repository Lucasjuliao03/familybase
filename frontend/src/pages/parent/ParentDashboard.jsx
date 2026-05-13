import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { moduleAllowed } from '../../lib/familyModules';
import api, { publicAssetUrl } from '../../services/api';
import { PRESET_AVATARS } from '../../components/AvatarPicker';

const ChildCard = memo(function ChildCard({ child, t }) {
  const xpPct = child.xp_next_level > 0 ? Math.min((child.xp / child.xp_next_level) * 100, 100) : 0;
  const avatar = PRESET_AVATARS.find(a => a.id === child.avatar_preset);
  return (
    <div className="child-dash-card" style={{ '--c': child.color || '#6366F1' }}>
      <div className="child-dash-card__header">
        <div className="child-dash-card__avatar">
          {child.avatar_url
            ? <img src={publicAssetUrl(child.avatar_url)} alt="" />
            : <span>{avatar?.emoji || child.name?.[0] || '👤'}</span>}
        </div>
        <div>
          <div className="child-dash-card__name">{child.name}</div>
          <div className="child-dash-card__level">⭐ Nível {child.level}</div>
        </div>
        {child.streak_current > 0 && (
          <div className="child-dash-card__streak" title={`${child.streak_current} dias seguidos`}>
            🔥 {child.streak_current}
          </div>
        )}
      </div>
      <div className="child-dash-card__xpbar">
        <div className="child-dash-card__xpbar-fill" style={{ width: `${xpPct}%` }} />
      </div>
      <div className="child-dash-card__xplabel">{child.xp} / {child.xp_next_level} XP</div>
      <div className="child-dash-card__stats">
        <div className="child-dash-card__stat">
          <span className="child-dash-card__stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>⭐</span>
          <div>
            <div className="child-dash-card__stat-val">{child.points}</div>
            <div className="child-dash-card__stat-lbl">{t('points')}</div>
          </div>
        </div>
        <div className="child-dash-card__stat">
          <span className="child-dash-card__stat-icon" style={{ background: 'rgba(249,115,22,0.1)', color: '#F97316' }}>🪙</span>
          <div>
            <div className="child-dash-card__stat-val">{child.coins}</div>
            <div className="child-dash-card__stat-lbl">{t('coins')}</div>
          </div>
        </div>
        <div className="child-dash-card__stat">
          <span className="child-dash-card__stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>✅</span>
          <div>
            <div className="child-dash-card__stat-val">{child.completed || 0}</div>
            <div className="child-dash-card__stat-lbl">Concluídas</div>
          </div>
        </div>
      </div>
    </div>
  );
});

const QuickAction = memo(function QuickAction({ to, icon, label, color }) {
  return (
    <Link to={to} className="quick-action" style={{ '--qa-color': color }}>
      <span className="quick-action__icon">{icon}</span>
      <span className="quick-action__label">{label}</span>
    </Link>
  );
});

export default function ParentDashboard() {
  const { t } = useLanguage();
  const { user, family, modules } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const greeting = useMemo(() => {
    const h = now.getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }, [now]);

  const fetchDashboard = useCallback(async () => {
    try { const { data: d } = await api.get('/reports/dashboard'); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading) return (
    <div className="dash-loading">
      <div className="dash-loading__spinner" />
      <p>Carregando painel…</p>
    </div>
  );

  const stats    = useMemo(() => data?.stats           || {}, [data]);
  const children = useMemo(() => data?.children        || [], [data]);
  const events   = useMemo(() => data?.upcomingEvents  || [], [data]);
  const history  = useMemo(() => data?.recentHistory   || [], [data]);

  return (
    <div className="parent-dash animate-fade-in">

      {/* ── Hero Banner ────────────────────────── */}
      <div className="dash-hero">
        <div className="dash-hero__left">
          <div className="dash-hero__greeting">
            {greeting}, <strong>{user?.name?.split(' ')[0] || 'Gestor'}</strong>! 👋
          </div>
          <p className="dash-hero__sub">
            {family?.name ? `Família ${family.name}` : 'Base Familiar'} · {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="dash-hero__actions">
            <button className="btn btn-primary" onClick={() => navigate('/parent/tasks')}>
              ＋ Nova Tarefa
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/parent/calendar')} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              📅 Calendário
            </button>
          </div>
        </div>
        <div className="dash-hero__right hide-mobile">
          <div className="dash-hero__stats-mini">
            <div className="dash-hero__stat-mini">
              <span className="dash-hero__stat-num">{children.length}</span>
              <span className="dash-hero__stat-lbl">Filhos</span>
            </div>
            <div className="dash-hero__stat-divider" />
            <div className="dash-hero__stat-mini">
              <span className="dash-hero__stat-num">{stats.pending || 0}</span>
              <span className="dash-hero__stat-lbl">Pendentes</span>
            </div>
            <div className="dash-hero__stat-divider" />
            <div className="dash-hero__stat-mini">
              <span className="dash-hero__stat-num">{stats.approved || 0}</span>
              <span className="dash-hero__stat-lbl">Aprovadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────── */}
      <div className="dash-kpis">
        <div className="stat-card grad-purple">
          <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>📋</div>
          <div className="stat-info">
            <h3>{stats.pending ?? '–'}</h3>
            <p>{t('pending_tasks')}</p>
          </div>
        </div>
        <div className="stat-card grad-orange">
          <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>⏳</div>
          <div className="stat-info">
            <h3>{stats.waitingApproval ?? stats.completed ?? '–'}</h3>
            <p>Aguardam Aprovação</p>
          </div>
        </div>
        <div className="stat-card grad-green">
          <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>✅</div>
          <div className="stat-info">
            <h3>{stats.approved ?? '–'}</h3>
            <p>{t('tasks_completed')}</p>
          </div>
        </div>
        {moduleAllowed(modules, 'family_shop') && (
          <div className="stat-card grad-blue">
            <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>🛍️</div>
            <div className="stat-info">
              <h3>{stats.pendingRedemptions ?? '–'}</h3>
              <p>Resgates Pendentes</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Actions ─────────────────────── */}
      <div className="dash-section">
        <div className="dash-section__head">
          <h2 className="dash-section__title">⚡ Acesso Rápido</h2>
        </div>
        <div className="quick-actions-grid">
          <QuickAction to="/parent/tasks"               icon="✅" label="Tarefas"          color="#6366F1" />
          <QuickAction to="/parent/tasks?tab=approval"  icon="👍" label="Aprovações"       color="#F97316" />
          <QuickAction to="/parent/grades"              icon="📚" label="Notas"            color="#3B82F6" />
          <QuickAction to="/parent/allowance"           icon="💰" label="Mesada"           color="#10B981" />
          {moduleAllowed(modules, 'health') && <QuickAction to="/parent/health" icon="❤️" label="Saúde"   color="#EC4899" />}
          {moduleAllowed(modules, 'shopping') && <QuickAction to="/parent/shopping" icon="🛒" label="Compras" color="#14B8A6" />}
          {moduleAllowed(modules, 'mural') && <QuickAction to="/parent/mural" icon="📌" label="Mural"     color="#8B5CF6" />}
          <QuickAction to="/parent/reports"             icon="📊" label="Relatórios"       color="#6366F1" />
        </div>
      </div>

      {/* ── Filhos ────────────────────────────── */}
      {children.length > 0 && (
        <div className="dash-section">
          <div className="dash-section__head">
            <h2 className="dash-section__title">👨‍👩‍👧‍👦 Meus Filhos</h2>
            <Link to="/parent/family-administration" className="btn btn-sm btn-ghost">Gerir família</Link>
          </div>
          <div className="children-grid">
            {children.map(child => <ChildCard key={child.id} child={child} t={t} />)}
          </div>
        </div>
      )}

      {/* ── Eventos + Atividade ───────────────── */}
      <div className="dash-section dash-bottom-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📅 {t('upcoming_events')}</h3>
            <Link to="/parent/calendar" className="btn btn-sm btn-ghost">{t('calendar')}</Link>
          </div>
          {events.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-icon">📅</div>
              <h3>Sem eventos próximos</h3>
            </div>
          ) : events.map(ev => (
            <div key={ev.id} className="event-row">
              <div className="event-row__dot" style={{ background: ev.child_color || '#6366F1' }} />
              <div className="event-row__body">
                <div className="event-row__title">{ev.title}</div>
                <div className="event-row__meta">
                  {new Date(ev.date).toLocaleDateString('pt-BR')}
                  {ev.child_name ? ` · ${ev.child_name}` : ''}
                </div>
              </div>
              <span className="badge badge-primary">{t(ev.type)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🕐 {t('recent_activity')}</h3>
          </div>
          {history.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-icon">📝</div>
              <h3>Sem atividade recente</h3>
            </div>
          ) : history.map(h => (
            <div key={h.id} className="activity-row">
              <div className="activity-row__avatar"
                style={{ background: h.child_color ? `${h.child_color}22` : 'var(--bg)', color: h.child_color || 'var(--text)' }}>
                {h.avatar_url
                  ? <img src={publicAssetUrl(h.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (PRESET_AVATARS.find(a => a.id === h.avatar_preset)?.emoji || h.child_name?.[0] || '👤')}
              </div>
              <div className="activity-row__body">
                <div className="activity-row__event">{h.event}</div>
                <div className="activity-row__child">{h.child_name}</div>
              </div>
              {h.points > 0 && <span className="badge badge-success">+{h.points} pts</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ────────────────────────────── */}
      <footer className="dash-footer">
        <span>© 2025 Base Familiar</span>
        <div className="dash-footer__links">
          <a href="#sobre">Sobre</a>
          <a href="#privacidade">Privacidade</a>
          <a href="#termos">Termos de Serviço</a>
        </div>
      </footer>
    </div>
  );
}
