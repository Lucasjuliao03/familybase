import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';
import { enrichOccurrencesStatus, minutesToDeadline } from '../../lib/taskStatus';

export default function MyTasks() {
  const { childProfile, ensureChildProfile } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const toast = useToast();
  const [rawOccurrences, setRawOccurrences] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState('pending');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'routine', due_time: '' });

  // Tick a cada 60s para recalcular atraso sem re-fetch
  useEffect(() => {
    const tid = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tid);
  }, []);

  // Ocorrências com status real calculado no cliente
  const occurrences = enrichOccurrencesStatus(rawOccurrences, now);

  // Filtro aplicado após enriquecer
  const filtered = filter
    ? occurrences.filter((o) => {
        if (filter === 'delayed') return o.isDelayed || o.status === 'delayed';
        if (filter === 'pending') return ['pending', 'in_progress'].includes(o.status) && !o.isDelayed;
        return o.status === filter;
      })
    : occurrences;

  const fetchTasks = useCallback(async () => {
    try {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const params = { date: todayStr };
      if (childProfile?.id) params.child_id = childProfile.id;
      const { data } = await api.get('/tasks/occurrences', { params });
      setRawOccurrences(data || []);
    } catch (e) { console.error(e); }
  }, [childProfile?.id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks, location.pathname]);
  useAutoRefresh(fetchTasks, 2600);
  useDailyCalendarRefresh(fetchTasks);

  const handleComplete = async (id, isDelayed) => {
    try {
      const payload = isDelayed ? { completed_late: true } : {};
      const res = await api.put(`/tasks/occurrences/${id}/complete`, payload);
      toast.success(
        isDelayed
          ? '⚠️ Tarefa concluída com atraso! Os responsáveis serão notificados.'
          : res.data?.status === 'waiting_approval'
            ? 'Tarefa enviada para aprovação! 📤'
            : 'Tarefa concluída! ✅',
      );
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const handleHealthReminder = async (id, intake) => {
    try {
      await api.put(`/tasks/occurrences/${id}/complete`, { health_intake: intake });
      toast.success(intake === 'taken' ? 'Registado como tomado.' : 'Registado como não tomado.');
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    let row = childProfile;
    if (!row?.id) row = await ensureChildProfile();
    if (!row?.id) {
      toast.error('Ainda não conseguimos carregar o teu perfil de criança. Aguarda uns segundos e tenta de novo.');
      return;
    }
    try {
      await api.post('/tasks', {
        ...form,
        child_id: row.id,
        frequency: 'once',
        requires_approval: true,
        is_recurring: false,
      });
      toast.success('Sugestão de tarefa enviada! 📋');
      setShowModal(false);
      setForm({ title: '', description: '', type: 'routine', due_time: '' });
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  const statusEmoji = {
    pending: '⏳', in_progress: '🏃', waiting_approval: '📤',
    approved: '✅', rejected: '❌', delayed: '⚠️', expired: '👻',
    completed: '✅', completed_late: '⚠️',
  };
  const statusColor = {
    pending: 'warning', in_progress: 'info', waiting_approval: 'info',
    approved: 'success', rejected: 'danger', delayed: 'danger',
    expired: 'ghost', completed: 'success', completed_late: 'warning',
  };
  const statusLabel = {
    pending: 'Pendente', in_progress: 'Fazendo', waiting_approval: 'Aguardando Pais',
    approved: 'Aprovada', rejected: 'Reprovada', delayed: '⚠️ Atrasada',
    expired: 'Expirada', completed: 'Concluída', completed_late: '⚠️ Concluída com Atraso',
  };

  const FILTER_TABS = [
    { key: '', label: 'Todas' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'delayed', label: '⚠️ Atrasadas' },
    { key: 'waiting_approval', label: 'Aguardando' },
    { key: 'approved', label: 'Aprovadas' },
    { key: 'rejected', label: 'Reprovadas' },
  ];

  const delayedCount = occurrences.filter(o => o.isDelayed || o.status === 'delayed').length;

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ minWidth: 0, flex: '1 1 auto' }}>✅ {t('my_tasks')}</h1>
          {delayedCount > 0 && (
            <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>
              ⚠️ {delayedCount} tarefa{delayedCount !== 1 ? 's' : ''} atrasada{delayedCount !== 1 ? 's' : ''}!
            </p>
          )}
        </div>
        <button type="button" className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => setShowModal(true)}>
          + Sugerir Tarefa
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-8 mb-24" style={{ flexWrap: 'wrap' }}>
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`btn btn-sm ${filter === key ? 'btn-primary' : key === 'delayed' && delayedCount > 0 ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setFilter(key)}
            style={{ position: 'relative' }}
          >
            {label}
            {key === 'delayed' && delayedCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: 'var(--danger)', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800,
              }}>{delayedCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
        {filtered.length === 0 ? (
          <div className="card empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="empty-icon">🎉</div>
            <h3>{t('no_tasks')}</h3>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
              {filter === 'delayed' ? 'Nenhuma tarefa atrasada — bom trabalho!' : 'Tudo limpo por aqui!'}
            </p>
          </div>
        ) : filtered.map((occ) => {
          const isDelayed = occ.isDelayed;
          const mins = minutesToDeadline(occ, now);
          const closeToDue = mins !== null && mins >= 0 && mins <= 30;

          return (
            <div
              key={occ.id}
              className="card task-card"
              style={{
                borderLeft: `5px solid ${
                  isDelayed ? 'var(--danger)' :
                  occ.status === 'approved' || occ.status === 'completed' ? 'var(--success)' :
                  closeToDue ? '#F97316' :
                  occ.status === 'rejected' ? 'var(--danger)' :
                  'var(--primary)'
                }`,
                position: 'relative',
                minWidth: 0,
                maxWidth: '100%',
                // Animação sutil em tarefas atrasadas
                animation: isDelayed ? 'delayedPulse 3s ease-in-out infinite' : 'none',
                background: isDelayed ? 'rgba(239,68,68,0.04)' : undefined,
              }}
            >
              {/* Badge de atrasada no canto */}
              {isDelayed && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'var(--danger)', color: '#fff',
                  borderRadius: 12, padding: '2px 8px',
                  fontSize: '0.7rem', fontWeight: 800,
                }}>
                  ⚠️ ATRASADA
                </div>
              )}

              {occ.wasLate && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: '#F97316', color: '#fff',
                  borderRadius: 12, padding: '2px 8px',
                  fontSize: '0.7rem', fontWeight: 800,
                }}>
                  ⚠️ COM ATRASO
                </div>
              )}

              <div className="flex-between mb-8" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
                <h3 style={{
                  fontWeight: 700, fontSize: '1rem', minWidth: 0,
                  flex: '1 1 200px', wordBreak: 'break-word',
                  paddingRight: isDelayed || occ.wasLate ? 80 : 0,
                }}>
                  {statusEmoji[occ.status]} {occ.title}
                </h3>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {Number(occ.is_health_reminder) !== 1 && (
                    <>
                      <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem', display: 'block' }}>⭐ {occ.points}</span>
                      {occ.coins > 0 && <span style={{ fontWeight: 700, color: '#E67E22', fontSize: '0.9rem' }}>🪙 {occ.coins}</span>}
                    </>
                  )}
                  {Number(occ.is_health_reminder) === 1 && <span className="badge badge-ghost" style={{ fontSize: '0.75rem' }}>Saúde</span>}
                </div>
              </div>

              {occ.description && <p style={{ fontSize: '0.88rem', color: 'var(--text-light)', marginBottom: 10 }}>{occ.description}</p>}

              <div className="flex gap-12 mb-10" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {occ.due_time && (
                  <span style={{ color: isDelayed ? 'var(--danger)' : closeToDue ? '#F97316' : 'inherit', fontWeight: isDelayed || closeToDue ? 700 : 400 }}>
                    ⏰ Limite: <strong>{occ.due_time}</strong>
                    {closeToDue && !isDelayed && <span style={{ marginLeft: 4, color: '#F97316' }}> ({mins}min)</span>}
                  </span>
                )}
                {occ.is_recurring
                  ? <span className="badge badge-info">🔄 {occ.frequency}</span>
                  : <span className="badge badge-ghost">Única</span>
                }
              </div>

              <div className="flex-between mt-10" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div className="flex gap-8">
                  <span className="badge badge-primary">{t(occ.type)}</span>
                  <span className={`badge badge-${statusColor[occ.status] || 'info'}`}>{statusLabel[occ.status] || occ.status}</span>
                </div>

                {/* Ações */}
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  {['pending', 'in_progress', 'delayed'].includes(occ.status) && Number(occ.is_health_reminder) === 1 && (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => handleHealthReminder(occ.id, 'taken')}>Tomado</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleHealthReminder(occ.id, 'skipped')}>Não tomado</button>
                    </>
                  )}
                  {(occ.status === 'pending' || occ.status === 'in_progress' || isDelayed) && Number(occ.is_health_reminder) !== 1 && (
                    <button
                      className={`btn btn-sm ${isDelayed ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => handleComplete(occ.id, isDelayed)}
                      style={{ boxShadow: isDelayed ? '0 4px 12px rgba(239,68,68,0.3)' : undefined }}
                    >
                      {isDelayed ? '⚠️ Concluir (Atrasada)' : '✅ Concluir'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CSS da animação de pulso para tarefas atrasadas */}
      <style>{`
        @keyframes delayedPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0.12); }
        }
      `}</style>

      {/* Modal de sugestão de tarefa */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📋 Sugerir Tarefa</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">O que você vai fazer? *</label>
                <input className="form-input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ex: Lavar meu prato" required />
              </div>
              <div className="form-group">
                <label className="form-label">Detalhes (opcional)</label>
                <textarea className="form-textarea" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="school">📚 Escolar</option>
                    <option value="home">🏠 Doméstica</option>
                    <option value="routine">⏰ Rotina</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Horário (opcional)</label>
                  <input className="form-input" type="time" value={form.due_time} onChange={(e) => setForm((p) => ({ ...p, due_time: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Enviar Sugestão</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
