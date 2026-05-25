import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';
import { enrichOccurrencesStatus, minutesToDeadline } from '../../lib/taskStatus';
import {
  TASK_FILTER_TABS,
  canCompleteTask,
  countDelayed,
  filterOccurrences,
  frequencyLabel,
  sortTasksForDisplay,
  taskIcon,
  taskStatusBadge,
  taskStatusLabel,
  taskStatusTheme,
  taskTypeLabel,
} from '../../lib/tasksHelpers';
import './myTasks.css';

export default function MyTasks() {
  const { childProfile, ensureChildProfile } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const toast = useToast();
  const [rawOccurrences, setRawOccurrences] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'routine', due_time: '' });

  useEffect(() => {
    const tid = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tid);
  }, []);

  const occurrences = enrichOccurrencesStatus(rawOccurrences, now);
  const delayedCount = countDelayed(occurrences);

  const filtered = useMemo(
    () => sortTasksForDisplay(filterOccurrences(occurrences, filter)),
    [occurrences, filter],
  );

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

  return (
    <div className="my-tasks-page animate-fade-in">
      <header className="my-tasks-head">
        <div className="my-tasks-head__text">
          <h1>✅ Minhas Tarefas</h1>
          {delayedCount > 0 && (
            <p className="my-tasks-alert" role="status">
              ⚠️ {delayedCount} tarefa{delayedCount !== 1 ? 's' : ''} atrasada{delayedCount !== 1 ? 's' : ''}!
            </p>
          )}
        </div>
        <button type="button" className="my-tasks-suggest-btn" onClick={() => setShowModal(true)}>
          <span aria-hidden>+</span> Sugerir Tarefa
        </button>
      </header>

      <div className="my-tasks-filters" role="tablist" aria-label="Filtrar tarefas">
        {TASK_FILTER_TABS.map(({ key, label, icon, countKey }) => {
          const isActive = filter === key;
          const isDelayedTab = key === 'delayed';
          const badgeCount = countKey === 'delayed' ? delayedCount : 0;
          return (
            <button
              key={key || 'all'}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`my-tasks-filter${isActive ? ' is-active' : ''}${isActive && isDelayedTab ? ' is-delayed' : ''}`}
              onClick={() => setFilter(key)}
            >
              <span className="my-tasks-filter__icon" aria-hidden>{icon}</span>
              {label}
              {isDelayedTab && badgeCount > 0 && (
                <span className="my-tasks-filter__badge" aria-label={`${badgeCount} atrasadas`}>
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="my-tasks-list">
        {filtered.length === 0 ? (
          <div className="my-tasks-empty">
            <div className="my-tasks-empty__icon" aria-hidden>🎉</div>
            <h3>Nenhuma tarefa encontrada</h3>
            <p>
              {filter === 'delayed'
                ? 'Nenhuma tarefa atrasada — bom trabalho!'
                : 'Tudo limpo por aqui!'}
            </p>
          </div>
        ) : filtered.map((occ) => {
          const isDelayed = occ.isDelayed || occ.status === 'delayed';
          const theme = taskStatusTheme(occ);
          const mins = minutesToDeadline(occ, now);
          const closeToDue = mins !== null && mins >= 0 && mins <= 30;
          const isHealth = Number(occ.is_health_reminder) === 1;
          const showComplete = canCompleteTask(occ, now);
          const icon = taskIcon(occ.title, occ.type);

          return (
            <article
              key={occ.id}
              className={`my-tasks-card${isDelayed ? ' is-delayed' : ''}`}
            >
              <span className="my-tasks-card__stripe" style={{ background: theme.stripe }} aria-hidden />
              <div className="my-tasks-card__body">
                <div className="my-tasks-card__top">
                  <div
                    className="my-tasks-card__icon"
                    style={{ background: theme.pastel, border: `1px solid ${theme.accent}33` }}
                    aria-hidden
                  >
                    {icon}
                  </div>
                  <div className="my-tasks-card__head">
                    <div className="my-tasks-card__title-row">
                      <h2 className="my-tasks-card__title">{occ.title}</h2>
                      <span className="my-tasks-card__badge" style={{ background: theme.badgeBg }}>
                        {taskStatusBadge(occ)}
                      </span>
                    </div>
                    {!isHealth && (
                      <div className="my-tasks-card__points">
                        <span aria-hidden>⭐</span> {occ.points || 0}
                        {occ.coins > 0 && (
                          <span className="my-tasks-card__coins">
                            <span aria-hidden>🪙</span> {occ.coins}
                          </span>
                        )}
                      </div>
                    )}
                    {isHealth && (
                      <span className="my-tasks-card__points" style={{ color: '#64748b', fontSize: '0.82rem' }}>
                        💊 Lembrete de saúde
                      </span>
                    )}
                  </div>
                </div>

                {occ.description && (
                  <p className="my-tasks-card__desc">{occ.description}</p>
                )}

                <div className="my-tasks-meta-grid">
                  {occ.due_time && (
                    <div className={`my-tasks-meta${isDelayed || closeToDue ? ' is-urgent' : ''}`}>
                      <span className="my-tasks-meta__icon" style={{ background: '#eef2ff' }} aria-hidden>⏰</span>
                      <span className="my-tasks-meta__text">
                        <span className="my-tasks-meta__label">Limite</span>
                        <span className="my-tasks-meta__value">
                          {occ.due_time}
                          {closeToDue && !isDelayed && ` (${mins} min)`}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="my-tasks-meta">
                    <span className="my-tasks-meta__icon" style={{ background: '#ecfdf5' }} aria-hidden>📅</span>
                    <span className="my-tasks-meta__text">
                      <span className="my-tasks-meta__label">Frequência</span>
                      <span className="my-tasks-meta__value">
                        {occ.is_recurring ? frequencyLabel(occ.frequency) : 'Única'}
                      </span>
                    </span>
                  </div>
                  <div className="my-tasks-meta">
                    <span className="my-tasks-meta__icon" style={{ background: '#fff7ed' }} aria-hidden>🏷️</span>
                    <span className="my-tasks-meta__text">
                      <span className="my-tasks-meta__label">Categoria</span>
                      <span className="my-tasks-meta__value">{taskTypeLabel(occ.type)}</span>
                    </span>
                  </div>
                  <div className="my-tasks-meta">
                    <span className="my-tasks-meta__icon" style={{ background: theme.pastel }} aria-hidden>
                      {isDelayed ? '⚠️' : 'ℹ️'}
                    </span>
                    <span className="my-tasks-meta__text">
                      <span className="my-tasks-meta__label">Status</span>
                      <span className="my-tasks-meta__value">{taskStatusLabel(occ)}</span>
                    </span>
                  </div>
                </div>

                {isHealth && showComplete && (
                  <div className="my-tasks-health-actions">
                    <button
                      type="button"
                      className="my-tasks-action my-tasks-action--primary my-tasks-action--health"
                      onClick={() => handleHealthReminder(occ.id, 'taken')}
                    >
                      ✓ Tomado
                    </button>
                    <button
                      type="button"
                      className="my-tasks-action my-tasks-action--secondary my-tasks-action--health"
                      onClick={() => handleHealthReminder(occ.id, 'skipped')}
                    >
                      Não tomado
                    </button>
                  </div>
                )}

                {!isHealth && showComplete && (
                  <button
                    type="button"
                    className={`my-tasks-action ${isDelayed ? 'my-tasks-action--danger' : 'my-tasks-action--primary'}`}
                    onClick={() => handleComplete(occ.id, isDelayed)}
                  >
                    ✓ Concluir tarefa
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📋 Sugerir Tarefa</h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">O que você vai fazer? *</label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: Lavar meu prato"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Detalhes (opcional)</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select
                    className="form-select"
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  >
                    <option value="school">📚 Escolar</option>
                    <option value="home">🏠 Doméstica</option>
                    <option value="routine">⏰ Rotina</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Horário limite (opcional)</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.due_time}
                    onChange={(e) => setForm((p) => ({ ...p, due_time: e.target.value }))}
                  />
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
