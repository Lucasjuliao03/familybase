import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';

const DAYS = [
  { label: 'Dom', value: 0 }, { label: 'Seg', value: 1 }, { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 }, { label: 'Qui', value: 4 }, { label: 'Sex', value: 5 }, { label: 'Sáb', value: 6 }
];

const initialForm = {
  title: '', description: '', type: 'home', points: 10, coins: 0,
  frequency: 'once', priority: 'medium', child_id: '',
  is_recurring: false, recurrence_days: [], start_date: '', end_date: '', due_time: '',
  requires_approval: true, visible_on_calendar: false, generate_notification: true,
  allowance_rule: { affects_allowance: false, bonus_amount: 0, discount_amount: 0, apply_discount_if_late: false }
};

export default function TaskManager() {
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [children, setChildren] = useState([]);
  const [filter, setFilter] = useState({ child_id: '', type: '' });
  const [viewMode, setViewMode] = useState('occurrences'); // 'occurrences' | 'templates'
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [form, setForm] = useState(initialForm);

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (filter.child_id) params.child_id = filter.child_id;
      if (filter.type) params.type = filter.type;
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const [rTasks, rOcc] = await Promise.all([
        api.get('/tasks', { params }),
        api.get('/tasks/occurrences', { params: { ...params, date: todayStr } }),
      ]);
      setTasks(rTasks.data);
      setOccurrences(rOcc.data);
    } catch (e) { console.error(e); }
  }, [filter]);

  useEffect(() => {
    fetchData();
    api.get('/families/children').then(r => setChildren(r.data)).catch(() => {});
  }, [fetchData, location.pathname]);

  useAutoRefresh(fetchData, 2600, { includeRouteChanges: false });

  useDailyCalendarRefresh(fetchData);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        is_recurring: form.frequency !== 'once',
        recurrence_days: form.recurrence_days.join(','),
        start_date: form.start_date || new Date().toISOString().split('T')[0],
      };
      if (editTask) {
        await api.put(`/tasks/${editTask.id}`, payload);
        toast.success('Tarefa atualizada!');
      } else {
        await api.post('/tasks', payload);
        toast.success(t('task_created'));
      }
      setShowModal(false);
      setEditTask(null);
      setForm(initialForm);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.error || t('error_occurred')); }
  };

  const handleApproveOcc = async (id, approved) => {
    try {
      await api.put(`/tasks/occurrences/${id}/approve`, { approved });
      toast.success(approved ? t('task_approved_msg') : t('task_rejected_msg'));
      fetchData();
    } catch { toast.error(t('error_occurred')); }
  };

  const handleHealthOcc = async (id, intake) => {
    try {
      await api.put(`/tasks/occurrences/${id}/complete`, { health_intake: intake });
      toast.success(intake === 'taken' ? 'Medicamento registado como tomado.' : 'Medicamento registado como não tomado.');
      fetchData();
    } catch { toast.error(t('error_occurred')); }
  };

  const handleApproveTask = async (id, approved) => {
    try {
      await api.put(`/tasks/${id}/approve`, { approved });
      toast.success(approved ? t('task_approved_msg') : t('task_rejected_msg'));
      fetchData();
    } catch { toast.error(t('error_occurred')); }
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/tasks/${id}`); fetchData(); } catch {}
  };

  const openEdit = (task) => {
    const days = task.recurrence_days ? task.recurrence_days.split(',').map(Number) : [];
    setForm({
      title: task.title, description: task.description || '', type: task.type, points: task.points,
      coins: task.coins || 0, frequency: task.frequency, priority: task.priority, child_id: task.child_id,
      is_recurring: !!task.is_recurring, recurrence_days: days,
      start_date: task.start_date || '', end_date: task.end_date || '', due_time: task.due_time || '',
      requires_approval: !!task.requires_approval, visible_on_calendar: !!task.visible_on_calendar,
      generate_notification: task.generate_notification !== 0,
      allowance_rule: { affects_allowance: !!task.affects_allowance, bonus_amount: task.bonus_amount || 0, discount_amount: task.discount_amount || 0, apply_discount_if_late: !!task.apply_discount_if_late }
    });
    setEditTask(task);
    setShowModal(true);
  };

  const toggleDay = (day) => {
    setForm(p => ({
      ...p,
      recurrence_days: p.recurrence_days.includes(day) ? p.recurrence_days.filter(d => d !== day) : [...p.recurrence_days, day]
    }));
  };

  const statusColor = { pending: 'warning', in_progress: 'info', waiting_approval: 'warning', completed: 'success', approved: 'success', rejected: 'danger', delayed: 'danger', expired: 'danger', cancelled: 'danger' };
  const statusLabel = { pending: 'Pendente', in_progress: 'Em andamento', waiting_approval: '⏳ Aguardando', completed: 'Concluída', approved: '✅ Aprovada', rejected: '❌ Reprovada', delayed: '⚠️ Atrasada', expired: 'Expirada', cancelled: 'Cancelada' };

  const isRecurring = form.frequency !== 'once';

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">✅ {t('task_management')}</h1>
          <p className="page-subtitle">Gerencie tarefas únicas e recorrentes</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(initialForm); setEditTask(null); setShowModal(true); }}>+ {t('add_task')}</button>
      </div>

      {/* FILTERS */}
      <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs tabs-scroll" style={{ margin: 0 }}>
          <button type="button" className={`tab ${viewMode === 'occurrences' ? 'active' : ''}`} onClick={() => setViewMode('occurrences')}>📅 Hoje</button>
          <button type="button" className={`tab ${viewMode === 'templates' ? 'active' : ''}`} onClick={() => setViewMode('templates')}>🗂️ Modelos</button>
        </div>
        <select className="form-select" style={{ width: 'auto', maxWidth: '100%', minWidth: 0 }} value={filter.child_id} onChange={e => setFilter(p => ({ ...p, child_id: e.target.value }))}>
          <option value="">{t('all')} {t('children')}</option>
          {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filter.type} onChange={e => setFilter(p => ({ ...p, type: e.target.value }))}>
          <option value="">{t('all')} Tipos</option>
          <option value="home">{t('home')}</option>
          <option value="school">{t('school')}</option>
          <option value="routine">Rotina</option>
          <option value="challenge">Desafio</option>
        </select>
      </div>

      {/* OCCURRENCES VIEW (TODAY) */}
      {viewMode === 'occurrences' && (
        <div className="table-container">
          <table className="table-stack-md">
            <thead><tr><th>Tarefa</th><th>Filho</th><th>Horário</th><th>Tipo</th><th>Pontos</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {occurrences.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
                  Nenhuma tarefa para hoje. Crie tarefas recorrentes para vê-las aqui automaticamente.
                </td></tr>
              ) : occurrences.map(occ => (
                <tr key={occ.id}>
                  <td data-label="Tarefa">
                    <strong>{occ.title}</strong>
                    {occ.is_recurring && <span className="badge badge-info ml-8" style={{ marginLeft: 6, fontSize: '0.7rem' }}>🔄 {occ.frequency}</span>}
                    {occ.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{occ.description}</div>}
                  </td>
                  <td data-label="Filho"><div className="flex gap-8" style={{ alignItems: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: occ.child_color || 'var(--border)' }}></div>{occ.assignee_name || occ.child_name}</div></td>
                  <td data-label="Horário">{occ.due_time || '—'}</td>
                  <td data-label="Tipo"><span className="badge badge-info">{t(occ.type)}</span></td>
                  <td data-label="Pontos">{Number(occ.is_health_reminder) === 1 ? '—' : <span className="badge badge-primary">⭐{occ.points}</span>}</td>
                  <td data-label="Status"><span className={`badge badge-${statusColor[occ.status] || 'info'}`}>{statusLabel[occ.status] || occ.status}</span></td>
                  <td data-label="Ações">
                    {Number(occ.is_health_reminder) === 1 && ['pending', 'in_progress', 'delayed'].includes(occ.status) ? (
                      <div className="flex gap-8 flex-wrap">
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => handleHealthOcc(occ.id, 'taken')}>Tomado</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleHealthOcc(occ.id, 'skipped')}>Não tomado</button>
                      </div>
                    ) : occ.status === 'waiting_approval' ? (
                      <div className="flex gap-8">
                        <button className="btn btn-sm btn-primary" onClick={() => handleApproveOcc(occ.id, true)}>✅</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleApproveOcc(occ.id, false)}>❌</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TEMPLATES VIEW */}
      {viewMode === 'templates' && (
        <div className="table-container">
          <table className="table-stack-md">
            <thead><tr><th>{t('task_title')}</th><th>{t('select_child')}</th><th>Recorrência</th><th>Horário</th><th>{t('points')}</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>{t('no_tasks')}</td></tr>
              ) : tasks.map(task => (
                <tr key={task.id}>
                  <td data-label={t('task_title')}>
                    <strong>{task.title}</strong>
                    {task.is_recurring && <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.7rem' }}>🔄</span>}
                    {task.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{task.description}</div>}
                  </td>
                  <td data-label={t('select_child')}><div className="flex gap-8" style={{ alignItems: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: task.child_color }}></div>{task.child_name}</div></td>
                  <td data-label="Recorrência">{task.is_recurring ? <span className="badge badge-primary">{task.frequency}</span> : <span className="badge badge-ghost">única</span>}</td>
                  <td data-label="Horário">{task.due_time || '—'}</td>
                  <td data-label={t('points')}><span className="badge badge-primary">⭐{task.points}</span></td>
                  <td data-label="Status"><span className={`badge badge-${task.status === 'active' ? 'success' : task.status === 'completed' ? 'info' : task.status === 'approved' ? 'success' : 'danger'}`}>{task.status}</span></td>
                  <td data-label="Ações">
                    <div className="flex gap-8">
                      {task.status === 'completed' && <button className="btn btn-sm btn-primary" onClick={() => handleApproveTask(task.id, true)}>✅</button>}
                      {task.status === 'completed' && <button className="btn btn-sm btn-danger" onClick={() => handleApproveTask(task.id, false)}>❌</button>}
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(task)}>✏️</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(task.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: CREATE/EDIT TASK */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editTask ? '✏️ Editar Tarefa' : '➕ Nova Tarefa'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="grid grid-2">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Título *</label>
                  <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Descrição</label>
                  <textarea className="form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
                </div>
                <div className="form-group">
                  <label className="form-label">Filho *</label>
                  <select className="form-select" value={form.child_id} onChange={e => setForm(p => ({ ...p, child_id: e.target.value }))} required>
                    <option value="">Selecionar...</option>
                    {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="home">🏠 Casa</option>
                    <option value="school">📚 Escola</option>
                    <option value="routine">⏰ Rotina</option>
                    <option value="challenge">🏆 Desafio</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Recorrência</label>
                  <select className="form-select" value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value, is_recurring: e.target.value !== 'once' }))}>
                    <option value="once">🔹 Única</option>
                    <option value="daily">🔄 Diária</option>
                    <option value="weekly">📅 Semanal</option>
                    <option value="monthly">📆 Mensal</option>
                    <option value="custom">🎯 Dias específicos</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Horário Limite {isRecurring && '*'}</label>
                  <input type="time" className="form-input" value={form.due_time} onChange={e => setForm(p => ({ ...p, due_time: e.target.value }))} required={isRecurring} />
                </div>

                {(form.frequency === 'weekly' || form.frequency === 'custom') && (
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Dias da Semana</label>
                    <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                      {DAYS.map(d => (
                        <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                          className={`btn btn-sm ${form.recurrence_days.includes(d.value) ? 'btn-primary' : 'btn-ghost'}`}>{d.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {isRecurring && (
                  <div className="form-group"><label className="form-label">Data de Início *</label><input type="date" className="form-input" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} required /></div>
                )}
                {isRecurring && (
                  <div className="form-group"><label className="form-label">Data de Fim</label><input type="date" className="form-input" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} /></div>
                )}

                <div className="form-group"><label className="form-label">Pontos</label><input type="number" className="form-input" value={form.points} onChange={e => setForm(p => ({ ...p, points: +e.target.value }))} min={0} /></div>
                <div className="form-group">
                  <label className="form-label">Prioridade</label>
                  <select className="form-select" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="low">🔵 Baixa</option>
                    <option value="medium">🟡 Média</option>
                    <option value="high">🔴 Alta</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-16 mb-16" style={{ flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.requires_approval} onChange={e => setForm(p => ({ ...p, requires_approval: e.target.checked }))} />
                  <span>Exige aprovação dos pais</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.visible_on_calendar} onChange={e => setForm(p => ({ ...p, visible_on_calendar: e.target.checked }))} />
                  <span>Aparece no calendário</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.generate_notification} onChange={e => setForm(p => ({ ...p, generate_notification: e.target.checked }))} />
                  <span>Gera notificação</span>
                </label>
              </div>

              {/* ALLOWANCE RULE */}
              <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={form.allowance_rule.affects_allowance} onChange={e => setForm(p => ({ ...p, allowance_rule: { ...p.allowance_rule, affects_allowance: e.target.checked } }))} style={{ width: 18, height: 18 }} />
                  <span style={{ fontWeight: 600 }}>💰 Impacta Mesada</span>
                </label>
                {form.allowance_rule.affects_allowance && (
                  <div className="grid grid-2">
                    <div className="form-group"><label className="form-label">Bônus (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={form.allowance_rule.bonus_amount || ''} onChange={e => setForm(p => ({ ...p, allowance_rule: { ...p.allowance_rule, bonus_amount: parseFloat(e.target.value) || 0 } }))} /></div>
                    <div className="form-group"><label className="form-label">Desconto (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={form.allowance_rule.discount_amount || ''} onChange={e => setForm(p => ({ ...p, allowance_rule: { ...p.allowance_rule, discount_amount: parseFloat(e.target.value) || 0 } }))} /></div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{editTask ? t('save') : t('add_task')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
