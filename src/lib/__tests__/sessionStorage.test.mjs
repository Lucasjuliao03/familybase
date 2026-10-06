import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStorage } from '../sessionStorage.ts';

test('SSR does not access browser storage or retain sessions across requests', async () => {
  const unavailable = async () => { throw new Error('window is not defined'); };
  const storage = sessionStorage({ getItem: unavailable, setItem: unavailable, removeItem: unavailable }, true);
  await storage.setItem('session', 'secret');
  assert.equal(await storage.getItem('session'), null);
  await storage.removeItem('session');
});

test('native and browser sessions persist and can be removed', async () => {
  const data = new Map();
  const storage = sessionStorage({
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); },
  }, false);
  await storage.setItem('session', 'test-session');
  assert.equal(await storage.getItem('session'), 'test-session');
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
});
