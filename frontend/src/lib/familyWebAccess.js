export function familyWebAccessState(user, entitlement, { loading = false, profileLoading = false } = {}) {
  if (loading || profileLoading) return 'checking';
  if (!user) return 'signed_out';
  if (user.role === 'master') return 'allowed'; // Master routes also require the dedicated MFA gate.
  if (!user.family_id) return 'no_family';
  if (entitlement?.ok !== true || typeof entitlement.has_access !== 'boolean'
      || entitlement.family_id !== user.family_id) return 'unavailable';
  return entitlement.has_access ? 'allowed' : 'blocked';
}

export function unavailableFamilyAccess(familyId) {
  return { ok: false, has_access: false, family_id: familyId ?? null, can_manage_billing: false, reason: 'verification_unavailable' };
}

export async function loadFamilyEntitlement(client, profile, { signal = AbortSignal.timeout(10000) } = {}) {
  // Family and billing ownership always come from the authenticated server RPC.
  const { data, error } = await client.rpc('get_effective_subscription').abortSignal(signal);
  if (error || data?.ok !== true || typeof data.has_access !== 'boolean'
      || (profile.role !== 'master' && (!profile.family_id || data.family_id !== profile.family_id))) {
    throw new Error('Não foi possível confirmar o acesso da família. Tente novamente.');
  }
  return data;
}
