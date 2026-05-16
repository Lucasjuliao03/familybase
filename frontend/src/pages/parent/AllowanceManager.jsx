import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';

export default function AllowanceManager() {
  const { t } = useLanguage();
  const toast = useToast();

  const [tab, setTab] = useState('allowance');

  const [piggyRequests, setPiggyRequests] = useState([]);
  const [settings, setSettings] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [children, setChildren] = useState([]);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ child_id: '', cycle_id: '', type: 'credit', amount: '', description: '' });

  const fetchData = useCallback(async () => {
    try {
      const [rSets, rCycles, rCh] = await Promise.all([
        api.get('/allowance/settings').catch(() => ({ data: [] })),
        api.get('/allowance/cycles').catch(() => ({ data: [] })),
        api.get('/families/children').catch(() => ({ data: [] })),
      ]);
      setSettings(rSets.data);
      setCycles(rCycles.data);
      setChildren(rCh.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchPiggy = useCallback(async () => {
    try {
      const { data } = await api.get('/allowance/piggy-requests');
      setPiggyRequests(data || []);
    } catch {
      setPiggyRequests([]);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === 'piggy') fetchPiggy(); }, [tab, fetchPiggy]);

  // Auto-refresh: ao regressar ao foco / rede e ao navegar dentro da SPA.
  useAutoRefresh(
    useCallback(() => {
      fetchData();
      if (tab === 'piggy') fetchPiggy();
    }, [fetchData, fetchPiggy, tab]),
    2500,
  );

  const reviewPiggy = async (id, approved, note) => {
    try {
      await api.put(`/allowance/piggy-requests/${id}/review`, { approved, review_note: note || '' });
      toast.success(t('fam_admin_saved'));
      fetchPiggy();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/allowance/settings/${settingsForm.child_id}`, settingsForm);
      toast.success('Configurações salvas!');
      setShowSettingsModal(false);
      fetchData();
      await api.post('/allowance/cycles/current', { child_id: settingsForm.child_id });
      fetchData();
    } catch (err) {
      toast.error(t('error_occurred'));
    }
  };

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/allowance/transactions/manual', adjustForm);
      toast.success('Ajuste lançado com sucesso!');
      setShowAdjustModal(false);
      fetchData();
    } catch (err) {
      toast.error(t('error_occurred'));
    }
  };

  const handleCloseCycle = async (id) => {
    if (!confirm('Deseja fechar este ciclo? O saldo final será calculado.')) return;
    try {
      await api.post(`/allowance/cycles/${id}/close`);
      toast.success('Ciclo fechado com sucesso!');
      fetchData();
    } catch (err) {
      toast.error(t('error_occurred'));
    }
  };

  const handlePayCycle = async (id) => {
    if (!confirm('Confirmar pagamento? O saldo será descontado.')) return;
    try {
      await api.post(`/allowance/cycles/${id}/pay`);
      toast.success('Ciclo pago com sucesso!');
      fetchData();
    } catch (err) {
      toast.error(t('error_occurred'));
    }
  };

  const getOpenCycle = (childId) => cycles.find((c) => c.child_id === childId && c.status === 'open');

  return (
    <div className="animate-fade-in">
      <div className="page-header"><h1 className="page-title">💰 {t('allowance_management')}</h1></div>

      <div className="tabs tabs-scroll mb-24" style={{ flexWrap: 'nowrap', gap: 8 }}>
        <button type="button" className={`tab ${tab === 'allowance' ? 'active' : ''}`} onClick={() => setTab('allowance')}>💰 Mesadas</button>
        <button type="button" className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>⚙️ Configurações</button>
        <button type="button" className={`tab ${tab === 'piggy' ? 'active' : ''}`} onClick={() => setTab('piggy')}>🐷 {t('piggy_requests_tab')}</button>
      </div>

      {tab === 'allowance' && (
        <div>
          <div className="flex-between mb-16">
            <h3>Visão Geral de Mesadas</h3>
            <button type="button" className="btn btn-primary" onClick={() => { setAdjustForm({ child_id: children[0]?.id || '', cycle_id: '', type: 'credit', amount: '', description: '' }); setShowAdjustModal(true); }}>+ Ajuste Manual</button>
          </div>

          <div className="grid grid-2">
            {children.map((child) => {
              const set = settings.find((s) => s.child_id === child.id);
              const cycle = getOpenCycle(child.id);

              if (!set || !cycle) {
                return (
                  <div key={child.id} className="card">
                    <h3 className="mb-8">{child.name}</h3>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Mesada não configurada ou sem ciclo aberto.</p>
                    <button type="button" className="btn btn-sm btn-ghost mt-8" onClick={() => { setTab('settings'); setSettingsForm({ child_id: child.id, model_type: 'hybrid', base_amount: 0, currency: 'BRL', cycle_closing_day: 30, payment_day: 5, allow_accumulation: 1, allow_negative_balance: 0, max_bonus: 50, max_discount: 50, require_parent_approval: 1, is_active: 1 }); setShowSettingsModal(true); }}>Configurar Agora</button>
                  </div>
                );
              }

              const prevFinal = cycle.opening_balance;
              const expectedBase = set.model_type !== 'accumulative' ? cycle.base_amount : 0;
              const currentBalance = prevFinal + expectedBase + cycle.total_bonus + cycle.manual_adjustments - cycle.total_discount;

              return (
                <div key={child.id} className="card" style={{ borderLeft: `4px solid ${child.color}` }}>
                  <div className="flex-between mb-16">
                    <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{child.name}</div>
                    <span className="badge badge-info">{set.model_type === 'fixed' ? 'Fixa' : set.model_type === 'accumulative' ? 'Acumulativa' : 'Híbrida'}</span>
                  </div>

                  <div className="grid grid-2 mb-16">
                    <div style={{ background: 'var(--bg-app)', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Saldo Anterior</div>
                      <div style={{ fontWeight: 700 }}>{set.currency} {prevFinal.toFixed(2)}</div>
                    </div>
                    <div style={{ background: 'var(--bg-app)', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Previsão do Mês</div>
                      <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem' }}>{set.currency} {Math.max(currentBalance, 0).toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--success)' }}>+ {set.currency} {(cycle.total_bonus + (cycle.manual_adjustments > 0 ? cycle.manual_adjustments : 0)).toFixed(2)} bônus</span>
                    <span style={{ color: 'var(--danger)' }}>- {set.currency} {(cycle.total_discount + (cycle.manual_adjustments < 0 ? Math.abs(cycle.manual_adjustments) : 0)).toFixed(2)} descontos</span>
                  </div>

                  <div className="flex gap-8 mt-16">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleCloseCycle(cycle.id)}>🔒 Fechar Ciclo</button>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="mt-32 mb-16">Histórico de Ciclos</h3>
          <div className="table-container">
            <table className="table-stack-md">
              <thead><tr><th>Filho</th><th>Mês/Ano</th><th>Status</th><th>Saldo Final</th><th>Ações</th></tr></thead>
              <tbody>
                {cycles.filter((c) => c.status !== 'open').slice(0, 10).map((c) => (
                  <tr key={c.id}>
                    <td data-label="Filho">{c.child_name}</td>
                    <td data-label="Mês/Ano">{c.month}/{c.year}</td>
                    <td data-label="Status"><span className={`badge badge-${c.status === 'closed' ? 'warning' : 'success'}`}>{c.status === 'closed' ? 'Fechado' : 'Pago'}</span></td>
                    <td data-label="Saldo final" style={{ fontWeight: 700 }}>R$ {c.final_amount.toFixed(2)}</td>
                    <td data-label="Ações">
                      {c.status === 'closed' && <button type="button" className="btn-icon btn-ghost" onClick={() => handlePayCycle(c.id)}>💸 Pagar</button>}
                    </td>
                  </tr>
                ))}
                {cycles.filter((c) => c.status !== 'open').length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 16 }}>Nenhum ciclo histórico encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div>
          <h3 className="mb-16">Configurações de Mesada por Filho</h3>
          <div className="grid grid-3">
            {children.map((child) => {
              const set = settings.find((s) => s.child_id === child.id);
              return (
                <div key={child.id} className="card">
                  <h3 className="mb-8">{child.name}</h3>
                  {set ? (
                    <div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: 12 }}>
                        <p>
                          Modelo:
                          {' '}
                          <strong>{set.model_type}</strong>
                        </p>
                        <p>
                          Valor Base:
                          {' '}
                          <strong>{set.currency} {set.base_amount.toFixed(2)}</strong>
                        </p>
                        <p>{set.is_active ? 'Ativo ✅' : 'Inativo ❌'}</p>
                      </div>
                      <button type="button" className="btn btn-sm btn-ghost w-full" onClick={() => { setSettingsForm(set); setShowSettingsModal(true); }}>✏️ Editar</button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: 12 }}>Não configurado.</p>
                      <button type="button" className="btn btn-sm btn-primary w-full" onClick={() => { setSettingsForm({ child_id: child.id, model_type: 'hybrid', base_amount: 0, currency: 'BRL', cycle_closing_day: 30, payment_day: 5, allow_accumulation: 1, allow_negative_balance: 0, max_bonus: 50, max_discount: 50, require_parent_approval: 1, is_active: 1 }); setShowSettingsModal(true); }}>Configurar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'piggy' && (
        <div className="card">
          <h3 className="card-title mb-16">{t('piggy_requests_heading')}</h3>
          {piggyRequests.filter((r) => r.status === 'pending').length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>{t('piggy_no_pending')}</p>
          ) : (
            piggyRequests.filter((r) => r.status === 'pending').map((r) => (
              <div key={r.id} className="card mb-16" style={{ border: '1px solid var(--border)' }}>
                <div className="flex-between flex-wrap gap-12 mb-12">
                  <div>
                    <strong>{r.child_name}</strong>
                    <div>{t('piggy_goal')}: {r.goal_title}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: 8 }}>
                      {t('piggy_amount')}: R$ {Number(r.requested_amount).toFixed(2)}
                    </div>
                    {r.message && <p style={{ marginTop: 8 }}>{r.message}</p>}
                  </div>
                  <div className="flex gap-8 flex-wrap">
                    <button type="button" className="btn btn-primary" onClick={() => {
                      const note = window.prompt(t('piggy_review_note')) || '';
                      reviewPiggy(r.id, true, note);
                    }}
                    >
                      {t('piggy_approve')}
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => {
                      const note = window.prompt(t('piggy_review_note')) || '';
                      reviewPiggy(r.id, false, note);
                    }}
                    >
                      {t('piggy_reject')}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
          <h4 className="mt-24 mb-12">{t('piggy_history')}</h4>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>
            {piggyRequests.filter((r) => r.status !== 'pending').map((r) => (
              <div key={r.id} className="mb-8">
                {r.child_name} — R$ {Number(r.requested_amount).toFixed(2)} — {r.goal_title} — {t(`piggy_status_${r.status}`)}
              </div>
            ))}
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header"><h2 className="modal-title">⚙️ Configurar Mesada</h2><button type="button" className="modal-close" onClick={() => setShowSettingsModal(false)}>✕</button></div>
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label">Modelo de Mesada *</label>
                <select className="form-select" value={settingsForm.model_type} onChange={(e) => setSettingsForm((p) => ({ ...p, model_type: e.target.value }))}>
                  <option value="fixed">Fixa (Valor estático + bônus/descontos opcionais)</option>
                  <option value="accumulative">Acumulativa (Rende apenas através de tarefas)</option>
                  <option value="hybrid">Híbrida (Recomendado: Valor base + tarefas influenciam)</option>
                </select>
              </div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">Valor Base (R$) *</label><input type="number" step="0.01" min="0" className="form-input" value={settingsForm.base_amount || ''} onChange={(e) => setSettingsForm((p) => ({ ...p, base_amount: parseFloat(e.target.value) || 0 }))} required disabled={settingsForm.model_type === 'accumulative'} /></div>
                <div className="form-group"><label className="form-label">Moeda</label><select className="form-select" value={settingsForm.currency} onChange={(e) => setSettingsForm((p) => ({ ...p, currency: e.target.value }))}><option value="BRL">R$ (Real)</option><option value="USD">$ (Dólar)</option></select></div>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={settingsForm.allow_accumulation === 1} onChange={(e) => setSettingsForm((p) => ({ ...p, allow_accumulation: e.target.checked ? 1 : 0 }))} style={{ width: 18, height: 18 }} />
                    <span>Acumular saldo pro mês seguinte?</span>
                  </label>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={settingsForm.allow_negative_balance === 1} onChange={(e) => setSettingsForm((p) => ({ ...p, allow_negative_balance: e.target.checked ? 1 : 0 }))} style={{ width: 18, height: 18 }} />
                    <span>Permitir saldo negativo?</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-2 mt-16">
                <div className="form-group"><label className="form-label">Limite Mensal de Bônus (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={settingsForm.max_bonus || ''} onChange={(e) => setSettingsForm((p) => ({ ...p, max_bonus: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="form-group"><label className="form-label">Limite Mensal de Descontos (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={settingsForm.max_discount || ''} onChange={(e) => setSettingsForm((p) => ({ ...p, max_discount: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div className="modal-footer mt-24">
                <button type="button" className="btn btn-ghost" onClick={() => setShowSettingsModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdjustModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">➕ Ajuste Manual</h2><button type="button" className="modal-close" onClick={() => setShowAdjustModal(false)}>✕</button></div>
            <form onSubmit={handleSaveAdjustment}>
              <div className="form-group">
                <label className="form-label">Filho *</label>
                <select className="form-select" value={adjustForm.child_id} onChange={(e) => setAdjustForm((p) => ({ ...p, child_id: e.target.value, cycle_id: getOpenCycle(e.target.value)?.id || '' }))} required>
                  <option value="">Selecione...</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">Tipo *</label><select className="form-select" value={adjustForm.type} onChange={(e) => setAdjustForm((p) => ({ ...p, type: e.target.value }))}><option value="credit">Crédito (+)</option><option value="debit">Débito (-)</option></select></div>
                <div className="form-group"><label className="form-label">Valor (R$) *</label><input type="number" step="0.01" min="0.01" className="form-input" value={adjustForm.amount} onChange={(e) => setAdjustForm((p) => ({ ...p, amount: parseFloat(e.target.value) }))} required /></div>
              </div>
              <div className="form-group"><label className="form-label">Motivo</label><input className="form-input" value={adjustForm.description} onChange={(e) => setAdjustForm((p) => ({ ...p, description: e.target.value }))} placeholder="Ex: Bônus por bom comportamento" required /></div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAdjustModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
