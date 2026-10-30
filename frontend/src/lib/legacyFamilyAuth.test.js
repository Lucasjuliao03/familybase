import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signInExistingAccount,registerLegacyFamilyAccount,loadExistingFamilyProfile,canCompleteLegacyRegistration,confirmSignupCode,authFailure } from './legacyFamilyAuth.js';
import { legacyMemberEmail,updateLegacyMember } from './legacyFamilyMembers.js';
import { clearFamilyAssets,familyAssetUrl } from './familyAssets.js';

const form={ familyName:'Silva',profileType:'mae',name:'Ana Silva',email:'ana@example.com',password:'abc123',confirmPassword:'abc123',phone:'11999999999',dateOfBirth:'1990-10-11',avatarPreset:'menina2',accepted:true };
function fixture({ confirmed=true,session=true,profile={id:'owner',family_id:null,role:'parent',status:'active'},signupSession=false }={}) {
  const calls=[]; const user={ id:'owner',email:form.email,email_confirmed_at:confirmed?'2026-10-11':null,user_metadata:{} };
  const state={profile};
  const client={auth:{
    getSession:async()=>({data:{session:session?{user}:null}}),getUser:async()=>({data:{user}}),
    signInWithPassword:async body=>{calls.push(['login',body]);return{data:{user}};},
    signUp:async body=>{calls.push(['signup',body]);return{data:{user,session:signupSession?{user}:null}};},
    updateUser:async body=>{calls.push(['updateAuth',body]);user.user_metadata=body.data;return{};},
  },rpc:async(name,body)=>{calls.push(['rpc',name,body]);state.profile={id:'owner',family_id:'family',role:'parent',status:'active'};return{data:{family_id:'family'}};},
  from:table=>{const builder={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:state.profile}),
    update(body){calls.push(['updateProfile',table,body]);return this;},then(resolve,reject){return Promise.resolve({data:state.profile}).then(resolve,reject);}};return builder;},
  functions:{invoke:()=>{throw new Error('Undeployed endpoint must not be called');}},};
  return {client,calls,user,state};
}
test('existing child email login uses deployed Auth directly and preserves the password',async()=>{
  const {client,calls}=fixture();await signInExistingAccount(client,' MAISA@SAUDE.COM ',' a b c');
  assert.deepEqual(calls,[['login',{email:'maisa@saude.com',password:' a b c'}]]);
});
test('invalid credentials and network errors stay distinct, without retrying or mutating accounts',async()=>{
  const {client,calls}=fixture();client.auth.signInWithPassword=async()=>({error:{code:'invalid_credentials',message:'Invalid login credentials'}});
  await assert.rejects(()=>signInExistingAccount(client,form.email,'wrong'),e=>e.code==='invalid_credentials');
  client.auth.signInWithPassword=async()=>({error:{name:'AuthRetryableFetchError',message:'Network request failed'}});
  await assert.rejects(()=>signInExistingAccount(client,form.email,'abc123'),e=>e.code==='auth_network_error' && /conectar/.test(e.message));assert.equal(calls.length,0);
});
test('pending signup sends one password signup and does not create a family before confirmation',async()=>{
  const {client,calls}=fixture({session:false});const result=await registerLegacyFamilyAccount(client,form);
  assert.equal(result.status,'confirmation_required');assert.deepEqual(calls.map(c=>c[0]),['signup']);
  assert.equal(calls[0][1].password,'abc123');assert.equal(calls[0][1].options.data.password,undefined);assert.equal(calls[0][1].options.data.legacy_registration,true);
});
test('repeated confirmed signup never claims that another email was sent',async()=>{
  const {client,calls}=fixture({session:false});
  client.auth.signUp=async()=>({data:{user:{id:'obfuscated',identities:[]},session:null}});
  await assert.rejects(()=>registerLegacyFamilyAccount(client,form),e=>e.code==='signup_existing_account');
  assert.equal(calls.length,0);
});
test('real confirmation uses Supabase OTP and does not write a family for arbitrary numbers',async()=>{
  const calls=[];const user={id:'owner',email:form.email,email_confirmed_at:'2026-10-11'};
  const client={auth:{verifyOtp:async body=>{calls.push(body);return{data:{user,session:{user}}};}}};
  await assert.rejects(()=>confirmSignupCode(client,form.email,'anything'));assert.equal(calls.length,0);
  assert.equal((await confirmSignupCode(client,' ANA@EXAMPLE.COM ',' 482916 ')).id,'owner');
  assert.deepEqual(calls,[{email:form.email,token:'482916',type:'email'}]);
  client.auth.verifyOtp=async()=>({error:{code:'otp_expired',status:403}});
  await assert.rejects(()=>confirmSignupCode(client,form.email,'123456'),/inválido ou expirado/);
  client.auth.verifyOtp=async()=>({data:{user:{...user,email_confirmed_at:null},session:{user}}});
  await assert.rejects(()=>confirmSignupCode(client,form.email,'123456'),/Não foi possível confirmar/);
});
test('email delivery failures and quotas are explicit, without pretending delivery succeeded',()=>{
  assert.match(authFailure({code:'email_address_not_authorized',status:422}).message,/enviar a confirmação/);
  assert.match(authFailure({code:'over_email_send_rate_limit',status:429}).message,/limite de envio/);
});
test('signup with an immediate session creates family using only the deployed RPC signature',async()=>{
  const {client,calls}=fixture({session:false,signupSession:true});const result=await registerLegacyFamilyAccount(client,form);
  assert.equal(result.status,'registered');assert.equal(calls.find(c=>c[0]==='rpc')[1],'register_family_and_user');
  const payload=calls.find(c=>c[0]==='rpc')[2];assert.equal(payload.p_contact_email,form.email);assert.equal(payload.p_user_id,undefined);assert.equal(payload.p_family_id,undefined);
});
test('confirmed signup without a public profile recovers transactionally on first login',async()=>{
  const {client,calls,user}=fixture({profile:null});user.user_metadata={family_name:'Silva',name:'Ana Silva',profile_type:'mae',legacy_registration:true};
  const profile=await loadExistingFamilyProfile(client,'owner');assert.equal(profile.family_id,'family');assert.equal(calls.filter(c=>c[0]==='rpc').length,1);
});
test('existing child profile never calls registration and keeps its identity and family',async()=>{
  const profile={id:'child',family_id:'existing-family',role:'child',status:'active'};const {client,calls}=fixture({profile});
  assert.deepEqual(await loadExistingFamilyProfile(client,'child'),profile);assert.equal(calls.length,0);
});
test('an existing family cannot be overwritten or have its password changed from signup',async()=>{
  const {client,calls}=fixture({profile:{family_id:'existing-family',role:'parent'}});
  await assert.rejects(()=>registerLegacyFamilyAccount(client,form),/já tem conta/);assert.equal(calls.length,0);
});
test('legacy signup still validates consent, password length and confirmation',async()=>{
  const {client,calls}=fixture({session:false});
  for(const invalid of [{accepted:false},{password:'12345',confirmPassword:'12345'},{confirmPassword:'different'}]) await assert.rejects(()=>registerLegacyFamilyAccount(client,{...form,...invalid}));
  assert.equal(calls.length,0);assert.equal(canCompleteLegacyRegistration({family_name:'Silva',name:'Ana',profile_type:'mae',registration_flow:'conversation'}),false);
});
test('legacy member access preserves existing emails and generates globally unique Auth identifiers',()=>{
  assert.equal(legacyMemberEmail({email:' MAISA@SAUDE.COM '}),'maisa@saude.com');assert.equal(legacyMemberEmail({username:'ana'}),'ana@tudodefamilia.com');
  assert.throws(()=>legacyMemberEmail({username:'a'}));
});
test('member edits cannot submit family, role, id or login changes',async()=>{
  const calls=[];const builder={update(body){calls.push(['payload',body]);return this;},eq(...args){calls.push(args);return this;},select(){return this;},single:async()=>({data:{id:'member'}})};
  await updateLegacyMember({from:()=>builder},'own-family','member',{name:'Ana',family_id:'foreign',id:'foreign',role:'master',email:'changed@example.com',username:'changed'},'parent');
  assert.deepEqual(calls[0][1],{name:'Ana'});assert.ok(calls.some(c=>c[0]==='family_id' && c[1]==='own-family'));
});
test('public family images keep working without signed URL cache; uploads stay private',()=>{
  clearFamilyAssets();const url='https://project.supabase.co/storage/v1/object/public/avatars/family/avatar.png';
  assert.equal(familyAssetUrl(url),url);assert.equal(familyAssetUrl('avatars/family/avatar.png','https://project.supabase.co'),url);
  assert.equal(familyAssetUrl('uploads/family/private.pdf','https://project.supabase.co'),'');
});
test('web and native share the deployed auth and member contracts',()=>{
  for(const name of ['legacyFamilyAuth.js','legacyFamilyMembers.js']) assert.equal(fs.readFileSync(new URL(name,import.meta.url),'utf8'),fs.readFileSync(new URL('../../../mobile/src/lib/'+name,import.meta.url),'utf8'));
});
