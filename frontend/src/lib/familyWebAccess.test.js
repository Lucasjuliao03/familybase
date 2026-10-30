import test from 'node:test';
import assert from 'node:assert/strict';
import { familyWebAccessState, loadFamilyEntitlement, unavailableFamilyAccess } from './familyWebAccess.js';

const child = { id: 'child', role: 'child', family_id: 'family-a', status: 'active' };
const allowed = { ok: true, has_access: true, family_id: 'family-a', can_manage_billing: false };

test('child stays in verification during the two-phase login, then shares the confirmed family access', () => {
  assert.equal(familyWebAccessState(null, null, { loading: true }), 'checking');
  assert.equal(familyWebAccessState(child, null, { profileLoading: true }), 'checking');
  assert.equal(familyWebAccessState(child, allowed, { profileLoading: true }), 'checking');
  assert.equal(familyWebAccessState(child, allowed), 'allowed');
  for (const role of ['parent', 'relative']) assert.equal(familyWebAccessState({ ...child, role }, allowed), 'allowed');
});

test('unknown or failed verification is separate from a server-confirmed subscription denial', () => {
  assert.equal(familyWebAccessState(child, null), 'unavailable');
  assert.equal(familyWebAccessState(child, unavailableFamilyAccess(child.family_id)), 'unavailable');
  assert.equal(familyWebAccessState(child, { ...allowed, ok: false }), 'unavailable');
  assert.equal(familyWebAccessState(child, { ...allowed, has_access: false, enforcement_enabled: false }), 'blocked');
  assert.equal(familyWebAccessState(null, allowed), 'signed_out');
  assert.equal(familyWebAccessState({ ...child, family_id: null }, allowed), 'no_family');
});

test('another family or a malformed response never unlocks the child route', () => {
  assert.equal(familyWebAccessState(child, { ...allowed, family_id: 'family-b' }), 'unavailable');
  assert.equal(familyWebAccessState(child, { ...allowed, has_access: 'true' }), 'unavailable');
});

test('delayed access lookup waits for the RPC and never sends a chosen family or user to it', async () => {
  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const signal = new AbortController().signal;
  const client = { rpc: (...args) => {
    assert.deepEqual(args, ['get_effective_subscription']);
    return { abortSignal: received => { assert.equal(received, signal); return response; } };
  } };
  const job = loadFamilyEntitlement(client, child, { signal });
  resolveResponse({ data: allowed });
  assert.deepEqual(await job, allowed);
});

test('failed, mismatched and invalid RPC responses remain retryable without local access fallback', async () => {
  for (const result of [{ error: { code: 'network_error' } }, { data: { ...allowed, family_id: 'family-b' } },
    { data: { ...allowed, ok: false } }, { data: { ...allowed, has_access: 'true' } }]) {
    const client = { rpc: () => ({ abortSignal: async () => result }) };
    await assert.rejects(() => loadFamilyEntitlement(client, child), /confirmar o acesso/);
  }
});
