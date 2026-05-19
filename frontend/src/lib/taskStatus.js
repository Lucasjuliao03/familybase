/**
 * Lógica centralizada de cálculo de status real de uma ocorrência de tarefa.
 * Pura — sem side-effects, sem chamadas à API, sem state do React.
 *
 * REGRA:
 *  - Status finais (approved, rejected, cancelled) → mantém o status salvo
 *  - completed → verifica se foi após o prazo → 'completed_late' ou 'completed'
 *  - pending / in_progress → verifica se o prazo passou → 'delayed' ou mantém
 *
 * Timezone: usa o horário LOCAL do dispositivo (Date()), como o utilizador espera.
 */

/** Status que não devem ser sobrescritos pela lógica de atraso. */
const FINAL_STATUSES = new Set(['approved', 'rejected', 'cancelled', 'completed_late']);

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

/**
 * Retorna o status real da ocorrência levando em conta o horário atual.
 * @param {object} occ   – objeto de ocorrência vindo da API
 * @param {Date}   [now] – momento atual (padrão: new Date())
 * @returns {{ status: string, isDelayed: boolean, wasLate: boolean }}
 */
export function computeRealTaskStatus(occ, now = new Date()) {
  const saved = occ.status || 'pending';

  // Status finais não mudam
  if (FINAL_STATUSES.has(saved)) {
    return { status: saved, isDelayed: false, wasLate: false };
  }

  // Se já está concluída, verificar se foi após o prazo
  if (saved === 'completed' || saved === 'waiting_approval') {
    const dateStr = occ.occurrence_date || occ.start_date;
    const dueAt = buildDueDatetime(dateStr, occ.due_time);
    if (dueAt && occ.completed_at) {
      const completedAt = new Date(occ.completed_at);
      if (completedAt > dueAt) {
        return { status: saved === 'completed' ? 'completed_late' : 'waiting_approval', isDelayed: false, wasLate: true };
      }
    }
    return { status: saved, isDelayed: false, wasLate: false };
  }

  // Para status pendente/em andamento, verificar prazo
  const dateStr = occ.occurrence_date || occ.start_date;
  if (!dateStr && !occ.due_time) {
    // Sem prazo definido → sem atraso
    return { status: saved, isDelayed: false, wasLate: false };
  }

  const dueAt = buildDueDatetime(dateStr, occ.due_time);
  if (dueAt && now > dueAt) {
    return { status: 'delayed', isDelayed: true, wasLate: false };
  }

  return { status: saved, isDelayed: false, wasLate: false };
}

/**
 * Aplica computeRealTaskStatus a um array de ocorrências.
 * Retorna novo array com status corrigido e campos extras.
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
  if (!dateStr && !occ.due_time) return null;
  const dueAt = buildDueDatetime(dateStr, occ.due_time);
  if (!dueAt) return null;
  return Math.floor((dueAt - now) / 60000);
}
