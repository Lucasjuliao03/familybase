export function normalizeMedalRequirementTypeForSave(v?: string | null): string {
  const x = String(v || '').trim().toLowerCase();
  switch (x) {
    case 'tasks_completed':
      return 'task_count';
    case 'streak':
      return 'task_streak';
    case 'first_reward':
      return 'reward_redemptions';
    case 'allowance_goal':
      return 'allowance_paid_cycles';
    default:
      return x || 'task_count';
  }
}

export function inferMedalGroup(m: { medal_group?: string; requirement_type?: string; category?: string }): string {
  if (m.medal_group) return m.medal_group;
  const rt = String(m.requirement_type || '').trim().toLowerCase();
  const rNorm = normalizeMedalRequirementTypeForSave(rt || m.requirement_type);
  if (rNorm === 'task_count' || rNorm === 'task_streak') return 'routine';
  if (rt === 'perfect_grade') return 'studies';
  if (rt === 'allowance_paid_cycles' || rt === 'allowance_goal') return 'allowance';
  if (rt === 'points_goal' || rt === 'reward_redemptions' || rt === 'first_reward') return 'rewards';
  const c = m.category;
  if (c === 'grades') return 'studies';
  if (c === 'tasks' || c === 'streak') return 'routine';
  if (c === 'allowance') return 'allowance';
  return 'special';
}

export function inferCategoryForApi(m: { requirement_type?: string; category?: string; medal_group?: string }): string {
  const crt = normalizeMedalRequirementTypeForSave(m.requirement_type);
  if (crt === 'perfect_grade') return 'grades';
  if (crt === 'task_streak') return 'streak';
  if (crt === 'task_count') return 'tasks';
  if (crt === 'allowance_paid_cycles') return 'allowance';
  if (crt === 'points_goal' || crt === 'reward_redemptions') return 'special';
  const c = m.category;
  if (c && ['tasks', 'grades', 'streak', 'special', 'allowance'].includes(c)) return c;
  const g = inferMedalGroup(m);
  if (g === 'studies') return 'grades';
  if (g === 'routine' || g === 'organization' || g === 'responsibility' || g === 'behavior') return 'tasks';
  if (g === 'allowance') return 'allowance';
  return 'special';
}
