import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFamilyAccessMembers, scopedAccessMembers } from '../familyAccess.ts';
import { buildFamilyAccessMessage } from '../familyAccessMessage.js';
const row = {id:'child-a',family_id:'family-a',role:'child',name:'Ana',username:'ana',status:'active'};

test('profile messages exclude other families, inactive and unprovisioned users', () => {
  const members = scopedAccessMembers([row,{...row,id:'child-b',family_id:'family-b'}, {...row,status:'inactive'}, {...row,username:null}, {...row,role:'master'}], 'family-a');
  assert.deepEqual(members, [{id:'child-a',family_id:'family-a',role:'child',name:'Ana',username:'ana'}]);
  const draft = buildFamilyAccessMessage({...members[0],familyName:'Minha família',familyCode:'FAM-ABCD-2345',password:'SENSITIVE',email:'internal@family.invalid'});
  assert.equal(draft.includes('SENSITIVE'),false); assert.equal(draft.includes('internal@'),false);
  assert.ok(draft.includes('FAM-ABCD-2345')); assert.ok(draft.includes('*Usuário:* ana'));
});
test('query is scoped and minimal, surfaces failures instead of an empty success', async () => {
  const calls = []; let result = {data:[row],error:null};
  const query = {select(value){calls.push(['select',value]);return this;},eq(...args){calls.push(['eq',...args]);return this;},in(...args){calls.push(['in',...args]);return this;},order(){return Promise.resolve(result);}};
  const client = {from(table){calls.push(['from',table]);return query;}};
  assert.equal((await loadFamilyAccessMembers(client,'family-a','FAM-ABCD-2345')).length,1);
  assert.ok(calls.some(call => JSON.stringify(call) === '["eq","family_id","family-a"]'));
  assert.ok(!calls.find(call=>call[0]==='select')[1].includes('email'));
  result = {data:null,error:{message:'denied'}};
  await assert.rejects(loadFamilyAccessMembers(client,'family-a','FAM-ABCD-2345'),/Tente novamente/);
  await assert.rejects(loadFamilyAccessMembers(client,'family-a','invalid'));
});
