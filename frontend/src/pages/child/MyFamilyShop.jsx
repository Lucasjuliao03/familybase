import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';

export default function MyFamilyShop() {
  const { childProfile, fetchMe } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const toast = useToast();

  const [tab, setTab] = useState('shop');
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);

  const fetchData = useCallback(async () => {
    if (!childProfile) return;
    try {
      const [rRew, rRed] = await Promise.all([
        api.get('/allowance/rewards/list'),
        api.get('/allowance/redemptions/list'),
      ]);
      setRewards(rRew.data || []);
      setRedemptions(rRed.data || []);
    } catch (e) {
      console.error(e);
      toast.error(t('error_occurred'));
    }
  }, [childProfile, t, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, location.pathname]);

  useAutoRefresh(fetchData, 2600);

  const pendingReservedPoints = useMemo(
    () =>
      redemptions
        .filter((r) => r.status === 'pending')
        .reduce((acc, r) => acc + (Number.isFinite(Number(r.point_cost)) ? Number(r.point_cost) : 0), 0),
    [redemptions],
  );

  const spendablePoints = Math.max(0, Number(childProfile?.points ?? 0) - pendingReservedPoints);

  const handleRedeem = async (rewardId) => {
    try {
      await api.post(`/allowance/rewards/${rewardId}/redeem`);
      toast.success('Resgate solicitado! 🎉');
      await fetchMe?.().catch(() => {});
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="page-title mb-8">🛍️ {t('my_family_shop')}</h1>
      <p className="page-subtitle mb-24">
        {t('your_points')}{' '}
        <strong style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>⭐ {childProfile?.points ?? 0}</strong>
        {pendingReservedPoints > 0 ? (
          <span style={{ display: 'block', marginTop: 8, fontSize: '0.92rem', color: 'var(--text-light)', maxWidth: 520 }}>
            {pendingReservedPoints} pts retidos em pedidos pendentes ·{' '}
            <strong style={{ color: 'var(--text)' }}>{spendablePoints} pts</strong> livres para novos pedidos (até aprovação).
          </span>
        ) : null}
      </p>

      <div className="tabs mb-24" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>🛒 {t('reward_shop')}</button>
        <button type="button" className={`tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>📋 {t('my_redemptions')}</button>
      </div>

      {tab === 'shop' && (
        <div className="grid grid-3">
          {rewards.map((r) => {
            const canAfford = spendablePoints >= Number(r.point_cost ?? 0);
            return (
              <div key={r.id} className="card" style={{ textAlign: 'center', opacity: canAfford ? 1 : 0.6 }}>
                <div style={{ fontSize: '3rem', marginBottom: 8 }}>{r.icon}</div>
                <h3 style={{ fontWeight: 700 }}>{r.name}</h3>
                <div className="mt-8"><span className="badge badge-primary" style={{ fontSize: '0.9rem' }}>⭐ {r.point_cost} {t('points')}</span></div>
                <button type="button" className="btn btn-sm btn-secondary mt-16" disabled={!canAfford} onClick={() => handleRedeem(r.id)}>
                  {canAfford ? `🎁 ${t('redeem')}` : `🔒 ${t('insufficient_points')}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'my' && (
        <div>
          {redemptions.length === 0 ? (
            <div className="card empty-state"><div className="empty-icon">📋</div><h3>Nenhum resgate ainda</h3></div>
          ) : (
            redemptions.map((r) => (
              <div key={r.id} className="card mb-8 flex-between">
                <div className="flex gap-12" style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem' }}>{r.icon || '🎁'}</span>
                  <div>
                    <strong>{(r.reward_name || '').trim() || 'Recompensa'}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                      {typeof r.point_cost === 'number' ? `⭐ ${r.point_cost}` : '⭐ —'} {t('points')}
                      {r.status === 'approved'
                        ? ' · descontados na aprovação'
                        : r.status === 'pending'
                          ? ' · ficam retidos até o gestor aprovar'
                          : ''}
                    </div>
                  </div>
                </div>
                <span className={`badge badge-${r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'danger'}`}>{t(r.status)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
