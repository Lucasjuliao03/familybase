import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { emitWebEvent } from './webTelemetry.js';

test('telemetry accepts the installed Supabase RPC builder without a catch method', async () => {
  const requests = [];
  const client = createClient('https://fixture.example.test', 'publishable_fixture', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => { requests.push([url, JSON.parse(init.body)]); return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }); } },
  });
  assert.equal(typeof client.rpc('record_web_event').catch, 'undefined');
  assert.equal(await emitWebEvent(client, 'page_load', 'child', 145.7), true);
  assert.equal(requests.length, 1);
  assert.ok(requests[0][0].endsWith('/rest/v1/rpc/record_web_event'));
  assert.deepEqual(requests[0][1], { p_kind: 'page_load', p_route: 'child', p_duration_ms: 146 });
});

test('telemetry failure never rejects the caller or includes private navigation content', async () => {
  for (const rpc of [() => { throw new Error('network'); }, () => Promise.reject(new Error('network')), () => Promise.resolve({ error: { code: '42501' } })]) {
    assert.equal(await emitWebEvent({ rpc }, 'page_load', '/child?token=private', 100), false);
  }
  let sent;
  const client = { rpc: (_, payload) => { sent = payload; return Promise.resolve({ error: null }); } };
  assert.equal(await emitWebEvent(client, 'api_error', 'unknown?private', Infinity), true);
  assert.deepEqual(sent, { p_kind: 'api_error', p_route: 'auth', p_duration_ms: null });
});
