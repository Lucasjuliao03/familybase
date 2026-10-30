import test from 'node:test';
import assert from 'node:assert/strict';
import * as web from './rewardStore.js';
import * as mobile from '../../../mobile/src/lib/rewardStore.js';

for (const [platform, store] of [['web', web], ['mobile', mobile]]) {
  test(`${platform}: preserva preço e nome do pedido após editar ou remover o prêmio`, () => {
    const row = store.mapRedemptionListRow({ point_cost: 60, reward_name: 'Sorvete', reward_icon: '🍦', rewards: { point_cost: 90, name: 'Outro', icon: '🎮' }, children: [{ name: 'Filho' }] });
    assert.equal(row.point_cost, 60);
    assert.equal(row.reward_name, 'Sorvete');
    assert.equal(row.reward_icon, '🍦');
    assert.equal(row.icon, '🍦');
    assert.equal(row.child_name, 'Filho');
    assert.equal(store.mapRedemptionListRow({ ...row, rewards: null }).point_cost, 60);
  });
  test(`${platform}: aceita pontos zero e rejeita custos inválidos sem arredondar`, () => {
    assert.equal(store.buildRewardPayload({ name: ' Grátis ', point_cost: 0 }).point_cost, 0);
    for (const cost of ['', ' ', null, false, [], {}, '12abc', 1.5, -1, Infinity, 2147483648]) {
      assert.throws(() => store.buildRewardPayload({ name: 'Prêmio', point_cost: cost }));
    }
    assert.throws(() => store.buildRewardPayload({ name: '  ', point_cost: 10 }));
  });
  test(`${platform}: grava apenas os campos editáveis e normaliza os booleanos antigos`, () => {
    const payload = store.buildRewardPayload({ id: null, family_id: 'outra', created_at: 'alterado', name: '  Prêmio  ', point_cost: '25', is_active: 0 });
    assert.deepEqual(payload, { name: 'Prêmio', point_cost: 25, is_active: false, available: false });
    assert.equal(store.buildRewardPayload({ name: 'Prêmio', point_cost: 10, is_active: true }).is_active, true);
  });
  test(`${platform}: filhos só veem prêmios ativos e disponíveis`, () => {
    assert.equal(store.isRewardAvailable({ is_active: true, available: true }), true);
    for (const value of [false, 0, '0', 'false']) {
      assert.equal(store.isRewardAvailable({ is_active: value }), false);
      assert.equal(store.isRewardAvailable({ available: value }), false);
    }
    assert.equal(store.isRewardAvailable({ deleted_at: '2026-10-11T00:00:00Z' }), false);
  });
  test(`${platform}: normaliza pedidos antigos sem transformar custo ausente em grátis`, () => {
    assert.equal(store.mapRedemptionListRow({ rewards: [{ name: 'Grátis', point_cost: 0 }] }).point_cost, 0);
    assert.equal(store.mapRedemptionListRow({ rewards: null }).point_cost, null);
    assert.equal(store.mapRedemptionListRow({ point_cost: 'inválido' }).point_cost, null);
    assert.equal(store.mapRedemptionListRow({ point_cost: '12', reward_name: 'Prêmio' }).reward_point_cost, 12);
  });
}
