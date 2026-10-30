import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { fetchNoStoreWithDeadline } from './fetchWithDeadline.js';

test('completed requests release all listeners from a shared parent signal', async () => {
  const original = globalThis.fetch, parent = new AbortController();
  try {
    globalThis.fetch = async () => new Response('ok');
    await Promise.all(Array.from({ length: 8 }, () => fetchNoStoreWithDeadline('https://example.invalid', { signal: parent.signal, deadlineMs: 0 })));
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
  } finally { globalThis.fetch = original; }
});

test('network rejection releases the parent listener and never retries a POST', async () => {
  const original = globalThis.fetch, parent = new AbortController();
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new TypeError('offline'); };
    await assert.rejects(fetchNoStoreWithDeadline('https://example.invalid', { signal: parent.signal, method: 'POST', body: '{}', deadlineMs: 100 }), /offline/);
    assert.equal(calls, 1);
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
  } finally { globalThis.fetch = original; }
});

test('a synchronous fetch failure releases its listener and timer', () => {
  const original = globalThis.fetch, clear = globalThis.clearTimeout, parent = new AbortController();
  let cleared = 0;
  try {
    globalThis.clearTimeout = timer => { cleared++; return clear(timer); };
    globalThis.fetch = () => { throw new TypeError('invalid request'); };
    assert.throws(() => fetchNoStoreWithDeadline('invalid', { signal: parent.signal, deadlineMs: 100 }), /invalid request/);
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
    assert.equal(cleared, 1);
  } finally { globalThis.fetch = original; globalThis.clearTimeout = clear; parent.abort(); }
});

test('the parent abort reason reaches the actual request', async () => {
  const original = globalThis.fetch, parent = new AbortController();
  const reason = new DOMException('cancelled by caller', 'AbortError');
  try {
    globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const work = fetchNoStoreWithDeadline('https://example.invalid', { signal: parent.signal, deadlineMs: 100 });
    parent.abort(reason);
    await assert.rejects(work, error => error === reason);
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
  } finally { globalThis.fetch = original; }
});

test('the deadline aborts one stalled request', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (_url, { signal }) => { calls++; return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }); };
    await assert.rejects(fetchNoStoreWithDeadline('https://example.invalid', { deadlineMs: 10 }), { name: 'AbortError' });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('an already aborted signal is forwarded and caller options are preserved', async () => {
  const original = globalThis.fetch, parent = new AbortController();
  parent.abort();
  const options = { signal: parent.signal, cache: 'force-cache', deadlineMs: 100 };
  try {
    globalThis.fetch = async (_url, actual) => {
      assert.equal(actual.signal.aborted, true);
      assert.equal(actual.cache, 'force-cache');
      throw actual.signal.reason;
    };
    await assert.rejects(fetchNoStoreWithDeadline('https://example.invalid', options), { name: 'AbortError' });
    assert.equal(options.signal, parent.signal);
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
  } finally { globalThis.fetch = original; }
});
