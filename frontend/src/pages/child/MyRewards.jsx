import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';

export default function MyRewards() {
  const { childProfile, fetchMe } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [tab, setTab] = useState('shop');

  useEffect(() => {
    api.get('/allowance/rewards/list').then(r => setRewards(r.data)).catch(() => {});
    api.get('/allowance/redemptions/list').then(r => setRedemptions(r.data)).catch(() => {});
  }, []);

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
      const r = await api.get('/allowance/redemptions/list');
      setRedemptions(r.data || []);
    } catch (err) { toast.error(err?.message || err.response?.data?.error || t('error_occurred')); }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="page-title mb-8">🎁 {t('my_rewards')}</h1>
      <p className="page-subtitle mb-24">
        Seus pontos:{' '}
        <strong style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>⭐ {childProfile?.points ?? 0}</strong>
        {pendingReservedPoints > 0 ? (
          <span style={{ display: 'block', marginTop: 8, fontSize: '0.92rem', color: 'var(--text-light)' }}>
            {pendingReservedPoints} pts em pedidos pendentes · <strong>{spendablePoints} pts</strong> livres para novos pedidos.
          </span>
        ) : null}
      </p>

      <div className="tabs mb-24">
        <button className={`tab ${tab==='shop'?'active':''}`} onClick={() => setTab('shop')}>🛒 {t('reward_shop')}</button>
        <button className={`tab ${tab==='my'?'active':''}`} onClick={() => setTab('my')}>📋 Meus Resgates</button>
      </div>

      {tab === 'shop' && (
        <div className="grid grid-3">
          {rewards.map(r => {
            const canAfford = spendablePoints >= Number(r.point_cost ?? 0);
            return (
              <div key={r.id} className="card" style={{textAlign:'center',opacity: canAfford ? 1 : 0.6}}>
                <div style={{fontSize:'3rem',marginBottom:8}}>{r.icon}</div>
                <h3 style={{fontWeight:700}}>{r.name}</h3>
                <div className="mt-8"><span className="badge badge-primary" style={{fontSize:'0.9rem'}}>⭐ {r.point_cost} {t('points')}</span></div>
                <button className="btn btn-sm btn-secondary mt-16" disabled={!canAfford} onClick={() => handleRedeem(r.id)}>
                  {canAfford ? `🎁 ${t('redeem')}` : `🔒 ${t('insufficient_points')}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'my' && (
        <div>{redemptions.length === 0 ? <div className="card empty-state"><div className="empty-icon">📋</div><h3>Nenhum resgate ainda</h3></div> :
          redemptions.map(r => (
            <div key={r.id} className="card mb-8 flex-between">
              <div className="flex gap-12" style={{alignItems:'center'}}>
                <span style={{fontSize:'1.5rem'}}>{r.icon || '🎁'}</span>
                <div>
                  <strong>{(r.reward_name || '').trim() || 'Recompensa'}</strong>
                  <div style={{fontSize:'0.8rem',color:'var(--text-light)'}}>
                    {typeof r.point_cost === 'number' ? `⭐ ${r.point_cost}` : '⭐ —'} {t('points')}
                  </div>
                </div>
              </div>
              <span className={`badge badge-${r.status==='pending'?'warning':r.status==='approved'?'success':'danger'}`}>{t(r.status)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
