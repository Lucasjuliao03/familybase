import test from 'node:test';
import assert from 'node:assert/strict';
import { createPwaInstallationStore } from './pwaInstallation.js';

function platform(matches = false, standalone = false) {
  const handlers = new Set();
  const media = {
    matches,
    addEventListener: (type, handler) => { assert.equal(type, 'change'); handlers.add(handler); },
    removeEventListener: (type, handler) => { assert.equal(type, 'change'); handlers.delete(handler); },
  };
  return {
    browser: { navigator: { standalone }, matchMedia: query => { assert.equal(query, '(display-mode: standalone)'); return media; } },
    emit(value) { media.matches = value; for (const handler of handlers) handler({ matches: value }); },
    listenerCount: () => handlers.size,
  };
}

test('initial state and first browser sample match the existing installation lifecycle', () => {
  const host = platform(true);
  const store = createPwaInstallationStore(host.browser);
  assert.equal(store.getSnapshot(), false);
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  assert.equal(store.getSnapshot(), true);
  assert.equal(notifications, 1);
  stop();
  assert.equal(host.listenerCount(), 0);
});

test('iOS standalone is used initially and later media events keep their original precedence', () => {
  const host = platform(false, true);
  const store = createPwaInstallationStore(host.browser);
  const stop = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), true);
  host.emit(false);
  assert.equal(store.getSnapshot(), false);
  stop();
});

test('manual acceptance is immediate, deduplicated, and can be superseded by a media change', () => {
  const host = platform();
  const store = createPwaInstallationStore(host.browser);
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  store.setInstalled(true);
  store.setInstalled(true);
  assert.equal(store.getSnapshot(), true);
  assert.equal(notifications, 1);
  host.emit(false);
  assert.equal(store.getSnapshot(), false);
  assert.equal(notifications, 2);
  stop();
});

test('subscribers share one media listener and the final cleanup removes it', () => {
  const host = platform();
  const store = createPwaInstallationStore(host.browser);
  const stopA = store.subscribe(() => {});
  const stopB = store.subscribe(() => {});
  assert.equal(host.listenerCount(), 1);
  stopA();
  assert.equal(host.listenerCount(), 1);
  stopB();
  assert.equal(host.listenerCount(), 0);
});

test('resubscription samples the current browser state after an inactive interval', () => {
  const host = platform();
  const store = createPwaInstallationStore(host.browser);
  const stop = store.subscribe(() => {});
  stop();
  host.emit(true);
  assert.equal(store.getSnapshot(), false);
  const stopAgain = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), true);
  stopAgain();
});

test('separate providers do not share manual installation state', () => {
  const host = platform();
  const first = createPwaInstallationStore(host.browser);
  const second = createPwaInstallationStore(host.browser);
  const stopA = first.subscribe(() => {});
  const stopB = second.subscribe(() => {});
  first.setInstalled(true);
  assert.equal(first.getSnapshot(), true);
  assert.equal(second.getSnapshot(), false);
  stopA();
  stopB();
  assert.equal(host.listenerCount(), 0);
});

test('a subscription created during notification is not called again in the same emission', () => {
  const host = platform();
  const store = createPwaInstallationStore(host.browser);
  let first = 0, second = 0, stopB;
  const stopA = store.subscribe(() => {
    first++;
    stopB ??= store.subscribe(() => second++);
  });
  host.emit(true);
  assert.equal(first, 1);
  assert.equal(second, 0);
  host.emit(false);
  assert.equal(first, 2);
  assert.equal(second, 1);
  stopA();
  stopB();
  assert.equal(host.listenerCount(), 0);
});
