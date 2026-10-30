export async function emitWebEvent(client, kind, route, duration) {
  const group = ['parent', 'child', 'master'].includes(route) ? route : 'auth';
  try {
    // Supabase query builders are awaitable, but do not implement Promise.catch().
    const { error } = await client.rpc('record_web_event', {
      p_kind: kind,
      p_route: group,
      p_duration_ms: Number.isFinite(duration) ? Math.min(120000, Math.max(0, Math.round(duration))) : null,
    });
    return !error;
  } catch {
    // Observability must never interrupt login, navigation or family operations.
    return false;
  }
}
