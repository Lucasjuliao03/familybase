import ModuleTitle, { ModuleIcon } from '../../components/web/ModuleTitle';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { isRewardAvailable } from '../../lib/rewardStore';

export default function MyFamilyShop({ titleKey = 'my_family_shop' }) {
  const { childProfile } = useAuth();
  const childId = childProfile?.id;
  const { t } = useLanguage();
  const toast = useToast();

  const [tab, setTab] = useState('shop');
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [points, setPoints] = useState({ total: 0, reserved: 0, available: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutationRef = useRef(false);
  const loadVersion = useRef(0);

  const fetchData = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!childId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [rRew, rRed, balance] = await Promise.all([
        api.get('/allowance/rewards/list'),
        api.get('/allowance/redemptions/list'),
        api.get('/allowance/store-balance', { params: { child_id: childId } }),
      ]);
      if (version !== loadVersion.current) return;
      setRewards((rRew.data || []).filter(isRewardAvailable));
      setRedemptions((rRed.data || []).filter((row) => row.child_id === childId));
      setPoints(balance.data);
      setLoadError('');
    } catch (e) {
      if (version === loadVersion.current) setLoadError(e.message || 'Não foi possível atualizar a loja.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void fetchData(); });
    return () => { active = false; };
  }, [fetchData]);
  useAutoRefresh(fetchData, 2500, { includeRouteChanges: false });

  const handleRedeem = async (rewardId) => {
    if (mutationRef.current || loading || loadError) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await api.post(`/allowance/rewards/${rewardId}/redeem`, { child_id: childId });
      toast.success('Resgate solicitado! 🎉');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <ModuleTitle className="page-title mb-8" icon="family_shop" nativeIcon="🛍️">{t(titleKey)}</ModuleTitle>
      <p className="page-subtitle mb-24">
        Pontos disponíveis:{' '}
        <strong style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>⭐ {points.available}</strong>
          <span style={{ display: 'block', marginTop: 8, fontSize: '0.92rem', color: 'var(--text-light)', maxWidth: 520 }}>
            Total: {points.total} · Reservados em pedidos pendentes: {points.reserved}
          </span>
      </p>
      {loading && <p role="status">Carregando loja...</p>}
      {busy && <p role="status">Enviando pedido...</p>}
      {loadError && <div role="alert" className="card mb-16">{loadError} <button type="button" className="btn btn-ghost" onClick={fetchData}>Tentar novamente</button></div>}

      <div className="tabs mb-24" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => setTab('shop')}>🛒 {t('reward_shop')}</button>
        <button type="button" className={`tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>📋 {t('my_redemptions')}</button>
      </div>

      {tab === 'shop' && (
        <div className="grid grid-3">
          {rewards.map((r) => {
            const canAfford = points.available >= Number(r.point_cost ?? 0);
            return (
              <div key={r.id} className="card" style={{ textAlign: 'center', opacity: canAfford ? 1 : 0.6 }}>
                <div style={{ fontSize: '3rem', marginBottom: 8 }}>{r.icon}</div>
                <h3 style={{ fontWeight: 700 }}>{r.name}</h3>
                <div className="mt-8"><span className="badge badge-primary" style={{ fontSize: '0.9rem' }}>⭐ {r.point_cost} {t('points')}</span></div>
                <button type="button" className="btn btn-sm btn-secondary mt-16" disabled={!canAfford || busy || loading || !!loadError} onClick={() => handleRedeem(r.id)}>
                  {busy ? 'Aguarde...' : canAfford ? `🎁 ${t('redeem')}` : `🔒 ${t('insufficient_points')}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'my' && (
        <div>
          {!loading && redemptions.length === 0 ? (
            <div className="card empty-state"><div className="empty-icon"><ModuleIcon icon="clipboard" nativeIcon="📋" size={28}/></div><h3>Nenhum resgate ainda</h3></div>
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
                          : ' · reserva liberada'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Pedido: {new Date(r.created_at).toLocaleString('pt-BR')}{r.reviewed_at ? ` · Resolvido: ${new Date(r.reviewed_at).toLocaleString('pt-BR')}` : ''}</div>
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
