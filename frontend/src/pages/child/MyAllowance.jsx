import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';

export default function MyAllowance() {
  const { childProfile } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();

  const [tab, setTab] = useState('allowance');

  const [piggyRequests, setPiggyRequests] = useState([]);
  const [piggyForm, setPiggyForm] = useState({ savings_goal_id: '', requested_amount: '', message: '' });

  const [settings, setSettings] = useState(null);
  const [cycle, setCycle] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', target_amount: '' });

  const fetchData = useCallback(async () => {
    try {
      const goalParams = childProfile?.id ? { params: { child_id: childProfile.id } } : {};
      const [rSet, rTrans, rGoals] = await Promise.all([
        api.get('/allowance/settings').catch(() => ({ data: [] })),
        api.get('/allowance/transactions').catch(() => ({ data: [] })),
        api.get('/allowance/goals', goalParams).catch(() => ({ data: [] })),
      ]);

      const mySetting =
        Array.isArray(rSet.data)
          ? rSet.data.find((s) => String(s?.child_id) === String(childProfile.id))
          : null;
      setSettings(mySetting);
      setTransactions(rTrans.data);
      setGoals(rGoals.data);

      if (childProfile?.id) {
        const rCyc = await api.post('/allowance/cycles/current', { child_id: childProfile.id }).catch(() => ({ data: null }));
        setCycle(rCyc.data);
        const rPig = await api.get('/allowance/piggy-requests').catch(() => ({ data: [] }));
        setPiggyRequests(rPig.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [childProfile?.id]);

  useEffect(() => { if (childProfile) fetchData(); }, [childProfile, fetchData]);
  /** Reforço ao regressar ao app (sem duplicar o mount/rota quando childProfile atualiza). */
  useAutoRefresh(fetchData, 2500, { includeRouteChanges: false });

  const handleSaveGoal = async (e) => {
    e.preventDefault();
    try {
      await api.post('/allowance/goals', { ...goalForm, child_id: childProfile?.id });
      toast.success('Meta de cofrinho criada!');
      setShowGoalModal(false);
      setGoalForm({ title: '', target_amount: '' });
      fetchData();
    } catch (err) {
      toast.error(t('error_occurred'));
    }
  };

  const currentBalance = cycle && settings
    ? (cycle.opening_balance + (settings.model_type !== 'accumulative' ? cycle.base_amount : 0) + cycle.total_bonus + cycle.manual_adjustments - cycle.total_discount)
    : 0;

  const submitPiggy = async (e) => {
    e.preventDefault();
    try {
      await api.post('/allowance/piggy-requests', {
        savings_goal_id: piggyForm.savings_goal_id,
        requested_amount: parseFloat(piggyForm.requested_amount),
        message: piggyForm.message || undefined,
      });
      toast.success(t('piggy_sent'));
      setPiggyForm({ savings_goal_id: '', requested_amount: '', message: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="page-title mb-8">💰 {t('my_allowance')}</h1>
      <p className="page-subtitle mb-24">{t('allowance_subtitle_child')}</p>

      <div className="tabs mb-24" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`tab ${tab === 'allowance' ? 'active' : ''}`} onClick={() => setTab('allowance')}>🐷 Minha Mesada</button>
        <button type="button" className={`tab ${tab === 'goals' ? 'active' : ''}`} onClick={() => setTab('goals')}>🎯 Meu Cofrinho</button>
        <button type="button" className={`tab ${tab === 'piggy' ? 'active' : ''}`} onClick={() => setTab('piggy')}>💾 {t('piggy_save_tab')}</button>
      </div>

      {tab === 'allowance' && (
        <div className="grid grid-2">
          <div className="card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, var(--primary-light), var(--primary))', color: '#fff' }}>
            <h3>Saldo Atual Previsível</h3>
            <div style={{ fontSize: '3rem', fontWeight: 800, margin: '16px 0' }}>
              {settings?.currency || 'R$'}
              {' '}
              {Math.max(currentBalance, 0).toFixed(2)}
            </div>
            <p style={{ opacity: 0.9 }}>Continue completando tarefas para aumentar esse valor!</p>
          </div>

          <div className="card">
            <h3 className="mb-16">Extrato Recente</h3>
            {transactions.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🧾</div><h3>Nenhuma movimentação</h3></div>
            ) : (
              transactions.slice(0, 6).map((tx) => (
                <div key={tx.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{tx.description}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{new Date(tx.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: tx.type === 'credit' ? 'var(--success)' : 'var(--danger)' }}>
                    {tx.type === 'credit' ? '+' : '-'}
                    {' '}
                    {settings?.currency || 'R$'}
                    {' '}
                    {tx.amount.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'goals' && (
        <div>
          <div className="flex-between mb-16">
            <h3>Metas do Cofrinho</h3>
            <button type="button" className="btn btn-primary" onClick={() => setShowGoalModal(true)}>+ Nova Meta</button>
          </div>

          <div className="grid grid-2">
            {goals.map((g) => {
              const perc = Math.min((g.current_amount / g.target_amount) * 100, 100);
              return (
                <div key={g.id} className="card">
                  <div className="flex-between mb-8">
                    <h3 style={{ fontWeight: 700 }}>{g.title}</h3>
                    <span className={`badge badge-${g.status === 'completed' ? 'success' : 'primary'}`}>{g.status === 'completed' ? 'Concluída' : 'Ativa'}</span>
                  </div>
                  <div className="flex-between mb-8" style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>
                    <span>{settings?.currency || 'R$'} {g.current_amount.toFixed(2)} guardados</span>
                    <span>
                      Meta:
                      {settings?.currency || 'R$'}
                      {' '}
                      {g.target_amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="xp-bar" style={{ height: 12 }}>
                    <div className="xp-fill" style={{ width: `${perc}%`, background: perc === 100 ? 'var(--success)' : 'var(--primary)' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: 4 }}>{perc.toFixed(0)}% concluído</div>
                </div>
              );
            })}
            {goals.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>Nenhuma meta no cofrinho. Crie uma para começar a economizar!</div>}
          </div>
        </div>
      )}

      {tab === 'piggy' && (
        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title mb-16">{t('piggy_available')}</h3>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{settings?.currency || 'R$'} {Math.max(currentBalance, 0).toFixed(2)}</div>
            <form className="mt-24" onSubmit={submitPiggy}>
              <div className="form-group">
                <label className="form-label">{t('piggy_goal')}</label>
                <select required className="form-select" value={piggyForm.savings_goal_id} onChange={(e) => setPiggyForm((p) => ({ ...p, savings_goal_id: e.target.value }))}>
                  <option value="">{t('piggy_select_goal')}</option>
                  {goals.filter((g) => g.status === 'active').map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('piggy_amount')}</label>
                <input required type="number" step="0.01" min="0.01" className="form-input" value={piggyForm.requested_amount} onChange={(e) => setPiggyForm((p) => ({ ...p, requested_amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('piggy_message_optional')}</label>
                <textarea className="form-textarea" value={piggyForm.message} onChange={(e) => setPiggyForm((p) => ({ ...p, message: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary">{t('piggy_submit_request')}</button>
            </form>
          </div>
          <div className="card">
            <h3 className="card-title mb-16">{t('piggy_my_requests')}</h3>
            {piggyRequests.length === 0 ? <p style={{ color: 'var(--text-light)' }}>{t('piggy_no_requests')}</p> : piggyRequests.map((r) => (
              <div key={r.id} className="mb-16 pb-16" style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600 }}>{r.goal_title}</div>
                <div>R$ {Number(r.requested_amount).toFixed(2)}</div>
                <span className="badge badge-primary mt-8">{t(`piggy_status_${r.status}`)}</span>
                {r.review_note && <p style={{ fontSize: '0.85rem', marginTop: 8 }}>{r.review_note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showGoalModal && (
        <div className="modal-overlay" onClick={() => setShowGoalModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">🎯 Nova Meta</h2><button type="button" className="modal-close" onClick={() => setShowGoalModal(false)}>✕</button></div>
            <form onSubmit={handleSaveGoal}>
              <div className="form-group">
                <label className="form-label">O que você quer comprar? *</label>
                <input className="form-input" value={goalForm.title} onChange={(e) => setGoalForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ex: Videogame novo" required />
              </div>
              <div className="form-group">
                <label className="form-label">Qual o valor total? (R$) *</label>
                <input type="number" step="0.01" min="1" className="form-input" value={goalForm.target_amount} onChange={(e) => setGoalForm((p) => ({ ...p, target_amount: parseFloat(e.target.value) }))} required />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowGoalModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Criar Meta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
