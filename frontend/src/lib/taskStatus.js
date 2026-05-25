/**
 * Lógica centralizada de cálculo de status real de uma ocorrência de tarefa.
 * Pura — sem side-effects, sem chamadas à API, sem state do React.
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
import { isOccurrenceDayEnded } from './taskHistoryStatus.js';
import { isRecurringTask, isOpenOccurrenceStatus, shouldAutoRejectOccurrence } from './taskOccurrenceClosure.js';

/** Status que não devem ser sobrescritos pela lógica de atraso. */
const FINAL_STATUSES = new Set(['approved', 'rejected', 'cancelled', 'completed_late']);

/** Retorna data local no formato YYYY-MM-DD */
function toLocalYmdStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Constrói um objeto Date local a partir de uma string de data (YYYY-MM-DD)
 * e um horário opcional (HH:mm). Se não houver horário, usa fim do dia (23:59).
 * @param {string} dateStr   – ex: '2026-05-18'
 * @param {string} [timeStr] – ex: '10:30'
 * @returns {Date}
 */
export function buildDueDatetime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (timeStr && /^\d{2}:\d{2}/.test(timeStr)) {
    const [h, min] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0, 0);
  }
  // Sem horário → considera o dia inteiro; atraso só após meia-noite do dia seguinte
  return new Date(y, m - 1, d, 23, 59, 59, 0);
}

function taskFromOcc(occ) {
  return {
    is_recurring: occ.is_recurring ?? occ.tasks?.is_recurring,
    frequency: occ.frequency ?? occ.tasks?.frequency,
    due_time: occ.due_time ?? occ.tasks?.due_time,
    start_date: occ.start_date ?? occ.tasks?.start_date,
    is_health_reminder: occ.is_health_reminder ?? occ.tasks?.is_health_reminder,
  };
}

/**
 * Retorna o status real da ocorrência levando em conta o horário atual.
 * @param {object} occ   – objeto de ocorrência vindo da API
 * @param {Date}   [now] – momento atual (padrão: new Date())
 * @returns {{ status: string, isDelayed: boolean, wasLate: boolean }}
 */
export function computeRealTaskStatus(occ, now = new Date()) {
  const saved = occ.status || 'pending';
  const task = taskFromOcc(occ);

  // Status finais não mudam
  if (FINAL_STATUSES.has(saved)) {
    return { status: saved, isDelayed: false, wasLate: !!occ.wasLate };
  }

  if (saved === 'rejected') {
    return { status: 'rejected', isDelayed: false, wasLate: false };
  }

  // Se já está concluída, verificar se foi após o prazo
  if (saved === 'completed' || saved === 'waiting_approval') {
    const dateStr = occ.occurrence_date || occ.start_date;
    const dueAt = buildDueDatetime(dateStr, task.due_time);
    const completedLateFlag = !!occ.completed_late;
    if (dueAt && occ.completed_at) {
      const completedAt = new Date(occ.completed_at);
      const wasLate = completedLateFlag || completedAt > dueAt;
      if (wasLate) {
        return { status: saved, isDelayed: false, wasLate: true };
      }
    } else if (completedLateFlag) {
      return { status: saved, isDelayed: false, wasLate: true };
    }
    return { status: saved, isDelayed: false, wasLate: false };
  }

  const dateStr = occ.occurrence_date || occ.start_date;

  // Reprovação automática (display alinhado à API)
  if (isOpenOccurrenceStatus(saved) && shouldAutoRejectOccurrence(occ, task, now)) {
    return { status: 'rejected', isDelayed: false, wasLate: false };
  }

  // Dia passado ainda aberto na BD (antes do fecho lazy) → reprovada na UI
  if (dateStr && isOpenOccurrenceStatus(saved)) {
    const todayYmd = toLocalYmdStr(now);
    if (dateStr.slice(0, 10) < todayYmd) {
      return { status: 'rejected', isDelayed: false, wasLate: false };
    }
  }

  if (!dateStr && !task.due_time) {
    return { status: saved, isDelayed: false, wasLate: false };
  }

  const dueAt = buildDueDatetime(dateStr, task.due_time);
  if (dueAt && now > dueAt && isRecurringTask(task) && !isOccurrenceDayEnded(dateStr, now)) {
    return { status: 'delayed', isDelayed: true, wasLate: false };
  }

  return { status: saved, isDelayed: false, wasLate: false };
}

/**
 * Aplica computeRealTaskStatus a um array de ocorrências.
 * @param {object[]} occurrences
 * @param {Date} [now]
 * @returns {object[]}
 */
export function enrichOccurrencesStatus(occurrences, now = new Date()) {
  return occurrences.map((occ) => {
    const { status, isDelayed, wasLate } = computeRealTaskStatus(occ, now);
    return { ...occ, status, isDelayed, wasLate };
  });
}

/**
 * Calcula quantos minutos faltam para o prazo (negativo = já passou).
 * @param {object} occ
 * @param {Date} [now]
 * @returns {number|null}
 */
export function minutesToDeadline(occ, now = new Date()) {
  const dateStr = occ.occurrence_date || occ.start_date;
  const dueTime = occ.due_time ?? occ.tasks?.due_time;
  if (!dateStr && !dueTime) return null;
  const dueAt = buildDueDatetime(dateStr, dueTime);
  if (!dueAt) return null;
  return Math.floor((dueAt - now) / 60000);
}
