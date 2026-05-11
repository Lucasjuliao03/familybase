import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';

export default function FamilyShopManager() {
  const { t } = useLanguage();
  const toast = useToast();

  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [tab, setTab] = useState('shop');
  const [showRewardModal, setShowRewardModal] = useState(false);
  const initialRewardForm = { id: null, name: '', point_cost: 50, type: 'non_financial', icon: '🎁', is_active: 1 };
  const [rewardForm, setRewardForm] = useState(initialRewardForm);

  const fetchData = async () => {
    try {
      const [rRewards, rReds] = await Promise.all([
        api.get('/allowance/rewards/list'),
        api.get('/allowance/redemptions/list'),
      ]);
      setRewards(rRewards.data || []);
      setRedemptions(rReds.data || []);
    } catch (e) {
      console.error(e);
      toast.error(t('error_occurred'));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveReward = async (e) => {
    e.preventDefault();
    try {
      if (rewardForm.id) await api.put(`/allowance/rewards/${rewardForm.id}`, rewardForm);
      else await api.post('/allowance/rewards', rewardForm);
      toast.success(t('reward_created'));
      setShowRewardModal(false);
      fetchData();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const handleDeleteReward = async (id) => {
    if (!confirm('Excluir recompensa?')) return;
    try {
      await api.delete(`/allowance/rewards/${id}`);
      toast.success('Excluída!');
      fetchData();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const handleApproveRedemption = async (id, approved) => {
    try {
      await api.put(`/allowance/redemptions/${id}/approve`, { approved });
      toast.success(approved ? t('task_approved_msg') : t('task_rejected_msg'));
      fetchData();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const icons = ['🎁', '🎬', '🍰', '🎮', '🎢', '🍕', '💰', '📚', '⚽', '🎨', '🎵', '🐶'];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">
          🛍️ {t('family_shop_management')}
        </h1>
        <p className="page-subtitle">{t('family_shop_subtitle')}</p>
      </div>

      <div className="tabs mb-24" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>
          🎁 {t('reward_shop')}
        </button>
        <button type="button" className={`tab ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>
          📋 {t('pending_approvals')}
        </button>
      </div>

      {tab === 'shop' && (
        <div>
          <div className="flex-between mb-16">
            <h3>{t('reward_shop')}</h3>
            <button type="button" className="btn btn-primary" onClick={() => { setRewardForm(initialRewardForm); setShowRewardModal(true); }}>
              + {t('add_reward')}
            </button>
          </div>
          <div className="grid grid-3">
            {rewards.map((r) => (
              <div key={r.id} className="card" style={{ textAlign: 'center', opacity: r.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                  <button type="button" className="btn-icon btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setRewardForm(r); setShowRewardModal(true); }}>✏️</button>
                  <button type="button" className="btn-icon btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => handleDeleteReward(r.id)}>🗑️</button>
                </div>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{r.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>{r.name}</h3>
                <div style={{ marginTop: 8 }}><span className="badge badge-primary">⭐ {r.point_cost} {t('points')}</span></div>
                <div style={{ marginTop: 4 }}><span className="badge badge-info">{t(r.type)}</span></div>
                {!r.is_active && <div style={{ marginTop: 8 }}><span className="badge badge-danger">Desativada</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="card">
          <h3 className="card-title mb-16">📋 {t('pending_approvals')}</h3>
          {redemptions.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">✅</div><h3>{t('all_caught_up')}</h3></div>
          ) : (
            redemptions.map((r) => (
              <div key={r.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="flex gap-16" style={{ alignItems: 'center' }}>
                  <div style={{ fontSize: '2rem' }}>{r.icon}</div>
                  <div>
                    <h4 style={{ fontWeight: 700 }}>
                      {r.reward_name}
                      {' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>
                        para {r.child_name}
                      </span>
                    </h4>
                    <span className="badge badge-primary mt-8">⭐ {r.point_cost} {t('points')}</span>
                  </div>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex gap-8">
                    <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleApproveRedemption(r.id, false)}>✕</button>
                    <button type="button" className="btn btn-primary" onClick={() => handleApproveRedemption(r.id, true)}>Aprovar</button>
                  </div>
                ) : (
                  <span className={`badge badge-${r.status === 'approved' ? 'success' : 'danger'}`}>{t(r.status)}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {showRewardModal && (
        <div className="modal-overlay" onClick={() => setShowRewardModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{rewardForm.id ? t('edit_reward') : t('add_reward')}</h2>
              <button type="button" className="modal-close" onClick={() => setShowRewardModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveReward}>
              <div className="form-group"><label className="form-label">{t('reward_name')} *</label><input className="form-input" value={rewardForm.name} onChange={(e) => setRewardForm((p) => ({ ...p, name: e.target.value }))} required /></div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('cost_points')} *</label><input type="number" min="0" className="form-input" value={rewardForm.point_cost} onChange={(e) => setRewardForm((p) => ({ ...p, point_cost: parseInt(e.target.value, 10) }))} required /></div>
                <div className="form-group"><label className="form-label">{t('reward_type')}</label>
                  <select className="form-select" value={rewardForm.type} onChange={(e) => setRewardForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="non_financial">Não-financeira (Passeio, TV)</option>
                    <option value="financial">Financeira (Dinheiro, Compra)</option>
                    <option value="surprise">Surpresa</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Ícone</label><div className="flex gap-8" style={{ flexWrap: 'wrap' }}>{icons.map((ic) => <button key={ic} type="button" onClick={() => setRewardForm((p) => ({ ...p, icon: ic }))} style={{ width: 40, height: 40, fontSize: '1.5rem', background: 'none', border: rewardForm.icon === ic ? '2px solid var(--primary)' : '2px solid transparent', borderRadius: 8, cursor: 'pointer' }}>{ic}</button>)}</div></div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={rewardForm.is_active === 1} onChange={(e) => setRewardForm((p) => ({ ...p, is_active: e.target.checked ? 1 : 0 }))} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                  <span className="form-label" style={{ margin: 0 }}>Recompensa Ativa (visível na loja)</span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowRewardModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
