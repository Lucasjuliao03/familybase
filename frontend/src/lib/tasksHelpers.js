import { shouldAutoRejectOccurrence } from './taskOccurrenceClosure.js';

const FREQ_PT = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  once: 'Única',
  custom: 'Personalizada',
};

const TYPE_PT = {
  school: 'Escolar',
  home: 'Doméstica',
  routine: 'Rotina',
  challenge: 'Desafio',
};

const STATUS_PT = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  waiting_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Reprovada',
  delayed: 'Atrasada',
  expired: 'Expirada',
  completed: 'Concluída',
  completed_late: 'Concluída com atraso',
  not_completed: 'Não concluída',
  cancelled: 'Cancelada',
};

export const TASK_FILTER_TABS = [
  { key: '', label: 'Todas', icon: '📋' },
  { key: 'pending', label: 'Pendentes', icon: '⏰' },
  { key: 'delayed', label: 'Atrasadas', icon: '⚠️', countKey: 'delayed' },
  { key: 'waiting_approval', label: 'Aguardando', icon: '⏳' },
  { key: 'approved', label: 'Aprovadas', icon: '✅' },
  { key: 'rejected', label: 'Reprovadas', icon: '✕' },
];

export function frequencyLabel(freq) {
  if (!freq) return 'Única';
  return FREQ_PT[freq] || freq;
}

export function taskTypeLabel(type) {
  if (!type) return 'Tarefa';
  return TYPE_PT[type] || type;
}

export function taskStatusLabel(occ) {
  const s = occ?.status || 'pending';
  if (occ?.isDelayed || s === 'delayed') return 'Atrasada';
  if (occ?.wasLate && s === 'waiting_approval') return 'Aguardando aprovação com atraso';
  if (occ?.wasLate && s === 'completed') return 'Concluída com atraso';
  return STATUS_PT[s] || s;
}

export function taskStatusBadge(occ) {
  const s = occ?.status || 'pending';
  if (occ?.isDelayed || s === 'delayed') return '⚠️ ATRASADA';
  if (occ?.wasLate) return '⚠️ COM ATRASO';
  if (s === 'waiting_approval') return '⏳ AGUARDANDO';
  if (s === 'approved' || s === 'completed') return '✅ APROVADA';
  if (s === 'rejected') return '✕ REPROVADA';
  if (s === 'pending' || s === 'in_progress') return '⏰ PENDENTE';
  if (s === 'not_completed') return '👻 NÃO FEITA';
  return (taskStatusLabel(occ) || '').toUpperCase();
}

/** Faixa lateral, badge e botão conforme status. */
export function taskStatusTheme(occ) {
  const s = occ?.status || 'pending';
  const delayed = occ?.isDelayed || s === 'delayed';

  if (delayed) {
    return { stripe: '#f87171', accent: '#ef4444', pastel: '#fef2f2', badgeBg: '#ef4444', btn: 'danger' };
  }
  if (s === 'approved' || s === 'completed') {
    return { stripe: '#34d399', accent: '#10b981', pastel: '#ecfdf5', badgeBg: '#10b981', btn: 'success' };
  }
  if (s === 'waiting_approval') {
    return { stripe: '#fbbf24', accent: '#f59e0b', pastel: '#fffbeb', badgeBg: '#f59e0b', btn: 'waiting' };
  }
  if (s === 'rejected' || s === 'not_completed') {
    return { stripe: '#f87171', accent: '#ef4444', pastel: '#fef2f2', badgeBg: '#64748b', btn: 'muted' };
  }
  if (occ?.wasLate) {
    return { stripe: '#fb923c', accent: '#f97316', pastel: '#fff7ed', badgeBg: '#f97316', btn: 'warning' };
  }
  return { stripe: '#818cf8', accent: '#6366f1', pastel: '#eef2ff', badgeBg: '#6366f1', btn: 'primary' };
}

export function taskIcon(title = '', type = '') {
  const t = String(title || '').toLowerCase();
  if (/cama|bed/.test(t)) return '🛏️';
  if (/brinquedo|toy/.test(t)) return '🧸';
  if (/mochila|pack/.test(t)) return '🎒';
  if (/prato|louça|lava/.test(t)) return '🍽️';
  if (/banho|escova|dente/.test(t)) return '🪥';
  if (/estudo|lição|dever/.test(t)) return '📖';
  if (/exerc|físic|esporte/.test(t)) return '⚽';
  if (/animal|pet|cão|gato/.test(t)) return '🐾';
  if (/planta|regar/.test(t)) return '🌱';
  if (/roupa|guardar/.test(t)) return '👕';
  if (/mesa|limpar/.test(t)) return '🧹';
  if (/saúde|reméd|medic/.test(t)) return '💊';

  switch (type) {
    case 'school': return '📚';
    case 'home': return '🏠';
    case 'routine': return '⏰';
    case 'challenge': return '🏆';
    default: return '✅';
  }
}

export function sortTasksForDisplay(list) {
  const rank = (o) => {
    if (o.isDelayed || o.status === 'delayed') return 0;
    if (o.status === 'pending' || o.status === 'in_progress') return 1;
    if (o.status === 'waiting_approval') return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

export function filterOccurrences(occurrences, filter) {
  if (!filter) return occurrences;
  return occurrences.filter((o) => {
    if (filter === 'delayed') return o.isDelayed || o.status === 'delayed';
    if (filter === 'pending') return ['pending', 'in_progress'].includes(o.status) && !o.isDelayed;
    return o.status === filter;
  });
}

export function countDelayed(occurrences) {
  return occurrences.filter((o) => o.isDelayed || o.status === 'delayed').length;
}

export function canCompleteTask(occ, now = new Date()) {
  if (Number(occ.is_health_reminder) === 1) return false;
  if (occ.status === 'rejected') return false;

  const isDelayed = occ.isDelayed || occ.status === 'delayed';
  const open = occ.status === 'pending' || occ.status === 'in_progress' || isDelayed;
  if (!open) return false;

  const task = {
    is_recurring: occ.is_recurring,
    frequency: occ.frequency,
    due_time: occ.due_time,
    start_date: occ.occurrence_date,
    is_health_reminder: occ.is_health_reminder,
  };

  if (shouldAutoRejectOccurrence(occ, task, now)) return false;

  return true;
}
