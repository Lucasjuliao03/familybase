/**
 * Lógica centralizada de cálculo de status real de uma ocorrência de tarefa.
 * Pura — sem side-effects, sem chamadas à API, sem state do React.
 * Copiado de /frontend/src/lib/taskStatus.js — sem dependências de browser.
 *
 * REGRA:
 *  - Status finais (approved, rejected, cancelled) → mantém o status salvo
 *  - completed → verifica se foi após o prazo → wasLate
 *  - pending / in_progress → verifica atraso no mesmo dia → delayed
 *  - Recorrente: reprovação automática só persiste na API; aqui espelhamos fim do dia
 *  - Única: após horário limite → reprovada (display)
 *
 * Timezone: usa o horário LOCAL do dispositivo (Date()), como o utilizador espera.
 */
import { isOccurrenceDayEnded } from './taskHistoryStatus';
import { isRecurringTask, isOpenOccurrenceStatus, shouldAutoRejectOccurrence } from './taskOccurrenceClosure';

/** Status que não devem ser sobrescritos pela lógica de atraso. */
const FINAL_STATUSES = new Set(['approved', 'rejected', 'cancelled', 'completed_late']);

/** Retorna data local no formato YYYY-MM-DD */
function toLocalYmdStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Constrói um objeto Date local a partir de uma string de data (YYYY-MM-DD)
 * e um horário opcional (HH:mm). Se não houver horário, usa fim do dia (23:59).
 */
export function buildDueDatetime(dateStr: string | null | undefined, timeStr?: string | null): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (timeStr && /^\d{2}:\d{2}/.test(timeStr)) {
    const [h, min] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0, 0);
  }
  return new Date(y, m - 1, d, 23, 59, 59, 0);
}

function taskFromOcc(occ: Record<string, unknown>): Record<string, unknown> {
  const tasks = occ.tasks as Record<string, unknown> | undefined;
  return {
    is_recurring: occ.is_recurring ?? tasks?.is_recurring,
    frequency: occ.frequency ?? tasks?.frequency,
    due_time: occ.due_time ?? tasks?.due_time,
    start_date: occ.start_date ?? tasks?.start_date,
    is_health_reminder: occ.is_health_reminder ?? tasks?.is_health_reminder,
  };
}

export interface RealTaskStatus {
  status: string;
  isDelayed: boolean;
  wasLate: boolean;
}

/**
 * Retorna o status real da ocorrência levando em conta o horário atual.
 */
export function computeRealTaskStatus(occ: Record<string, unknown>, now: Date = new Date()): RealTaskStatus {
  const saved = (occ.status as string) || 'pending';
  const task = taskFromOcc(occ);

  if (FINAL_STATUSES.has(saved)) {
    return { status: saved, isDelayed: false, wasLate: !!(occ.wasLate) };
  }

  if (saved === 'rejected') {
    return { status: 'rejected', isDelayed: false, wasLate: false };
  }

  if (saved === 'completed' || saved === 'waiting_approval') {
    const dateStr = (occ.occurrence_date || occ.start_date) as string | undefined;
    const dueAt = buildDueDatetime(dateStr, task.due_time as string | undefined);
    const completedLateFlag = !!(occ.completed_late);
    if (dueAt && occ.completed_at) {
      const completedAt = new Date(occ.completed_at as string);
      const wasLate = completedLateFlag || completedAt > dueAt;
      if (wasLate) {
        return { status: saved, isDelayed: false, wasLate: true };
      }
    } else if (completedLateFlag) {
      return { status: saved, isDelayed: false, wasLate: true };
    }
    return { status: saved, isDelayed: false, wasLate: false };
  }

  const dateStr = (occ.occurrence_date || occ.start_date) as string | undefined;

  if (isOpenOccurrenceStatus(saved) && shouldAutoRejectOccurrence(occ, task, now)) {
    return { status: 'rejected', isDelayed: false, wasLate: false };
  }

  if (dateStr && isOpenOccurrenceStatus(saved)) {
    const todayYmd = toLocalYmdStr(now);
    if (dateStr.slice(0, 10) < todayYmd) {
      return { status: 'rejected', isDelayed: false, wasLate: false };
    }
  }

  if (!dateStr && !task.due_time) {
    return { status: saved, isDelayed: false, wasLate: false };
  }

  const dueAt = buildDueDatetime(dateStr, task.due_time as string | undefined);
  if (dueAt && now > dueAt && isRecurringTask(task) && !isOccurrenceDayEnded(dateStr, now)) {
    return { status: 'delayed', isDelayed: true, wasLate: false };
  }

  return { status: saved, isDelayed: false, wasLate: false };
}

/**
 * Aplica computeRealTaskStatus a um array de ocorrências.
 */
export function enrichOccurrencesStatus(
  occurrences: Record<string, unknown>[],
  now: Date = new Date(),
): Record<string, unknown>[] {
  return occurrences.map((occ) => {
    const { status, isDelayed, wasLate } = computeRealTaskStatus(occ, now);
    return { ...occ, status, isDelayed, wasLate };
  });
}

/**
 * Calcula quantos minutos faltam para o prazo (negativo = já passou).
 */
export function minutesToDeadline(occ: Record<string, unknown>, now: Date = new Date()): number | null {
  const dateStr = (occ.occurrence_date || occ.start_date) as string | undefined;
  const tasks = occ.tasks as Record<string, unknown> | undefined;
  const dueTime = (occ.due_time ?? tasks?.due_time) as string | undefined;
  if (!dateStr && !dueTime) return null;
  const dueAt = buildDueDatetime(dateStr, dueTime);
  if (!dueAt) return null;
  return Math.floor((dueAt.getTime() - now.getTime()) / 60000);
}
