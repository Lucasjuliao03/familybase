const enabled = (value) => ![false, 0, '0', 'false'].includes(value);
const embedded = (value) => Array.isArray(value) ? value[0] : value;

export function isRewardAvailable(reward) {
  return !reward.deleted_at && enabled(reward.is_active) && enabled(reward.available);
}

export function buildRewardPayload(body) {
  const name = String(body.name ?? '').trim();
  const rawCost = body.point_cost;
  const pointCost = typeof rawCost === 'number' || (typeof rawCost === 'string' && rawCost.trim() !== '') ? Number(rawCost) : NaN;
  if (!name) throw new Error('Informe o nome da recompensa.');
  if (!Number.isInteger(pointCost) || pointCost < 0 || pointCost > 2147483647) {
    throw new Error('O custo deve ser um número inteiro de pontos, maior ou igual a zero.');
  }
  const payload = { name, point_cost: pointCost };
  if (body.description !== undefined) payload.description = String(body.description ?? '').trim() || null;
  if (body.icon !== undefined) payload.icon = String(body.icon ?? '').trim() || '🎁';
  if (body.type !== undefined) payload.type = String(body.type || 'non_financial');
  if (body.is_active !== undefined) payload.is_active = enabled(body.is_active);
  if (body.available !== undefined) payload.available = enabled(body.available);
  else if (body.is_active !== undefined) payload.available = payload.is_active;
  return payload;
}

export function mapRedemptionListRow(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const reward = embedded(raw.rewards);
  const child = embedded(raw.children);
  const rest = { ...raw };
  delete rest.rewards;
  delete rest.children;
  const cost = rest.point_cost ?? rest.reward_point_cost ?? reward?.point_cost;
  const pointCost = cost != null && cost !== '' && Number.isInteger(Number(cost)) && Number(cost) >= 0 ? Number(cost) : null;
  const icon = rest.reward_icon ?? rest.icon ?? reward?.icon ?? '🎁';
  return {
    ...rest,
    reward_name: rest.reward_name ?? reward?.name ?? 'Recompensa',
    reward_icon: icon,
    icon,
    point_cost: pointCost,
    reward_point_cost: pointCost,
    child_name: child?.name ?? rest.child_name ?? '',
  };
}
