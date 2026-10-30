import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { birthAge,normalizePhone,normalizeFamilyCode,normalizeUsername,registrationErrors,PASSWORD_MIN } from './familyIdentity.js';
import { safeRegistrationDraft,restoreRegistrationDraft,validateSimulationCode,REGISTRATION_STEPS } from './familyRegistration.js';
import { requestRegistrationEmail,verifyRegistrationEmail,setRegistrationPassword,registerFamilyAccount,signInFamilyAccount } from './familyAuth.js';

const form={ familyName:'Silva',profileType:'mae',name:'Ana Silva',email:' ANA@EXAMPLE.COM ',password:'abc123',confirmPassword:'abc123',phone:'(11) 99999-9999',dateOfBirth:'1990-10-12',avatarPreset:'menina2',accepted:true };
function fixture(overrides={}) {
  const calls=[]; const user={ id:'verified-parent',email:'ana@example.com',email_confirmed_at:'2026-10-11',user_metadata:{} };
  const client={ auth:{
    getSession:async()=>({ data:{ session:{ user } } }),getUser:async()=>({ data:{ user } }),
    signInWithOtp:async body=>{ calls.push(['otp',body]); return {}; },
    verifyOtp:async body=>{ calls.push(['verify',body]); return { data:{ user } }; },
    updateUser:async body=>{ calls.push(['update',body]); return {}; },
    setSession:async session=>({ data:{ user,session } }),
    signInWithPassword:async body=>{ calls.push(['login',body]); return { data:{ user } }; },
  }, from:()=>({ select:()=>({ eq:()=>({ maybeSingle:async()=>({ data:{ family_id:null,role:'parent' } }) }) }) }),
    rpc:async (name,body)=>{ calls.push(['rpc',name,body]); return { data:{ family_id:'family-uuid',family_code:'FAM-2345-ABCD' } }; },
    functions:{ invoke:async (name,body)=>{ calls.push(['edge',name,body]); return { data:{ session:{ access_token:'fixture',refresh_token:'fixture' } } }; } },
  };
  Object.assign(client.auth,overrides); return { client,calls,user };
}
test('six characters pass; five and mismatched confirmation fail',()=>{
  assert.equal(PASSWORD_MIN,6); assert.deepEqual(registrationErrors(form),{});
  assert.ok(registrationErrors({ ...form,password:'12345',confirmPassword:'12345' }).password);
  assert.ok(registrationErrors({ ...form,confirmPassword:'abcdef' }).confirmPassword);
});
test('local birthday validates calendar, adulthood boundary, future and leap day',()=>{
  const now=new Date(2026,9,11,12); assert.equal(birthAge('2008-10-11',now),18); assert.equal(birthAge('2008-10-12',now),17);
  assert.equal(birthAge('2027-01-01',now),null); assert.equal(birthAge('2001-02-29',now),null); assert.equal(birthAge('2000-02-29',now),26);
});
test('normalize contact and family context without interpreting virtual login as email',()=>{
  assert.equal(normalizePhone(form.phone),'+5511999999999'); assert.equal(normalizePhone('(20) 99999-9999'),'');
  assert.equal(normalizeFamilyCode('fam2345abcd'),'FAM-2345-ABCD'); assert.equal(normalizeFamilyCode('1234'),'');
  assert.equal(normalizeUsername('Ana@tudodefamilia.com'),'ana'); assert.equal(normalizeUsername('ana@example.com'),'');
});
test('adult registration rejects child avatar and underage responsible',()=>{
  assert.ok(registrationErrors({ ...form,avatarPreset:'bia' }).avatarPreset);
  assert.ok(registrationErrors({ ...form,dateOfBirth:'2010-10-11' },new Date(2026,9,11,12)).dateOfBirth);
});
test('draft never persists password or confirmation and expires after one day',()=>{
  const draft=safeRegistrationDraft(form,5); assert.equal(draft.data.password,undefined); assert.equal(draft.data.confirmPassword,undefined);
  assert.equal(restoreRegistrationDraft(draft).form.password,''); assert.equal(restoreRegistrationDraft({ ...draft,updatedAt:Date.now()-25*3600000 }),null);
  assert.equal(restoreRegistrationDraft({ ...draft,step:3.8 }).step,3);
});
test('conversation order and isolated simulation accept any numeric code',()=>{
  assert.deepEqual(REGISTRATION_STEPS.map(s=>s.id),['profileType','name','email','verification','password','phone','dateOfBirth','avatarPreset','familyName','terms']);
  for(const code of ['1','0000','234567']) assert.doesNotThrow(()=>validateSimulationCode(code));
  assert.throws(()=>validateSimulationCode('')); assert.throws(()=>validateSimulationCode('abc'));
});
test('request sends OTP without password or family creation',async()=>{
  const { client,calls }=fixture(); await requestRegistrationEmail(client,form);
  assert.deepEqual(calls.map(c=>c[0]),['otp']); assert.equal(calls[0][1].email,'ana@example.com');
  assert.equal(calls[0][1].password,undefined); assert.equal(calls[0][1].options.data.registration_version,undefined);
});
test('real verification rejects arbitrary numeric code when provider rejects it',async()=>{
  const { client,calls }=fixture({ verifyOtp:async()=>({ error:{},data:{} }) });
  await assert.rejects(()=>verifyRegistrationEmail(client,form.email,'111111'),/inválido/); assert.equal(calls.length,0);
});
test('verified account with existing family cannot have password replaced by signup wizard',async()=>{
  const { client,calls }=fixture(); client.from=()=>({ select:()=>({ eq:()=>({ maybeSingle:async()=>({ data:{ family_id:'existing',role:'parent' } }) }) }) });
  await assert.rejects(()=>setRegistrationPassword(client,form.email,form.password,form.confirmPassword),/já tem conta/); assert.equal(calls.length,0);
});
test('password requires verified ownership and preserves spaces exactly',async()=>{
  const { client,calls,user }=fixture(); await setRegistrationPassword(client,form.email,' a b c',' a b c');
  assert.equal(calls[0][1].password,' a b c'); user.email_confirmed_at=null;
  await assert.rejects(()=>setRegistrationPassword(client,form.email,form.password,form.confirmPassword),/Confirme/);
});
test('family completion is a single RPC after valid fields and accepted terms',async()=>{
  const { client,calls }=fixture(); await assert.rejects(()=>registerFamilyAccount(client,{ ...form,accepted:false }),/Aceite/);
  assert.equal(calls.length,0); const result=await registerFamilyAccount(client,form);
  assert.equal(result.status,'registered'); assert.equal(result.family_code,'FAM-2345-ABCD');
  assert.deepEqual(calls.map(c=>c[0]),['update','rpc']); assert.equal(calls[0][1].data.terms_accepted,true);
  assert.equal(calls[1][2].p_family_id,undefined); assert.equal(calls[1][2].p_user_id,undefined);
});
test('virtual family login verifies password via server and never exposes identity resolver',async()=>{
  const { client,calls }=fixture(); await signInFamilyAccount(client,'ana@tudodefamilia.com','abc123','fam2345abcd');
  assert.equal(calls[0][1],'family-login'); assert.equal(calls[0][2].body.username,'ana'); assert.equal(calls[0][2].body.password,'abc123');
});
test('web and mobile use identical validation, auth and flow contracts',()=>{
  for(const name of ['familyIdentity.js','familyAuth.js','familyRegistration.js','familyAssets.js']) assert.equal(fs.readFileSync(new URL(name,import.meta.url),'utf8'),fs.readFileSync(new URL('../../../mobile/src/lib/'+name,import.meta.url),'utf8'));
});
