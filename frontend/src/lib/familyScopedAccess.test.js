import test from 'node:test';
import assert from 'node:assert/strict';
import { signInExistingAccount } from './legacyFamilyAuth.js';
import { provisionScopedMember } from './legacyFamilyMembers.js';
import { buildFamilyAccessMessage } from './familyAccessMessage.js';
import { normalizeFamilyCode } from './familyIdentity.js';

test('formatted, spaced and bare codes normalize even when the random code starts with FAM',()=>{
 assert.equal(normalizeFamilyCode('FAMABCDE'),'FAM-FAMA-BCDE');
 assert.equal(normalizeFamilyCode(' fam fama bcde '),'FAM-FAMA-BCDE');
 assert.equal(normalizeFamilyCode('FAM-ABCD-EFGH'),'FAM-ABCD-EFGH');
 assert.equal(normalizeFamilyCode('FAM-ABCD-EF0I'),'');
});

test('scoped login resolves the chosen family, obtains real Auth tokens and keeps legacy email login',async()=>{
 const calls=[];
 const client={
  functions:{invoke:async(name,{body})=>{calls.push({name,body});return {data:{session:{access_token:'fixture-access',refresh_token:'fixture-refresh'}}};}},
  auth:{
   setSession:async session=>{calls.push({session});return {data:{user:{id:'child-a'}}};},
   signInWithPassword:async args=>{calls.push({legacy:args});return {data:{user:{id:'legacy-child'}}};}
  }
 };
 await signInExistingAccount(client,' ANA ','six-six','fam abcd efgh');
 assert.deepEqual(calls[0],{name:'family-login',body:{family_code:'FAM-ABCD-EFGH',username:'ana',password:'six-six'}});
 assert.equal(calls[1].session.access_token,'fixture-access');
 await signInExistingAccount(client,'Ana@tudodefamilia.com','original');
 assert.deepEqual(calls[2],{legacy:{email:'ana@tudodefamilia.com',password:'original'}});
});
test('empty family code never falls through into a global email login',async()=>{
 await assert.rejects(signInExistingAccount({},'ana','six-six',''),/código da família/i);
});
test('wrong scoped credentials reject without creating a session or changing a password',async()=>{
 const client={functions:{invoke:async()=>({error:{context:new Response(JSON.stringify({error:'Código da família, login ou senha incorretos.'}),{status:401})}})},auth:{setSession:()=>{throw new Error('must not run');}}};
 await assert.rejects(signInExistingAccount(client,'ana','wrong','FAM-ABCD-EFGH'),error=>error.code==='invalid_credentials');
});
test('atomic member creation uses server identifiers and never sends a chosen family/id/role master',async()=>{
 let sent;const client={functions:{invoke:async(name,{body})=>{sent={name,body};return {data:{user:{id:'user-uuid',username:'ana',email:null},child:{id:'child-uuid',name:'Ana'},family_code:'FAM-ABCD-EFGH',family_name:'Silva'}};}}};
 const result=await provisionScopedMember(client,{username:'Ana',name:'Ana',password:'six-six',request_id:'request',family_id:'foreign',user_id:'foreign',role:'master'},'child');
 assert.equal(sent.body.family_id,undefined);assert.equal(sent.body.user_id,undefined);assert.equal(sent.body.role,'child');
 assert.equal(result.id,'child-uuid');assert.equal(result.username,'ana');assert.equal(result.family_code,'FAM-ABCD-EFGH');assert.equal(result.password,undefined);
});
test('WhatsApp draft includes real family/user fields and excludes secret and internal identity',()=>{
 const message=buildFamilyAccessMessage({name:'Ana\n*Admin*',familyName:'Silva',familyCode:'fam abcd efgh',username:'ANA',password:'never-share-this-secret',auth_identity:'private@acesso.tudodefamilia.com'});
 assert.ok(message.includes('FAM-ABCD-EFGH'));assert.ok(message.includes('*Usuário:* ana'));
 assert.ok(!message.includes('never-share-this-secret'));assert.ok(!message.includes('private@acesso'));assert.ok(!message.includes('\n*Admin*'));
 assert.throws(()=>buildFamilyAccessMessage({username:'ana'}),/dados de acesso/);
});
