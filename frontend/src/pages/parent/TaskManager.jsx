import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';
import { enrichOccurrencesStatus } from '../../lib/taskStatus';
import {
  familyChildrenQueryKey,
  taskHistoryQueryKey,
  taskListQueryKey,
  taskOccurrencesQueryKey,
} from '../../lib/familiaQueryKeys';
import { deriveParentHistoryBucket, historyBucketLabel } from '../../lib/taskHistoryStatus';

const DAYS = [
  { label: 'Dom', value: 0 }, { label: 'Seg', value: 1 }, { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 }, { label: 'Qui', value: 4 }, { label: 'Sex', value: 5 }, { label: 'Sáb', value: 6 },
];

const initialForm = {
  title: '', description: '', type: 'home', points: 10, coins: 0,
  frequency: 'once', priority: 'medium', child_id: '',
  is_recurring: false, recurrence_days: [], start_date: '', end_date: '', due_time: '',
  requires_approval: true, visible_on_calendar: false, generate_notification: true,
  allowance_rule: { affects_allowance: false, bonus_amount: 0, discount_amount: 0, apply_discount_if_late: false },
};

function todayYmdLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymdLocalFromDate(dt) {
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initialHistoryFilter() {
  const t = new Date();
  const f = new Date(t);
  f.setDate(f.getDate() - 14);
  return {
    from: ymdLocalFromDate(f),
    to: ymdLocalFromDate(t),
    history_status: 'all',
    recurring_kind: 'all',
    task_id: '',
  };
}

function TaskTableSkeleton({ cols = 7, rows = 5 }) {
  return (
    <tbody aria-busy="true" aria-label="A carregar tarefas">
      {Array.from({ length: rows }, (_, ri) => (
        <tr key={ri} className="table-skel-row">
          <td><div className="fam-sk fam-sk-line fam-sk-line--med" /></td>
          {Array.from({ length: cols - 1 }, (_, ci) => (
            <td key={ci}><div className="fam-sk fam-sk-line" style={{ maxWidth: 120 }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export default function TaskManager() {
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();

  /** Atualizado em cada render para alinhar o dia civil com o servidor após pivot/poll. */
  const todayStr = todayYmdLocal();

  const [filter, setFilter] = useState({ child_id: '', type: '' });
  const [histFilter, setHistFilter] = useState(initialHistoryFilter);
  const [viewMode, setViewMode] = useState('occurrences');
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [form, setForm] = useState(initialForm);
  // Ticker para recalcular atraso sem re-fetch (a cada 60s)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tid = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tid);
  }, []);

  const tasksQueryOptions = {
    queryKey: taskListQueryKey(filter),
    queryFn: async () => {
      const params = {};
      if (filter.child_id) params.child_id = filter.child_id;
      if (filter.type) params.type = filter.type;
      const rTasks = await api.get('/tasks', { params });
      return rTasks.data;
    },
    staleTime: 45_000,
  };

  const occQueryOptions = {
    queryKey: taskOccurrencesQueryKey(filter, todayStr),
    queryFn: async () => {
      const params = { date: todayStr };
      if (filter.child_id) params.child_id = filter.child_id;
      if (filter.type) params.type = filter.type;
      const rOcc = await api.get('/tasks/occurrences', { params });
      return rOcc.data;
    },
    staleTime: 30_000,
    enabled: viewMode !== 'history',
  };

  const historyOccQueryOpts = {
    queryKey: taskHistoryQueryKey(histFilter, filter),
    queryFn: async () => {
      const params = { from: histFilter.from, to: histFilter.to };
      if (filter.child_id) params.child_id = filter.child_id;
      if (filter.type) params.type = filter.type;
      if (histFilter.task_id) params.task_id = histFilter.task_id;
      const r = await api.get('/tasks/occurrences', { params });
      return r.data;
    },
    staleTime: 30_000,
    enabled: viewMode === 'history',
  };

  const childrenQueryOptions = {
    queryKey: familyChildrenQueryKey(),
    queryFn: async () => (await api.get('/families/children')).data,
    staleTime: 120_000,
  };

  const tasksQ = useQuery(tasksQueryOptions);
  const occQ = useQuery(occQueryOptions);
  const historyQ = useQuery(historyOccQueryOpts);
  const childrenQ = useQuery(childrenQueryOptions);

  const tasks = tasksQ.data ?? [];
  const rawOccurrences = occQ.data ?? [];
  // Calcular status real (atraso) no cliente
  const occurrences = enrichOccurrencesStatus(rawOccurrences, now);
  const rawHistoryOcc = historyQ.data ?? [];
  const historyOccurrences = enrichOccurrencesStatus(rawHistoryOcc, now)
    .map((o) => ({ ...o, history_bucket: deriveParentHistoryBucket(o, now) }))
    .filter((o) => {
      const st = histFilter.history_status || 'all';
      if (st !== 'all') {
        const mapOk =
          st === 'completed'
            ? o.history_bucket === 'completed'
            : st === 'not_completed'
              ? o.history_bucket === 'not_completed'
              : st === 'rejected'
                ? o.history_bucket === 'rejected'
                : st === 'open'
                  ? o.history_bucket === 'pending_open'
                  : true;
        if (!mapOk) return false;
      }
      const rk = histFilter.recurring_kind || 'all';
      if (rk === 'recurring' && !o.is_recurring) return false;
      if (rk === 'once' && o.is_recurring) return false;
      return true;
    })
    .sort((a, b) => {
      const da = String(a.occurrence_date || '').slice(0, 10);
      const db = String(b.occurrence_date || '').slice(0, 10);
      const c = db.localeCompare(da);
      return c !== 0 ? c : String(a.title || '').localeCompare(String(b.title || ''));
    });
  const children = childrenQ.data ?? [];

  const occInitialSkeleton = occQ.isPending && occurrences.length === 0 && !occQ.error;
  const tplInitialSkeleton = tasksQ.isPending && tasks.length === 0 && !tasksQ.error;

  const histInitialSkeleton =
    historyQ.isPending && viewMode === 'history' && historyOccurrences.length === 0 && !historyQ.error;

  useDailyCalendarRefresh(() => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  });

  const restoreOccSnapshots = (previous) => {
    previous?.forEach(([qk, dat]) => queryClient.setQueryData(qk, dat));
  };

  /** Hoje (`tasks/occurrences/...`) + aba Histórico (`tasks/history/occurrences/...`). */
  const occurrenceCachesPredicate = {
    predicate: (q) => {
      const k = Array.isArray(q.queryKey) ? q.queryKey : [];
      return k[0] === 'tasks' && (k[1] === 'occurrences' || (k[1] === 'history' && k[2] === 'occurrences'));
    },
  };

  const restoreTasksSnapshots = (previous) => {
    previous?.forEach(([qk, dat]) => queryClient.setQueryData(qk, dat));
  };

  const approveOccMutation = useMutation({
    mutationFn: ({ id, approved }) => api.put(`/tasks/occurrences/${id}/approve`, { approved }),
    async onMutate({ id, approved }) {
      await queryClient.cancelQueries(occurrenceCachesPredicate);
      const previous = queryClient.getQueriesData(occurrenceCachesPredicate);
      const nextStatus = approved ? 'approved' : 'rejected';
      queryClient.setQueriesData(occurrenceCachesPredicate, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((o) => (o.id === id ? { ...o, status: nextStatus } : o));
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => restoreOccSnapshots(ctx?.previous),
    onSuccess: (_d, { approved }) => {
      toast.success(approved ? t('task_approved_msg') : t('task_rejected_msg'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const toggleTemplateMutation = useMutation({
    mutationFn: ({ id, active }) => api.put(`/tasks/${id}`, { status: active ? 'active' : 'inactive' }),
    onSuccess: (_d, { active }) => {
      toast.success(
        active
          ? 'Modelo ativado: volta a criar ocorrências nos dias certos.'
          : 'Modelo desativado: não cria novas ocorrências. O histórico mantém-se.',
      );
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || err.message || 'Não foi possível atualizar o modelo.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const healthOccMutation = useMutation({
    mutationFn: ({ id, intake }) => api.put(`/tasks/occurrences/${id}/complete`, { health_intake: intake }),
    async onMutate({ id }) {
      await queryClient.cancelQueries(occurrenceCachesPredicate);
      const previous = queryClient.getQueriesData(occurrenceCachesPredicate);
      queryClient.setQueriesData(occurrenceCachesPredicate, (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((o) => o.id !== id);
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => restoreOccSnapshots(ctx?.previous),
    onSuccess: (_d, { intake }) => {
      toast.success(
        intake === 'taken' ? 'Medicamento registado como tomado.' : 'Medicamento registado como não tomado.',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const approveTaskMutation = useMutation({
    mutationFn: ({ id, approved }) => api.put(`/tasks/${id}/approve`, { approved }),
    async onMutate({ id, approved }) {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'list'] });
      const previous = queryClient.getQueriesData({ queryKey: ['tasks', 'list'] });
      const nextStatus = approved ? 'approved' : 'rejected';
      queryClient.setQueriesData({ queryKey: ['tasks', 'list'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((o) => (o.id === id ? { ...o, status: nextStatus } : o));
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => restoreTasksSnapshots(ctx?.previous),
    onSuccess: (_d, { approved }) => {
      toast.success(approved ? t('task_approved_msg') : t('task_rejected_msg'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const saveTaskMutation = useMutation({
    mutationFn: async ({ taskId, payload }) => {
      if (taskId) {
        await api.put(`/tasks/${taskId}`, payload);
        return { mode: 'update' };
      }
      await api.post('/tasks', payload);
      return { mode: 'create' };
    },
    onSuccess: async (_d, { taskId }) => {
      if (taskId) toast.success('Tarefa atualizada!');
      else toast.success(t('task_created'));
      setShowModal(false);
      setEditTask(null);
      setForm(initialForm);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      is_recurring: form.frequency !== 'once',
      recurrence_days: form.recurrence_days.join(','),
      start_date: form.start_date || new Date().toISOString().split('T')[0],
    };
    saveTaskMutation.mutate({ taskId: editTask?.id, payload });
  };

  const handleApproveOcc = (id, approved) => approveOccMutation.mutate({ id, approved });
  const handleHealthOcc = (id, intake) => healthOccMutation.mutate({ id, intake });
  const handleApproveTask = (id, approved) => approveTaskMutation.mutate({ id, approved });

  const openEdit = (task) => {
    const days = task.recurrence_days ? task.recurrence_days.split(',').map(Number) : [];
    setForm({
      title: task.title, description: task.description || '', type: task.type, points: task.points,
      coins: task.coins || 0, frequency: task.frequency, priority: task.priority, child_id: task.child_id,
      is_recurring: !!task.is_recurring, recurrence_days: days,
      start_date: task.start_date || '', end_date: task.end_date || '', due_time: task.due_time || '',
      requires_approval: !!task.requires_approval, visible_on_calendar: !!task.visible_on_calendar,
      generate_notification: task.generate_notification !== 0,
      allowance_rule: {
        affects_allowance: !!task.affects_allowance,
        bonus_amount: task.bonus_amount || 0,
        discount_amount: task.discount_amount || 0,
        apply_discount_if_late: !!task.apply_discount_if_late,
      },
    });
    setEditTask(task);
    setShowModal(true);
  };

  const toggleDay = (day) => {
    setForm((p) => ({
      ...p,
      recurrence_days: p.recurrence_days.includes(day)
        ? p.recurrence_days.filter((d) => d !== day)
        : [...p.recurrence_days, day],
    }));
  };

  const statusColor = {
    pending: 'warning', in_progress: 'info', waiting_approval: 'warning',
    completed: 'success', approved: 'success', rejected: 'danger',
    delayed: 'danger', expired: 'danger', cancelled: 'danger',
    completed_late: 'warning',
    not_completed: 'warning',
  };
  const statusLabel = {
    pending: 'Pendente', in_progress: 'Em andamento', waiting_approval: '⏳ Aguardando',
    completed: 'Concluída', approved: '✅ Aprovada', rejected: '❌ Reprovada',
    delayed: '⚠️ Atrasada', expired: 'Expirada', cancelled: 'Cancelada',
    completed_late: '⚠️ Concluída c/ Atraso',
    not_completed: '✖️ Não concluída',
  };

  const historyBucketBadge = {
    completed: 'success',
    rejected: 'danger',
    not_completed: 'warning',
    pending_open: 'info',
  };

  const isRecurring = form.frequency !== 'once';

  const blockUi = saveTaskMutation.isPending || toggleTemplateMutation.isPending;

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">✅ {t('task_management')}</h1>
          <p className="page-subtitle">Gerencie tarefas únicas e recorrentes</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={blockUi}
          onClick={() => { setForm(initialForm); setEditTask(null); setShowModal(true); }}
        >
          + {t('add_task')}
        </button>
      </div>

      {(occQ.isFetching || tasksQ.isFetching || (viewMode === 'history' && historyQ.isFetching)) &&
        ((occurrences.length > 0 && viewMode !== 'history') ||
          tasks.length > 0 ||
          (historyOccurrences.length > 0 && viewMode === 'history')) && (
        <p className="parent-dash__refetch-banner" aria-live="polite">A atualizar…</p>
      )}

      {/* FILTERS */}
      <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs tabs-scroll" style={{ margin: 0 }}>
          <button type="button" className={`tab ${viewMode === 'occurrences' ? 'active' : ''}`} onClick={() => setViewMode('occurrences')}>📅 Hoje</button>
          <button type="button" className={`tab ${viewMode === 'approvals' ? 'active' : ''}`} onClick={() => setViewMode('approvals')}>
            ⏳ Aprovações
            {occurrences.filter(o => o.status === 'waiting_approval').length > 0 && (
              <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.68rem' }}>
                {occurrences.filter(o => o.status === 'waiting_approval').length}
              </span>
            )}
          </button>
          <button type="button" className={`tab ${viewMode === 'history' ? 'active' : ''}`} onClick={() => setViewMode('history')}>📜 Histórico</button>
          <button type="button" className={`tab ${viewMode === 'templates' ? 'active' : ''}`} onClick={() => setViewMode('templates')}>🗂️ Modelos</button>
        </div>
        <select className="form-select" style={{ width: 'auto', maxWidth: '100%', minWidth: 0 }} value={filter.child_id} onChange={(e) => setFilter((p) => ({ ...p, child_id: e.target.value }))}>
          <option value="">{t('all')} {t('children')}</option>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filter.type} onChange={(e) => setFilter((p) => ({ ...p, type: e.target.value }))}>
          <option value="">{t('all')} Tipos</option>
          <option value="home">{t('home')}</option>
          <option value="school">{t('school')}</option>
          <option value="routine">Rotina</option>
          <option value="challenge">Desafio</option>
        </select>

        {viewMode === 'history' && (
          <>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>Intervalo:</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto', minHeight: 40 }}
              value={histFilter.from}
              max={histFilter.to}
              aria-label="Data inicial histórico"
              onChange={(e) =>
                setHistFilter((p) => ({ ...p, from: e.target.value }))
              }
            />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>a</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto', minHeight: 40 }}
              value={histFilter.to}
              min={histFilter.from}
              aria-label="Data final histórico"
              onChange={(e) =>
                setHistFilter((p) => ({ ...p, to: e.target.value }))
              }
            />
            <select
              className="form-select"
              style={{ width: 'auto', maxWidth: 220 }}
              aria-label="Filtro estado resumo"
              value={histFilter.history_status}
              onChange={(e) =>
                setHistFilter((p) => ({ ...p, history_status: e.target.value }))
              }
            >
              <option value="all">Resumo: todos</option>
              <option value="completed">Concluídas</option>
              <option value="not_completed">Não concluídas</option>
              <option value="rejected">Recusadas pelo pai</option>
              <option value="open">Em aberto (dia em curso)</option>
            </select>
            <select
              className="form-select"
              style={{ width: 'auto' }}
              aria-label="Tipo tarefa recorrente ou avulsa"
              value={histFilter.recurring_kind}
              onChange={(e) =>
                setHistFilter((p) => ({ ...p, recurring_kind: e.target.value }))
              }
            >
              <option value="all">Origem: todas</option>
              <option value="recurring">Só recorrentes</option>
              <option value="once">Só avulsas</option>
            </select>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: 160, maxWidth: 'min(280px, 100vw)' }}
              aria-label="Filtrar por modelo de tarefa"
              value={histFilter.task_id}
              onChange={(e) =>
                setHistFilter((p) => ({ ...p, task_id: e.target.value }))
              }
            >
              <option value="">Tarefa: todas</option>
              {tasks.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {(tk.title && tk.title.slice(0, 48)) || tk.id}
                  {tk.is_recurring ? ' 🔄' : ''}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {childrenQ.isError && (
        <p className="mb-16" style={{ fontSize: '0.88rem', color: 'var(--danger)' }}>
          Lista de filhos indisponível. {' '}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => childrenQ.refetch()}>Repetir</button>
        </p>
      )}

      {/* OCCURRENCES VIEW (TODAY) */}
      {viewMode === 'occurrences' && (
        <div className="table-container">
          <table className="table-stack-md">
            <thead><tr><th>Tarefa</th><th>Filho</th><th>Horário</th><th>Tipo</th><th>Pontos</th><th>Status</th><th>Ações</th></tr></thead>
            {occInitialSkeleton ? (
              <TaskTableSkeleton />
            ) : occQ.isError ? (
              <tbody>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ color: 'var(--danger)', marginBottom: 12 }}>Erro ao carregar ocorrências.</p>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => occQ.refetch()}>Tentar novamente</button>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {occurrences.length === 0 && occQ.isSuccess ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
                      Nenhuma tarefa para hoje. Crie tarefas recorrentes para vê-las aqui automaticamente.
                    </td>
                  </tr>
                ) : occurrences.map((occ) => (
                  <tr key={occ.id} style={occ.isDelayed ? { background: 'rgba(239,68,68,0.05)', borderLeft: '3px solid var(--danger)' } : undefined}>
                    <td data-label="Tarefa">
                      <strong>{occ.title}</strong>
                      {occ.is_recurring && <span className="badge badge-info ml-8" style={{ marginLeft: 6, fontSize: '0.7rem' }}>🔄 {occ.frequency}</span>}
                      {occ.isDelayed && <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: '0.7rem' }}>⚠️ Atrasada</span>}
                      {occ.wasLate && <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.7rem' }}>⚠️ C/ Atraso</span>}
                      {occ.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{occ.description}</div>}
                    </td>
                    <td data-label="Filho"><div className="flex gap-8" style={{ alignItems: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: occ.child_color || 'var(--border)' }} />{occ.assignee_name || occ.child_name}</div></td>
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
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => handleApproveOcc(occ.id, true)}>✅</button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleApproveOcc(occ.id, false)}>❌</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}

      {/* APPROVALS VIEW — tarefas aguardando aprovação do gestor */}
      {viewMode === 'approvals' && (
        <div className="table-container">
          {occInitialSkeleton ? (
            <table className="table-stack-md"><TaskTableSkeleton /></table>
          ) : (() => {
            const pending = occurrences.filter(o => o.status === 'waiting_approval');
            if (pending.length === 0) {
              return (
                <div className="empty-state" style={{ padding: '48px 0' }}>
                  <div className="empty-icon">✅</div>
                  <h3>Nenhuma aprovação pendente</h3>
                  <p>Quando um filho concluir uma tarefa que exige aprovação, ela aparecerá aqui.</p>
                </div>
              );
            }
            return (
              <table className="table-stack-md">
                <thead><tr><th>Tarefa</th><th>Filho</th><th>Horário</th><th>Pontos</th><th>Ações</th></tr></thead>
                <tbody>
                  {pending.map((occ) => (
                    <tr key={occ.id}>
                      <td data-label="Tarefa">
                        <strong>{occ.title}</strong>
                        {occ.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{occ.description}</div>}
                      </td>
                      <td data-label="Filho">
                        <div className="flex gap-8" style={{ alignItems: 'center' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: occ.child_color || 'var(--border)' }} />
                          {occ.assignee_name || occ.child_name}
                        </div>
                      </td>
                      <td data-label="Horário">{occ.due_time || '—'}</td>
                      <td data-label="Pontos"><span className="badge badge-primary">⭐{occ.points}</span></td>
                      <td data-label="Ações">
                        <div className="flex gap-8">
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => handleApproveOcc(occ.id, true)}>✅ Aprovar</button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleApproveOcc(occ.id, false)}>❌ Reprovar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* HISTÓRICO — ocurrencias materiais ou existentes ao longo do intervalo */}
      {viewMode === 'history' && (
        <div className="table-container">
          <p className="mb-16" style={{ fontSize: '0.86rem', color: 'var(--text-light)', maxWidth: 860 }}>
            <strong>Histórico</strong>: cada linha corresponde a uma ocorrência num dia (recorrentes geram uma por dia quando o modelo está{' '}
            <strong>ativo</strong>). Concluída = feita pelo filho e{' '}
            <strong>confirmada pelo pai</strong> quando a regra pede aprovação — ou marcada como concluída sem esse passo quando não pede.
          </p>
          <table className="table-stack-md">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tarefa</th>
                <th>Filho</th>
                <th>Origem</th>
                <th>Resumo</th>
                <th>Estado registado</th>
                <th>Ações</th>
              </tr>
            </thead>
            {histInitialSkeleton ? (
              <TaskTableSkeleton cols={7} />
            ) : historyQ.isError ? (
              <tbody>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ color: 'var(--danger)', marginBottom: 12 }}>Erro ao carregar histórico.</p>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => historyQ.refetch()}>Repetir</button>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {historyOccurrences.length === 0 && historyQ.isSuccess ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
                      Sem resultados neste período ou filtros. Alargue as datas ou defina filtros diferentes.
                      As tarefas recorrentes ativas aparecem no histórico dia a dia.
                    </td>
                  </tr>
                ) : (
                  historyOccurrences.map((occ) => (
                    <tr key={occ.id}>
                      <td data-label="Data">{occ.occurrence_date}</td>
                      <td data-label="Tarefa">
                        <strong>{occ.title}</strong>
                        {occ.description && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{occ.description}</div>
                        )}
                      </td>
                      <td data-label="Filho">
                        <div className="flex gap-8" style={{ alignItems: 'center' }}>
                          <div
                            style={{ width: 8, height: 8, borderRadius: '50%', background: occ.child_color || 'var(--border)' }}
                          />
                          {occ.assignee_name || occ.child_name}
                        </div>
                      </td>
                      <td data-label="Origem">
                        {occ.is_recurring ? (
                          <span className="badge badge-info">🔄 {occ.frequency || 'recorrente'}</span>
                        ) : (
                          <span className="badge badge-ghost">Avulsa</span>
                        )}
                      </td>
                      <td data-label="Resumo">
                        <span className={`badge badge-${historyBucketBadge[occ.history_bucket] || 'info'}`}>
                          {historyBucketLabel(occ.history_bucket)}
                        </span>
                      </td>
                      <td data-label="Estado registado">
                        <span className={`badge badge-${statusColor[occ.status] || 'info'}`}>
                          {statusLabel[occ.status] || occ.status}
                        </span>
                      </td>
                      <td data-label="Ações">
                        {Number(occ.is_health_reminder) === 1 && ['pending', 'in_progress', 'delayed'].includes(occ.status) ? (
                          <div className="flex gap-8 flex-wrap">
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => handleHealthOcc(occ.id, 'taken')}>Tomado</button>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleHealthOcc(occ.id, 'skipped')}>Não tomado</button>
                          </div>
                        ) : occ.status === 'waiting_approval' ? (
                          <div className="flex gap-8 flex-wrap">
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => handleApproveOcc(occ.id, true)}>✅ Aprovar</button>
                            <button type="button" className="btn btn-sm btn-danger" onClick={() => handleApproveOcc(occ.id, false)}>❌ Recusar</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-light)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            )}
          </table>
        </div>
      )}

      {/* TEMPLATES VIEW */}
      {viewMode === 'templates' && (
        <div className="table-container">
          <table className="table-stack-md">
            <thead><tr><th>{t('task_title')}</th><th>{t('select_child')}</th><th>Recorrência</th><th>Horário</th><th>{t('points')}</th><th>Modelo</th><th>Ações</th></tr></thead>
            {tplInitialSkeleton ? (
              <TaskTableSkeleton />
            ) : tasksQ.isError ? (
              <tbody>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ color: 'var(--danger)', marginBottom: 12 }}>Erro ao carregar modelos.</p>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => tasksQ.refetch()}>Tentar novamente</button>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {tasks.length === 0 && tasksQ.isSuccess ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>{t('no_tasks')}</td></tr>
                ) : tasks.map((task) => (
                  <tr
                    key={task.id}
                    style={task.status !== 'active' ? { opacity: 0.82 } : undefined}
                  >
                    <td data-label={t('task_title')}>
                      <strong>{task.title}</strong>
                      {task.is_recurring && <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.7rem' }}>🔄</span>}
                      {task.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{task.description}</div>}
                    </td>
                    <td data-label={t('select_child')}><div className="flex gap-8" style={{ alignItems: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: task.child_color }} />{task.child_name}</div></td>
                    <td data-label="Recorrência">{task.is_recurring ? <span className="badge badge-primary">{task.frequency}</span> : <span className="badge badge-ghost">única</span>}</td>
                    <td data-label="Horário">{task.due_time || '—'}</td>
                    <td data-label={t('points')}><span className="badge badge-primary">⭐{task.points}</span></td>
                    <td data-label="Modelo">
                      {task.status === 'active' ? (
                        <span className="badge badge-success">Ativo</span>
                      ) : task.status === 'inactive' ? (
                        <span className="badge badge-ghost" title="Inativo: não gera novas ocorrências; histórico preservado.">
                          Inativo
                        </span>
                      ) : (
                        <span className="badge badge-warning">{task.status}</span>
                      )}
                    </td>
                    <td data-label="Ações">
                      <div className="flex gap-8 flex-wrap">
                        {task.status === 'completed' && <button type="button" className="btn btn-sm btn-primary" onClick={() => handleApproveTask(task.id, true)}>✅</button>}
                        {task.status === 'completed' && <button type="button" className="btn btn-sm btn-danger" onClick={() => handleApproveTask(task.id, false)}>❌</button>}
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={toggleTemplateMutation.isPending}
                          title={task.status === 'active' ? 'Para de criar novas ocorrências' : 'Volta a gerar ocorrências nos dias combinados'}
                          onClick={() => toggleTemplateMutation.mutate({ id: task.id, active: task.status !== 'active' })}
                        >
                          {task.status === 'active' ? '⏸ Desativar' : '▶️ Ativar'}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" disabled={toggleTemplateMutation.isPending} onClick={() => openEdit(task)}>✏️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}

      {/* MODAL: CREATE/EDIT TASK */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !blockUi && setShowModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editTask ? '✏️ Editar Tarefa' : '➕ Nova Tarefa'}</h2>
              <button type="button" className="modal-close" onClick={() => !blockUi && setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="grid grid-2">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Título *</label>
                  <input className="form-input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required disabled={blockUi} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Descrição</label>
                  <textarea className="form-textarea" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} disabled={blockUi} />
                </div>
                <div className="form-group">
                  <label className="form-label">Filho *</label>
                  <select className="form-select" value={form.child_id} onChange={(e) => setForm((p) => ({ ...p, child_id: e.target.value }))} required disabled={blockUi}>
                    <option value="">Selecionar...</option>
                    {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} disabled={blockUi}>
                    <option value="home">🏠 Casa</option>
                    <option value="school">📚 Escola</option>
                    <option value="routine">⏰ Rotina</option>
                    <option value="challenge">🏆 Desafio</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Recorrência</label>
                  <select className="form-select" value={form.frequency} onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value, is_recurring: e.target.value !== 'once' }))} disabled={blockUi}>
                    <option value="once">🔹 Única</option>
                    <option value="daily">🔄 Diária</option>
                    <option value="weekly">📅 Semanal</option>
                    <option value="monthly">📆 Mensal</option>
                    <option value="custom">🎯 Dias específicos</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Horário Limite {isRecurring && '*'}</label>
                  <input type="time" className="form-input" value={form.due_time} onChange={(e) => setForm((p) => ({ ...p, due_time: e.target.value }))} required={isRecurring} disabled={blockUi} />
                </div>

                {(form.frequency === 'weekly' || form.frequency === 'custom') && (
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Dias da Semana</label>
                    <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                      {DAYS.map((d) => (
                        <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                          className={`btn btn-sm ${form.recurrence_days.includes(d.value) ? 'btn-primary' : 'btn-ghost'}`} disabled={blockUi}>{d.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {isRecurring && (
                  <div className="form-group"><label className="form-label">Data de Início *</label><input type="date" className="form-input" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} required disabled={blockUi} /></div>
                )}
                {isRecurring && (
                  <div className="form-group"><label className="form-label">Data de Fim</label><input type="date" className="form-input" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} disabled={blockUi} /></div>
                )}

                <div className="form-group"><label className="form-label">Pontos</label><input type="number" className="form-input" value={form.points} onChange={(e) => setForm((p) => ({ ...p, points: +e.target.value }))} min={0} disabled={blockUi} /></div>
                <div className="form-group">
                  <label className="form-label">Prioridade</label>
                  <select className="form-select" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} disabled={blockUi}>
                    <option value="low">🔵 Baixa</option>
                    <option value="medium">🟡 Média</option>
                    <option value="high">🔴 Alta</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-16 mb-16" style={{ flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: blockUi ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={form.requires_approval} onChange={(e) => setForm((p) => ({ ...p, requires_approval: e.target.checked }))} disabled={blockUi} />
                  <span>Exige aprovação dos pais</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: blockUi ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={form.visible_on_calendar} onChange={(e) => setForm((p) => ({ ...p, visible_on_calendar: e.target.checked }))} disabled={blockUi} />
                  <span>Aparece no calendário</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: blockUi ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={form.generate_notification} onChange={(e) => setForm((p) => ({ ...p, generate_notification: e.target.checked }))} disabled={blockUi} />
                  <span>Gera notificação</span>
                </label>
              </div>

              <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: blockUi ? 'default' : 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={form.allowance_rule.affects_allowance} onChange={(e) => setForm((p) => ({ ...p, allowance_rule: { ...p.allowance_rule, affects_allowance: e.target.checked } }))} style={{ width: 18, height: 18 }} disabled={blockUi} />
                  <span style={{ fontWeight: 600 }}>💰 Impacta Mesada</span>
                </label>
                {form.allowance_rule.affects_allowance && (
                  <div className="grid grid-2">
                    <div className="form-group"><label className="form-label">Bônus (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={form.allowance_rule.bonus_amount || ''} onChange={(e) => setForm((p) => ({ ...p, allowance_rule: { ...p.allowance_rule, bonus_amount: parseFloat(e.target.value) || 0 } }))} disabled={blockUi} /></div>
                    <div className="form-group"><label className="form-label">Desconto (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={form.allowance_rule.discount_amount || ''} onChange={(e) => setForm((p) => ({ ...p, allowance_rule: { ...p.allowance_rule, discount_amount: parseFloat(e.target.value) || 0 } }))} disabled={blockUi} /></div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => !blockUi && setShowModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={blockUi}>{editTask ? t('save') : t('add_task')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
