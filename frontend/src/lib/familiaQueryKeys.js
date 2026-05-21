/** Chaves estáveis para TanStack Query (cache + invalidação granular). */

export function parentDashboardQueryKey() {
  return ['reports', 'dashboard'];
}

export function familyChildrenQueryKey() {
  return ['families', 'children'];
}

export function taskListQueryKey(filter) {
  const f = {
    child_id: filter.child_id || null,
    type: filter.type || null,
  };
  return ['tasks', 'list', f];
}

export function taskOccurrencesQueryKey(filter, dateYmd) {
  const f = {
    child_id: filter.child_id || null,
    type: filter.type || null,
  };
  return ['tasks', 'occurrences', dateYmd || '', f];
}

/** Histórico (intervalo + filtros lógicos) — pai/responsável. */
export function taskHistoryQueryKey(histFilter, listFilter = {}) {
  return [
    'tasks',
    'history',
    'occurrences',
    {
      from: histFilter?.from || null,
      to: histFilter?.to || null,
      history_status: histFilter?.history_status || 'all',
      recurring_kind: histFilter?.recurring_kind || 'all',
      task_id: histFilter?.task_id || null,
      child_id: listFilter.child_id || null,
      type: listFilter.type || null,
    },
  ];
}

export function childGamificationProfileKey(childId) {
  return ['gamification', 'profile', childId];
}
