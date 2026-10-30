import test from 'node:test';
import assert from 'node:assert/strict';
import { hasProdPwaUpdate, subscribeToProdPwaUpdate, markProdPwaUpdateAvailable, setApplyProdPwaUpdate, applyProdPwaUpdate } from './pwaUpdate.js';

test('an update detected before lazy app mount remains available to its later subscriber', async () => {
  markProdPwaUpdateAvailable();
  assert.equal(hasProdPwaUpdate(), true);
  let changes = 0;
  const unsubscribe = subscribeToProdPwaUpdate(() => { changes++; });
  setApplyProdPwaUpdate(async () => { throw new Error('update failed'); });
  await assert.rejects(applyProdPwaUpdate);
  assert.equal(hasProdPwaUpdate(), true);
  setApplyProdPwaUpdate(async () => {});
  await applyProdPwaUpdate();
  assert.equal(hasProdPwaUpdate(), false);
  assert.equal(changes, 1);
  unsubscribe();
});
