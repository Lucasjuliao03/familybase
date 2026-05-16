import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';
import {
  childDashboardTodayYMD,
  dedupeOccurrencesByDayAndTitle,
  dedupeOccurrencesById,
} from '../../lib/childDashboardDedupe';

/** Rota índice do perfil filho: `/child` ou `/child/`. */
function isChildHomePath(pathname) {
  const p = (pathname || '').replace(/\/+$/, '');
  return p === '/child';
}

export default function ChildDashboard() {
  const location = useLocation();
  const { childProfile } = useAuth();
  const { t } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [occurrences, setOccurrences] = useState([]);

  const loadGenRef = useRef(0);

  /**
   * Só pede dados na página inicial /child — evita race em rotas vizinhas,
   * e garante novo pedido sempre que volta ao dashboard (`location.key`).
   */
  const loadDashboard = useCallback(async () => {
    const effectiveChildId = childProfile?.id;
    if (!effectiveChildId) return;
    const path = location.pathname || '';
    if (!isChildHomePath(path)) return;

    const gen = ++loadGenRef.current;
    const today = childDashboardTodayYMD();

    try {
      const [profRes, occRes] = await Promise.all([
        api.get(`/gamification/profile/${effectiveChildId}`),
        api.get('/tasks/occurrences', {
          params: { status: 'pending', child_id: effectiveChildId, date: today },
        }),
      ]);
      if (gen !== loadGenRef.current) return;
      setProfile(profRes.data);
      let occ = occRes.data || [];
      occ = dedupeOccurrencesByDayAndTitle(dedupeOccurrencesById(occ));
      setOccurrences(occ.slice(0, 8));
    } catch {
      /* Não limpar sempre: mantém último estado; próximo ciclo volta a tentar. */
      if (gen !== loadGenRef.current) return;
    }
  }, [childProfile?.id, location.pathname]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /** Reforço tab/foco/offline sem duplo fetch na entrada (pathname já coberto pelo efecto anterior). */
  useAutoRefresh(loadDashboard, 800, { includeRouteChanges: false });

  /** Após ~00:01 local e ao virar o dia civil, repede ocorrências (materializa diárias no servidor). */
  useDailyCalendarRefresh(loadDashboard);

  const child = profile?.child || childProfile;
  if (!child) return <div className="flex-center" style={{ padding: 60, fontSize: '2rem' }}>⏳</div>;

  const xpPercent = child.xp_next_level > 0 ? (child.xp / child.xp_next_level) * 100 : 0;

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ textAlign: 'center' }}>
        <h1
          className="page-title"
          style={{
            fontSize: 'clamp(1.25rem, 5vw, 2.2rem)',
            wordBreak: 'break-word',
            lineHeight: 1.2,
          }}
        >
          {t('child_dashboard_title')}, {child.name}! 🎉
        </h1>
        <p className="page-subtitle" style={{ fontSize: 'clamp(0.95rem, 3.5vw, 1.1rem)' }}>
          {t('keep_going')}
        </p>
      </div>

      {/* Level & XP */}
      <div
        className="card mb-24"
        style={{
          textAlign: 'center',
          background: `linear-gradient(135deg, ${child.color}25, ${child.color}05)`,
          border: 'none',
          boxShadow: `0 10px 30px ${child.color}20`,
        }}
      >
        <div
          className="level-badge"
          style={{
            fontSize: '1.3rem',
            padding: '12px 30px',
            marginBottom: 16,
            background: child.color,
            color: '#fff',
            display: 'inline-block',
            borderRadius: 50,
            fontWeight: 800,
          }}
        >
          ⭐ {t('level')} {child.level}
        </div>
        <div
          className="xp-bar"
          style={{
            height: 28,
            maxWidth: 'min(500px, 100%)',
            margin: '0 auto',
            width: '100%',
            background: 'rgba(255,255,255,0.5)',
            border: '2px solid rgba(0,0,0,0.05)',
          }}
        >
          <div
            className="xp-fill"
            style={{ width: `${xpPercent}%`, background: `linear-gradient(90deg, ${child.color}, #fff)` }}
          />
          <div className="xp-text" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2d3436' }}>
            {child.xp} / {child.xp_next_level} XP
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-4 mb-24">
        <div className="stat-card" style={{ boxShadow: '0 8px 20px rgba(108,92,231,0.1)' }}>
          <div className="stat-icon" style={{ background: 'rgba(108,92,231,0.1)', fontSize: '1.5rem' }}>⭐</div>
          <div className="stat-info">
            <h3>{child.points}</h3>
            <p>{t('points')}</p>
          </div>
        </div>
        <div className="stat-card" style={{ boxShadow: '0 8px 20px rgba(253,203,110,0.2)' }}>
          <div
            className="stat-icon"
            style={{ background: 'rgba(253,203,110,0.15)', color: '#E67E22', fontSize: '1.5rem' }}
          >
            🪙
          </div>
          <div className="stat-info">
            <h3>{child.coins}</h3>
            <p>Moedas</p>
          </div>
        </div>
        <div className="stat-card" style={{ boxShadow: '0 8px 20px rgba(225,112,85,0.1)' }}>
          <div className="stat-icon" style={{ background: 'rgba(225,112,85,0.1)', fontSize: '1.5rem' }}>🔥</div>
          <div className="stat-info">
            <h3>{child.streak_current}</h3>
            <p>{t('streak')}</p>
          </div>
        </div>
        <div className="stat-card" style={{ boxShadow: '0 8px 20px rgba(0,184,148,0.1)' }}>
          <div className="stat-icon" style={{ background: 'rgba(0,184,148,0.1)', fontSize: '1.5rem' }}>🏅</div>
          <div className="stat-info">
            <h3>{profile?.stats?.medalsEarned || 0}</h3>
            <p>{t('medals')}</p>
          </div>
        </div>
      </div>

      <div
        className="grid grid-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}
      >
        <div className="card">
          <div className="flex-between mb-16">
            <h3 className="card-title">📅 Tarefas de Hoje</h3>
            <span className="badge badge-primary">{occurrences.length} pendentes</span>
          </div>
          {occurrences.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-icon" style={{ fontSize: '2.5rem' }}>🌈</div>
              <h3>Tudo pronto por hoje!</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>Aproveite seu tempo livre!</p>
            </div>
          ) : (
            occurrences.map((occ) => (
              <div
                key={occ.id}
                className="flex-between"
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 200px' }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: occ.status === 'delayed' ? 'var(--danger)' : 'var(--primary)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', wordBreak: 'break-word' }}>{occ.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {occ.due_time ? `🕒 até ${occ.due_time}` : 'Qualquer hora'} • {t(occ.type)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, color: 'var(--primary)' }}>⭐ {occ.points}</div>
                  {occ.coins > 0 && (
                    <div style={{ fontSize: '0.8rem', color: '#E67E22', fontWeight: 600 }}>🪙 {occ.coins}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-16">🏅 {t('medals')} Recentes</h3>
          <div
            className="grid grid-3"
            style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 96px), 1fr))' }}
          >
            {(profile?.medals || []).slice(0, 6).map((m) => (
              <div key={m.id || m.name} className="medal-card earned" style={{ padding: '12px 8px' }}>
                <div className="medal-icon" style={{ fontSize: '2rem' }}>{m.icon}</div>
                <div className="medal-name" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{m.name}</div>
              </div>
            ))}
            {(profile?.medals?.length || 0) === 0 && (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                <div className="empty-icon" style={{ fontSize: '2rem' }}>🏅</div>
                <h3 style={{ fontSize: '0.9rem' }}>Ganhe pontos para liberar medalhas!</h3>
              </div>
            )}
          </div>
        </div>
      </div>

      {profile?.recentHistory?.length > 0 && (
        <div className="card mt-24">
          <h3 className="card-title mb-16">🕐 {t('recent_activity')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {profile.recentHistory.slice(0, 6).map((h) => (
              <div
                key={h.id}
                className="flex-between"
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{h.event}</span>
                {h.points > 0 && (
                  <span className="badge badge-success" style={{ borderRadius: 6 }}>
                    +{h.points} ⭐
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
