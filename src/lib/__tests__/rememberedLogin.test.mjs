import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRememberedLoginStore, loginIdentity, parseRememberedLogin } from '../rememberedLogin.ts';

function memory() {
  const values = new Map();
  return { values, getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
}
test('family identity includes its scope; legacy email access stays compatible', () => {
  assert.deepEqual(loginIdentity('ANA@tudodefamilia.com', 'famabcd2345'), {version:1,mode:'family',familyCode:'FAM-ABCD-2345',username:'ana'});
  assert.deepEqual(loginIdentity(' ANA@tudodefamilia.com '), {version:1,mode:'email',email:'ana@tudodefamilia.com'});
  assert.equal(loginIdentity('ana', 'invalid'), null);
  assert.equal(loginIdentity('ana'), null);
  assert.equal(loginIdentity('internal@family.invalid'), null);
});
test('storage whitelists identifiers and rejects corrupt or obsolete records', async () => {
  const storage = memory(); const store = createRememberedLoginStore(storage);
  await store.save({...loginIdentity('ana','FAM-ABCD-2345'),password:'never-store-me',access_token:'never-store-me',ip:'10.0.0.1'});
  const raw = [...storage.values.values()][0];
  assert.equal(raw.includes('never-store-me'), false); assert.equal(raw.includes('10.0.0.1'), false);
  for (const value of ['{', '{}', '{"version":2,"mode":"email","email":"a@b.com"}', 'x'.repeat(513), '{"version":1,"mode":"family","familyCode":"invalid","username":"ana"}']) {
    assert.equal(parseRememberedLogin(value), null);
  }
});
test('one latest login per installation; same username cannot reuse another family', async () => {
  const a = createRememberedLoginStore(memory()); const b = createRememberedLoginStore(memory());
  await a.save(loginIdentity('ana', 'FAM-ABCD-2345'));
  assert.equal(await b.read(), null);
  await a.save(loginIdentity('ana', 'FAM-EFGH-6789'));
  assert.equal((await a.read()).familyCode, 'FAM-EFGH-6789');
  await a.save(loginIdentity('responsavel@example.com'));
  assert.deepEqual(await a.read(), {version:1,mode:'email',email:'responsavel@example.com'});
  await a.clear(); assert.equal(await a.read(), null);
});
test('forget is ordered after pending saves; a failed write does not block forgetting', async () => {
  const storage = memory(); let release;
  storage.setItem = async (key, value) => { await new Promise(resolve => {release=resolve;}); storage.values.set(key,value); };
  const store = createRememberedLoginStore(storage);
  const save = store.save(loginIdentity('ana','FAM-ABCD-2345'));
  await Promise.resolve();
  const clear = store.clear(); release(); await Promise.all([save, clear]);
  assert.equal(await store.read(), null);
  storage.setItem = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(store.save(loginIdentity('ana','FAM-ABCD-2345')));
  await store.clear(); assert.equal(await store.read(), null);
});
