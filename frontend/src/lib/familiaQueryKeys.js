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

export function childGamificationProfileKey(childId) {
  return ['gamification', 'profile', childId];
}
