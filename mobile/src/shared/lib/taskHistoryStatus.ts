/**
 * Lógica do painel pai — Histórico de tarefas (ocorrências).
 * Pura, sem chamadas HTTP.
 * Copiado de /frontend/src/lib/taskHistoryStatus.js — sem dependências de browser.
 */

/** @param {Date} date */
export function toLocalYmdStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Fim do dia civil local para o mesmo dia calendário que `ref`. */
export function endOfLocalCalendarDay(ref: Date = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
  return d;
}

/**
 * O dia da ocorrência (data local `occurrence_date`) já terminou em relação a `now`?
 */
export function isOccurrenceDayEnded(occurrenceDateStr: string | null | undefined, now: Date = new Date()): boolean {
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
export function occurrenceRequiresApproval(occ: Record<string, unknown>): boolean {
  const raw = (occ?.requires_approval ?? (occ?.tasks as Record<string, unknown>)?.requires_approval) as unknown;
  if (raw === false || raw === 0 || raw === 'false') return false;
  return true;
}

export function occurrenceIsHealth(occ: Record<string, unknown>): boolean {
  const raw = (occ?.is_health_reminder ?? (occ?.tasks as Record<string, unknown>)?.is_health_reminder) as unknown;
  return Number(raw) === 1 || raw === true;
}

export const HISTORY_BUCKETS = [
  'completed',
  'not_completed',
  'rejected',
  'pending_open',
] as const;

export type HistoryBucket = typeof HISTORY_BUCKETS[number];

/**
 * Concluída = confirmada pelo pai (approved) ou concluída sem necessidade de aprovação.
 * Recusada = rejected pelo pai (conta também como "não concluída" na regra de negócio, mas bucket separado).
 * Não concluída = dia da ocorrência terminou sem aprovação / sem fechar o ciclo.
 * pending_open = ainda há tempo no dia (ou ocorrência futura).
 */
export function deriveParentHistoryBucket(occ: Record<string, unknown>, now: Date = new Date()): HistoryBucket {
  const saved = (occ?.status as string) || 'pending';

  if (saved === 'rejected') return 'rejected';

  const req = occurrenceRequiresApproval(occ);
  const health = occurrenceIsHealth(occ);

  if (saved === 'approved') return 'completed';

  if (saved === 'completed') {
    if (!req || health) return 'completed';
    if (isOccurrenceDayEnded(occ.occurrence_date as string, now)) return 'not_completed';
    return 'pending_open';
  }

  if (saved === 'waiting_approval') {
    if (isOccurrenceDayEnded(occ.occurrence_date as string, now)) return 'not_completed';
    return 'pending_open';
  }

  if (saved === 'cancelled') {
    return isOccurrenceDayEnded(occ.occurrence_date as string, now) ? 'not_completed' : 'pending_open';
  }

  if (['pending', 'in_progress', 'delayed'].includes(saved)) {
    if (isOccurrenceDayEnded(occ.occurrence_date as string, now)) return 'rejected';
    return 'pending_open';
  }

  if (isOccurrenceDayEnded(occ.occurrence_date as string, now)) return 'not_completed';
  return 'pending_open';
}

/**
 * Etiqueta amigável para o bucket.
 */
export function historyBucketLabel(bucket: HistoryBucket): string {
  switch (bucket) {
    case 'completed':
      return 'Concluída';
    case 'not_completed':
      return 'Não concluída';
    case 'rejected':
      return 'Reprovada';
    case 'pending_open':
      return 'Em aberto';
    default:
      return bucket;
  }
}
