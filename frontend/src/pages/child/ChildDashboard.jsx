import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';
import {
  childDashboardTodayYMD,
  dedupeOccurrencesByDayAndTitle,
  dedupeOccurrencesById,
} from '../../lib/childDashboardDedupe';
import { childGamificationProfileKey, taskOccurrencesQueryKey } from '../../lib/familiaQueryKeys';

/** Rota índice do perfil filho: `/child` ou `/child/`. */
function isChildHomePath(pathname) {
  const p = (pathname || '').replace(/\/+$/, '');
  return p === '/child';
}

function ChildDashboardHeroSkeleton() {
  return (
    <div className="card mb-24 fam-sk-card" aria-busy="true" aria-label="A carregar perfil">
      <div className="fam-sk fam-sk-line" style={{ maxWidth: 180, height: 28, margin: '0 auto 16px' }} />
      <div className="fam-sk" style={{ height: 28, maxWidth: 480, margin: '0 auto', borderRadius: 14 }} />
    </div>
  );
}

function TodayTasksSkeleton() {
  return (
    <div className="card" aria-busy="true">
      <div className="flex-between mb-16">
        <div className="fam-sk fam-sk-line" style={{ width: 180 }} />
        <div className="fam-sk fam-sk-chip" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="fam-sk fam-sk-line fam-sk-line--med" style={{ marginBottom: 16 }} />
      ))}
    </div>
  );
}

export default function ChildDashboard() {
  const location = useLocation();
  const { childProfile } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const enabled = !!childProfile?.id && isChildHomePath(location.pathname || '');
  /** Recalculado em cada render para apanhar viragem de dia sem mudar de rota. */
  const dayKey = childDashboardTodayYMD();

  const profileQueryKey = childGamificationProfileKey(childProfile?.id);

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: async () => {
      const res = await api.get(`/gamification/profile/${childProfile.id}`);
      return res.data;
    },
    enabled: enabled && !!childProfile?.id,
    staleTime: 60_000,
  });

  const occQueryKey = taskOccurrencesQueryKey(
    {
      child_id: childProfile?.id,
      type: '',
    },
    dayKey,
  );

  const occurrencesQuery = useQuery({
    queryKey: occQueryKey,
    queryFn: async () => {
      const occRes = await api.get('/tasks/occurrences', {
        params: {
          status: 'pending',
          child_id: childProfile.id,
          date: dayKey,
        },
      });
      let occ = occRes.data || [];
      occ = dedupeOccurrencesByDayAndTitle(dedupeOccurrencesById(occ));
      return occ.slice(0, 8);
    },
    enabled: enabled && !!childProfile?.id,
    staleTime: 45_000,
  });

  useDailyCalendarRefresh(() => {
    const id = childProfile?.id;
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: childGamificationProfileKey(id) });
    queryClient.invalidateQueries({ queryKey: ['tasks', 'occurrences'] });
  }, { enabled: !!childProfile?.id });

  const profile = profileQuery.data;
  const child = profile?.child ?? childProfile;

  const occurrences = occurrencesQuery.data ?? [];
  const profileInitialLoad = profileQuery.isPending && profileQuery.data === undefined && !profileQuery.error;
  const occInitialLoad = occurrencesQuery.isPending && occurrencesQuery.data === undefined && !occurrencesQuery.error;

  /** Placeholder até existir dados mínimos do filho para o hero. */
  if (!child) {
    if (enabled && profileInitialLoad) {
      return (
        <div className="animate-fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
          <div className="page-header" style={{ textAlign: 'center', marginBottom: 24 }}>
            <div className="fam-sk fam-sk-line" style={{ maxWidth: 'min(440px, 100%)', height: 32, margin: '0 auto 12px' }} />
            <div className="fam-sk fam-sk-line fam-sk-line--short" style={{ margin: '0 auto', maxWidth: 280 }} />
          </div>
          <ChildDashboardHeroSkeleton />
          <div className="grid grid-4 mb-24">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card fam-sk-card">
                <div className="fam-sk fam-sk-line" style={{ width: '40%', marginBottom: 12 }} />
                <div className="fam-sk fam-sk-line fam-sk-line--short" />
              </div>
            ))}
          </div>
          <TodayTasksSkeleton />
        </div>
      );
    }
    return (
      <div className="flex-center" style={{ padding: 60, fontSize: '2rem' }} aria-label="À espera do perfil">⏳</div>
    );
  }

  const xpPercent = child.xp_next_level > 0 ? (child.xp / child.xp_next_level) * 100 : 0;

  const showFatalProfileError = profileQuery.isError && profile == null;

  return (
    <div className="animate-fade-in">
      {(profileQuery.isFetching || occurrencesQuery.isFetching) && profile && occurrences.length > 0 && (
        <p className="parent-dash__refetch-banner" style={{ marginBottom: 12 }} aria-live="polite">A atualizar…</p>
      )}

      {showFatalProfileError && (
        <div className="card mb-24" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600 }}>
            Erro ao carregar o seu perfil. {' '}
            <button type="button" className="btn btn-sm btn-primary" onClick={() => profileQuery.refetch()}>
              Tentar novamente
            </button>
          </p>
        </div>
      )}

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
            <h3>{profile?.stats?.medalsEarned ?? (profileInitialLoad ? '–' : 0)}</h3>
            <p>{t('medals')}</p>
          </div>
        </div>
      </div>

      <div
        className="grid grid-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}
      >
        {occInitialLoad && occurrences.length === 0 ? (
          <TodayTasksSkeleton />
        ) : (
          <div className={`card ${occurrencesQuery.isFetching && occurrences.length ? 'fam-sk-loading-wrap' : ''}`} style={occurrencesQuery.isFetching && occurrences.length ? { opacity: 0.97 } : undefined}>
            <div className="flex-between mb-16">
              <h3 className="card-title">📅 Tarefas de Hoje</h3>
              <span className="badge badge-primary">{occurrences.length} pendentes</span>
            </div>
            {occurrencesQuery.isError ? (
              <div className="empty-state">
                <p style={{ marginBottom: 12 }}>Erro ao carregar tarefas.</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => occurrencesQuery.refetch()}>Repetir</button>
              </div>
            ) : occurrencesQuery.isSuccess && occurrences.length === 0 ? (
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
        )}

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
            {profileInitialLoad ? (
              <div className="empty-state fam-sk-card" style={{ gridColumn: '1/-1' }}>
                <div className="fam-sk fam-sk-line fam-sk-line--med" />
              </div>
            ) : (profile?.medals?.length || 0) === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                <div className="empty-icon" style={{ fontSize: '2rem' }}>🏅</div>
                <h3 style={{ fontSize: '0.9rem' }}>Ganhe pontos para liberar medalhas!</h3>
              </div>
            ) : null}
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
