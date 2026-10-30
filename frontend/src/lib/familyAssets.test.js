import test from 'node:test';
import assert from 'node:assert/strict';
import { clearFamilyAssets, familyAssetUrl, warmFamilyAssets, warmFamilyProfileAssets } from './familyAssets.js';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture({ read, sign } = {}) {
  const calls = [];
  const client = {
    from: () => ({ select: () => ({ eq: () => read ? read.promise : Promise.resolve({ data: [{ avatar_url: 'avatars/family/avatar.png' }] }) }) }),
    storage: { from: bucket => ({ createSignedUrls: async names => {
      calls.push({ bucket, names });
      return sign ? sign.promise : { data: names.map(path => ({ path, signedUrl: 'https://signed.example/' + path })) };
    } }) },
  };
  return { client, calls };
}

test('profile reads finishing after an account change cannot populate the new image cache', async () => {
  clearFamilyAssets();
  const read = deferred(), { client, calls } = fixture({ read });
  const work = warmFamilyProfileAssets(client, 'old-family', { logo_url: 'family-images/old-family/logo.png' });
  clearFamilyAssets();
  read.resolve({ data: [{ avatar_url: 'avatars/old-family/avatar.png' }] });
  await work;
  assert.equal(calls.length, 0);
  assert.equal(familyAssetUrl('avatars/old-family/avatar.png'), '');
});

test('a signing response cannot restore URLs after logout', async () => {
  clearFamilyAssets();
  const sign = deferred(), { client } = fixture({ sign });
  const work = warmFamilyAssets(client, ['avatars/family/avatar.png']);
  clearFamilyAssets();
  sign.resolve({ data: [{ path: 'family/avatar.png', signedUrl: 'https://signed.example/old-session' }] });
  await work;
  assert.equal(familyAssetUrl('avatars/family/avatar.png'), '');
});

test('signing batches distinct paths by bucket and reuses a valid memory entry', async () => {
  clearFamilyAssets();
  const { client, calls } = fixture();
  const values = ['avatars/family/avatar.png', 'avatars/family/avatar.png', 'family-images/family/logo.png'];
  await warmFamilyAssets(client, values);
  await warmFamilyAssets(client, values);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].names, ['family/avatar.png']);
  assert.equal(familyAssetUrl(values[0]), 'https://signed.example/family/avatar.png');
  clearFamilyAssets();
});
test('equivalent concurrent signing requests share one network call', async () => {
  clearFamilyAssets();
  const sign = deferred(), { client, calls } = fixture({ sign });
  const work = Array.from({ length: 10 }, () => warmFamilyAssets(client, ['avatars/family/avatar.png']));
  sign.resolve({ data: [{ path: 'family/avatar.png', signedUrl: 'https://signed.example/concurrent' }] });
  await Promise.all(work);
  assert.equal(calls.length, 1);
  assert.equal(familyAssetUrl('avatars/family/avatar.png'), 'https://signed.example/concurrent');
  clearFamilyAssets();
});

test('failed signing remains retryable; force and expiration request fresh URLs', async () => {
  clearFamilyAssets();
  const { client, calls } = fixture();
  let attempt = 0;
  client.storage.from = bucket => ({ createSignedUrls: async names => {
    calls.push({ bucket, names });
    return ++attempt === 1 ? { error: { message: 'offline' } } : { data: names.map(path => ({ path, signedUrl: 'https://signed.example/' + attempt })) };
  } });
  const values = ['avatars/family/avatar.png'];
  await warmFamilyAssets(client, values);
  assert.equal(familyAssetUrl(values[0]), '');
  await warmFamilyAssets(client, values);
  assert.equal(calls.length, 2);
  await warmFamilyAssets(client, values, true);
  assert.equal(calls.length, 3);
  const now = Date.now;
  try {
    Date.now = () => now() + 26 * 60_000;
    await warmFamilyAssets(client, values);
    assert.equal(calls.length, 4);
  } finally { Date.now = now; clearFamilyAssets(); }
});

test('different clients never share an in-flight authorization request', async () => {
  clearFamilyAssets();
  const sign = deferred(), first = fixture({ sign }), second = fixture({ sign });
  const work = [first, second].map(f => warmFamilyAssets(f.client, ['avatars/family/avatar.png']));
  sign.resolve({ data: [] });
  await Promise.all(work);
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 1);
  clearFamilyAssets();
});
