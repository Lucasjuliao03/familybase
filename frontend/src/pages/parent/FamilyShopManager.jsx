import ModuleTitle, { ModuleIcon } from '../../components/web/ModuleTitle';
import { useState, useCallback, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { isRewardAvailable } from '../../lib/rewardStore';

const initialRewardForm = { id: null, name: '', point_cost: 50, type: 'non_financial', icon: '🎁', is_active: true };

export default function FamilyShopManager() {
  const { t } = useLanguage();
  const toast = useToast();

  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [tab, setTab] = useState('shop');
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardForm, setRewardForm] = useState(initialRewardForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutationRef = useRef(false);
  const loadVersion = useRef(0);

  const fetchData = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const [rRewards, rReds] = await Promise.all([
        api.get('/allowance/rewards/list'),
        api.get('/allowance/redemptions/list'),
      ]);
      if (version !== loadVersion.current) return;
      setRewards(rRewards.data || []);
      setRedemptions(rReds.data || []);
      setLoadError('');
    } catch (e) {
      if (version === loadVersion.current) setLoadError(e.message || 'Não foi possível atualizar a loja.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);
  useAutoRefresh(fetchData);

  const handleSaveReward = async (e) => {
    e.preventDefault();
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      if (rewardForm.id) await api.put(`/allowance/rewards/${rewardForm.id}`, rewardForm);
      else await api.post('/allowance/rewards', rewardForm);
      toast.success(rewardForm.id ? 'Recompensa atualizada!' : t('reward_created'));
      setShowRewardModal(false);
      await fetchData();
    } catch (err) {
      toast.error(err.message || t('error_occurred'));
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const handleDeleteReward = async (id) => {
    if (mutationRef.current || !confirm('Remover recompensa da loja? Os pedidos e o histórico serão preservados.')) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await api.delete(`/allowance/rewards/${id}`);
      toast.success('Recompensa removida da loja.');
      await fetchData();
    } catch (err) {
      toast.error(err.message || t('error_occurred'));
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const handleApproveRedemption = async (id, approved) => {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await api.put(`/allowance/redemptions/${id}/approve`, { approved });
      toast.success(approved ? 'Resgate aprovado e pontos descontados.' : 'Pedido recusado e pontos reservados liberados.');
      await fetchData();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || t('error_occurred'));
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const icons = ['🎁', '🎬', '🍰', '🎮', '🎢', '🍕', '💰', '📚', '⚽', '🎨', '🎵', '🐶'];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <ModuleTitle className="page-title" icon="family_shop" nativeIcon="🛍️">{t('family_shop_management')}</ModuleTitle>
        <p className="page-subtitle">{t('family_shop_subtitle')}</p>
      </div>

      {loading && <p role="status">Carregando loja...</p>}
      {busy && <p role="status">Processando...</p>}
      {loadError && <div role="alert" className="card mb-16">{loadError} <button type="button" className="btn btn-ghost" onClick={fetchData}>Tentar novamente</button></div>}
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
            <button type="button" disabled={busy} className="btn btn-primary" onClick={() => { setRewardForm(initialRewardForm); setShowRewardModal(true); }}>
              + {t('add_reward')}
            </button>
          </div>
          <div className="grid grid-3">
            {rewards.map((r) => (
              <div key={r.id} className="card" style={{ textAlign: 'center', opacity: r.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                  <button type="button" disabled={busy} aria-label={`Editar ${r.name}`} className="btn-icon btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setRewardForm({ ...r, is_active: isRewardAvailable(r), type: ['financial','surprise'].includes(r.type) ? r.type : 'non_financial' }); setShowRewardModal(true); }}>✏️</button>
                  <button type="button" disabled={busy} aria-label={`Remover ${r.name}`} className="btn-icon btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => handleDeleteReward(r.id)}>🗑️</button>
                </div>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{r.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>{r.name}</h3>
                <div style={{ marginTop: 8 }}><span className="badge badge-primary">⭐ {r.point_cost} {t('points')}</span></div>
                <div style={{ marginTop: 4 }}><span className="badge badge-info">{t(r.type)}</span></div>
                {!isRewardAvailable(r) && <div style={{ marginTop: 8 }}><span className="badge badge-danger">Desativada</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="card">
          <h3 className="card-title mb-16">📋 Pedidos e histórico de resgates</h3>
          {!loading && redemptions.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><ModuleIcon icon="tasks" nativeIcon="✅" size={28}/></div><h3>{t('all_caught_up')}</h3></div>
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Pedido: {new Date(r.created_at).toLocaleString('pt-BR')}{r.reviewed_at ? ` · Resolvido: ${new Date(r.reviewed_at).toLocaleString('pt-BR')}` : ''}</div>
                  </div>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex gap-8">
                    <button type="button" disabled={busy} className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleApproveRedemption(r.id, false)}>Recusar</button>
                    <button type="button" disabled={busy} className="btn btn-primary" onClick={() => handleApproveRedemption(r.id, true)}>Aprovar</button>
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
        <div className="modal-overlay" onClick={() => { if (!busy) setShowRewardModal(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reward-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="reward-modal-title" className="modal-title">{rewardForm.id ? t('edit_reward') : t('add_reward')}</h2>
              <button type="button" disabled={busy} aria-label="Fechar" className="modal-close" onClick={() => setShowRewardModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveReward}>
              <div className="form-group"><label className="form-label">{t('reward_name')} *</label><input className="form-input" value={rewardForm.name} onChange={(e) => setRewardForm((p) => ({ ...p, name: e.target.value }))} required /></div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('cost_points')} *</label><input type="number" min="0" max="2147483647" step="1" className="form-input" value={rewardForm.point_cost} onChange={(e) => setRewardForm((p) => ({ ...p, point_cost: e.target.value }))} required /></div>
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
                  <input type="checkbox" checked={rewardForm.is_active} onChange={(e) => setRewardForm((p) => ({ ...p, is_active: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                  <span className="form-label" style={{ margin: 0 }}>Recompensa Ativa (visível na loja)</span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => setShowRewardModal(false)}>{t('cancel')}</button>
                <button type="submit" disabled={busy} className="btn btn-primary">{busy ? 'Salvando...' : t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
