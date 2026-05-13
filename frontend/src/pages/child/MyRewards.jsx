import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';

export default function MyRewards() {
  const { childProfile } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [tab, setTab] = useState('shop');

  useEffect(() => {
    api.get('/allowance/rewards/list').then(r => setRewards(r.data)).catch(() => {});
    api.get('/allowance/redemptions/list').then(r => setRedemptions(r.data)).catch(() => {});
  }, []);

  const handleRedeem = async (rewardId) => {
    try { await api.post(`/allowance/rewards/${rewardId}/redeem`); toast.success('Resgate solicitado! 🎉');
      api.get('/allowance/redemptions/list').then(r => setRedemptions(r.data));
    } catch (err) { toast.error(err.response?.data?.error || t('error_occurred')); }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="page-title mb-8">🎁 {t('my_rewards')}</h1>
      <p className="page-subtitle mb-24">Seus pontos: <strong style={{color:'var(--primary)',fontSize:'1.2rem'}}>⭐ {childProfile?.points || 0}</strong></p>

      <div className="tabs mb-24">
        <button className={`tab ${tab==='shop'?'active':''}`} onClick={() => setTab('shop')}>🛒 {t('reward_shop')}</button>
        <button className={`tab ${tab==='my'?'active':''}`} onClick={() => setTab('my')}>📋 Meus Resgates</button>
      </div>

      {tab === 'shop' && (
        <div className="grid grid-3">
          {rewards.map(r => {
            const canAfford = (childProfile?.points || 0) >= r.point_cost;
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
              <div className="flex gap-12" style={{alignItems:'center'}}><span style={{fontSize:'1.5rem'}}>{r.icon}</span><div><strong>{r.reward_name}</strong><div style={{fontSize:'0.8rem',color:'var(--text-light)'}}>⭐ {r.point_cost} pontos</div></div></div>
              <span className={`badge badge-${r.status==='pending'?'warning':r.status==='approved'?'success':'danger'}`}>{t(r.status)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
