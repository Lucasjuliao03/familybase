/**
 * Regras de fecho / reprovação automática de ocorrências de tarefa.
 * Puro — sem Supabase.
 * Copiado de /frontend/src/lib/taskOccurrenceClosure.js — sem dependências de browser.
 */
import { buildDueDatetime } from './taskStatus';
import { isOccurrenceDayEnded } from './taskHistoryStatus';

export const AUTO_REJECT_REASON = 'Reprovação automática: prazo não cumprido';

export const OPEN_OCCURRENCE_STATUSES = ['pending', 'in_progress', 'delayed'] as const;

export function isOpenOccurrenceStatus(status: string | null | undefined): boolean {
  return OPEN_OCCURRENCE_STATUSES.includes((status || 'pending') as typeof OPEN_OCCURRENCE_STATUSES[number]);
}

export function isRecurringTask(task: Record<string, unknown> | null | undefined): boolean {
  if (!task) return false;
  const freq = (task.frequency as string) || 'once';
  return !!(task.is_recurring) && freq !== 'once';
}

/**
 * Deve a ocorrência ser reprovada automaticamente agora?
 * — Recorrente: fim do dia civil da ocorrência sem conclusão.
 * — Única: após horário limite (ou fim do dia se não houver horário).
 */
export function shouldAutoRejectOccurrence(
  occ: Record<string, unknown>,
  task: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): boolean {
  const status = (occ?.status as string) || 'pending';
  if (!isOpenOccurrenceStatus(status)) return false;

  const dateStr = (occ?.occurrence_date || task?.start_date) as string | undefined;
  if (!dateStr) return false;

  if (task?.is_health_reminder) return false;

  if (isRecurringTask(task)) {
    return isOccurrenceDayEnded(dateStr, now);
  }

  const dueTime = (task?.due_time || occ?.due_time) as string | undefined;
  if (dueTime) {
    const dueAt = buildDueDatetime(dateStr, dueTime);
    return dueAt ? now > dueAt : isOccurrenceDayEnded(dateStr, now);
  }

  return isOccurrenceDayEnded(dateStr, now);
}

/** Conclusão após o horário limite, ainda no mesmo dia da ocorrência. */
export function isCompletionLate(
  occ: Record<string, unknown>,
  task: Record<string, unknown> | null | undefined,
  completedAt: Date = new Date(),
): boolean {
  const dateStr = (occ?.occurrence_date || task?.start_date) as string | undefined;
  if (!dateStr) return false;
  const dueTime = (task?.due_time || occ?.due_time) as string | undefined;
  if (!dueTime) return false;
  const dueAt = buildDueDatetime(dateStr, dueTime);
  if (!dueAt || completedAt <= dueAt) return false;
  if (isOccurrenceDayEnded(dateStr, completedAt)) return false;
  return true;
}
