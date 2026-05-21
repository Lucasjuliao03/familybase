/**
 * Lógica do painel pai — Histórico de tarefas (ocorrências).
 * Pura, sem chamadas HTTP.
 */

/** @param {Date} date */
export function toLocalYmdStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Fim do dia civil local para o mesmo dia calendário que `ref`. */
export function endOfLocalCalendarDay(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
  return d;
}

/**
 * O dia da ocorrência (data local `occurrence_date`) já terminou em relação a `now`?
 */
export function isOccurrenceDayEnded(occurrenceDateStr, now = new Date()) {
  if (!occurrenceDateStr) return false;
  const ymd = String(occurrenceDateStr).slice(0, 10);
  const today = toLocalYmdStr(now);
  if (ymd < today) return true;
  if (ymd > today) return false;
  return now.getTime() >= endOfLocalCalendarDay(now).getTime();
}

/**
 * `requiresApproval` efectivo para a ocorrência (vem da tarefa modelo).
 */
export function occurrenceRequiresApproval(occ) {
  const raw = occ?.requires_approval ?? occ?.tasks?.requires_approval;
  if (raw === false || raw === 0 || raw === 'false') return false;
  return true;
}

export function occurrenceIsHealth(occ) {
  const raw = occ?.is_health_reminder ?? occ?.tasks?.is_health_reminder;
  return Number(raw) === 1 || raw === true;
}

export const HISTORY_BUCKETS = /** @type {const} */ ([
  'completed',
  'not_completed',
  'rejected',
  'pending_open',
]);

/**
 * Concluída = confirmada pelo pai (approved) ou concluída sem necessidade de aprovação.
 * Recusada = rejected pelo pai (conta também como “não concluída” na regra de negócio, mas bucket separado).
 * Não concluída = dia da ocorrência terminou sem aprovação / sem fechar o ciclo.
 * pending_open = ainda há tempo no dia (ou ocorrência futura).
 *
 * @param {object} occ — linha já mapeada pela API (`title`, `due_time`, `requires_approval`, `tasks?`, …)
 * @param {Date} [now]
 * @returns {typeof HISTORY_BUCKETS[number]}
 */
export function deriveParentHistoryBucket(occ, now = new Date()) {
  const saved = occ?.status || 'pending';

  if (saved === 'rejected') return 'rejected';

  const req = occurrenceRequiresApproval(occ);
  const health = occurrenceIsHealth(occ);

  if (saved === 'approved') return 'completed';

  if (saved === 'completed') {
    if (!req || health) return 'completed';
    /* child marcou mas ainda espera pai — incomum; tratar conforme estado temporal */
    if (isOccurrenceDayEnded(occ.occurrence_date, now)) return 'not_completed';
    return 'pending_open';
  }

  /* Aguardando aprovação: só é “histórico falho” depois do fim do dia */
  if (saved === 'waiting_approval') {
    if (isOccurrenceDayEnded(occ.occurrence_date, now)) return 'not_completed';
    return 'pending_open';
  }

  if (saved === 'cancelled') {
    return isOccurrenceDayEnded(occ.occurrence_date, now) ? 'not_completed' : 'pending_open';
  }

  /* pending, in_progress, delayed, expired … */
  if (isOccurrenceDayEnded(occ.occurrence_date, now)) return 'not_completed';
  return 'pending_open';
}

/**
 * Etiqueta amigável para o bucket.
 */
export function historyBucketLabel(bucket) {
  switch (bucket) {
    case 'completed':
      return 'Concluída';
    case 'not_completed':
      return 'Não concluída';
    case 'rejected':
      return 'Recusada pelo pai';
    case 'pending_open':
      return 'Em aberto';
    default:
      return bucket;
  }
}
