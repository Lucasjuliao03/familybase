/**
 * Regras de fecho / reprovação automática de ocorrências de tarefa.
 * Puro — sem Supabase.
 */
import { buildDueDatetime } from './taskStatus.js';
import { isOccurrenceDayEnded } from './taskHistoryStatus.js';

export const AUTO_REJECT_REASON = 'Reprovação automática: prazo não cumprido';

export const OPEN_OCCURRENCE_STATUSES = ['pending', 'in_progress', 'delayed'];

export function isOpenOccurrenceStatus(status) {
  return OPEN_OCCURRENCE_STATUSES.includes(status || 'pending');
}

export function isRecurringTask(task) {
  if (!task) return false;
  const freq = task.frequency || 'once';
  return !!task.is_recurring && freq !== 'once';
}

/**
 * Deve a ocorrência ser reprovada automaticamente agora?
 * — Recorrente: fim do dia civil da ocorrência sem conclusão.
 * — Única: após horário limite (ou fim do dia se não houver horário).
 */
export function shouldAutoRejectOccurrence(occ, task, now = new Date()) {
  const status = occ?.status || 'pending';
  if (!isOpenOccurrenceStatus(status)) return false;

  const dateStr = occ?.occurrence_date || task?.start_date;
  if (!dateStr) return false;

  if (task?.is_health_reminder) return false;

  if (isRecurringTask(task)) {
    return isOccurrenceDayEnded(dateStr, now);
  }

  const dueTime = task?.due_time || occ?.due_time;
  if (dueTime) {
    const dueAt = buildDueDatetime(dateStr, dueTime);
    return dueAt ? now > dueAt : isOccurrenceDayEnded(dateStr, now);
  }

  return isOccurrenceDayEnded(dateStr, now);
}

/** Conclusão após o horário limite, ainda no mesmo dia da ocorrência. */
export function isCompletionLate(occ, task, completedAt = new Date()) {
  const dateStr = occ?.occurrence_date || task?.start_date;
  if (!dateStr) return false;
  const dueTime = task?.due_time || occ?.due_time;
  if (!dueTime) return false;
  const dueAt = buildDueDatetime(dateStr, dueTime);
  if (!dueAt || completedAt <= dueAt) return false;
  if (isOccurrenceDayEnded(dateStr, completedAt)) return false;
  return true;
}
