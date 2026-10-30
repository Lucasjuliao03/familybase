import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { avatarKind,formField,saveFamilyAvatar,saveAvatarPhoto } from './familyAvatar.js';
import { ADULT_AVATAR_IDS,CHILD_AVATAR_IDS } from './familyIdentity.js';
import { getAvatarPresetUrl } from './avatarCatalog.js';

test('parent editing child receives the child catalog for both route formats',()=>{
  assert.equal(avatarKind('/auth/avatar/child/child-id','parent'),'child');
  assert.equal(avatarKind('/families/children/child-id','parent'),'child');
  assert.equal(avatarKind('/auth/avatar','child'),'child');
  assert.equal(avatarKind('/families/members/member-id/avatar','parent'),'adult');
});
test('native FormData without get, web FormData and JSON all resolve presets',()=>{
  const native={getAll:key=>key==='avatar_preset' ? ['bia']:[]};
  assert.equal(formField(native,'avatar_preset'),'bia');
  const web=new FormData();web.append('avatar_preset','homem1');
  assert.equal(formField(web,'avatar_preset'),'homem1');assert.equal(formField({avatar_preset:'caio'},'avatar_preset'),'caio');
  assert.equal(formField(native,'avatar'),null);
});
test('avatar RPC receives only the target; family and identity derive from session',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return{data:{id:'child-a',avatar_preset:'bia',avatar_url:null}};}};
  const saved=await saveFamilyAvatar(client,{familyId:'family-a',childId:'child-a',presetId:'bia',kind:'child'});
  assert.equal(saved.avatar_preset,'bia');assert.deepEqual(calls,[['update_family_avatar',{p_avatar_preset:'bia',p_child_id:'child-a',p_member_id:null}]]);
});
test('permission and network errors never trigger direct-write fallback',async()=>{
  for(const code of ['42501','PGRST301','network_error']) {
    const client={rpc:async()=>({error:{code,message:'denied'}}),from:()=>{throw new Error('unexpected fallback');}};
    await assert.rejects(()=>saveFamilyAvatar(client,{familyId:'a',memberId:'parent-a',presetId:'homem1'}),/denied/);
  }
});
test('invalid avatar never reaches database and unconfirmed save is rejected',async()=>{
  const client={rpc:async()=>({data:{avatar_preset:'other'}})};
  await assert.rejects(()=>saveFamilyAvatar(client,{familyId:'a',memberId:'parent-a',presetId:'bia'}),/válido/);
  await assert.rejects(()=>saveFamilyAvatar(client,{familyId:'a',memberId:'parent-a',presetId:'homem1'}),/confirmado/);
});
test('missing RPC falls back with explicit family filters and rejects zero saved rows',async()=>{
  const calls=[];const builder={update(body){calls.push(['update',body]);return this;},eq(key,value){calls.push(['eq',key,value]);return this;},select(){return this;},single:async()=>({data:null,error:null})};
  const client={rpc:async()=>({error:{code:'PGRST202'}}),from:()=>builder};
  await assert.rejects(()=>saveFamilyAvatar(client,{familyId:'a',memberId:'parent-a',presetId:'homem1'}),/salvar/);
  assert.ok(calls.some(c=>c[0]==='eq' && c[1]==='family_id' && c[2]==='a'));
});
test('failed photo update is surfaced, instead of reporting success',async()=>{
  const builder={update(){return this;},eq(){return this;},select(){return this;},single:async()=>({error:{message:'RLS denied'}})};
  await assert.rejects(()=>saveAvatarPhoto({from:()=>builder},{familyId:'a',memberId:'p',avatarUrl:'avatars/a/photo.png'}),/RLS denied/);
});
test('entire native and web catalogs have files with exact production casing',()=>{
  const mobile=new URL('../../../mobile/icon/avatar/',import.meta.url);
  const available=fs.readdirSync(mobile);
  for(const id of [...ADULT_AVATAR_IDS,...CHILD_AVATAR_IDS]) {
    const file = /^mae[1-4]$|^pai[1-4]$/.test(id) ? id+'.webp' : id+'.png';
    assert.ok(available.includes(file),id+' native asset');
    const base=new URL('../../public'+getAvatarPresetUrl(id).substring(0,getAvatarPresetUrl(id).lastIndexOf('/')+1),import.meta.url);
    assert.ok(fs.readdirSync(base).includes(file),id+' web asset');
  }
  assert.equal(fs.readFileSync(new URL('familyAvatar.js',import.meta.url),'utf8'),fs.readFileSync(new URL('../../../mobile/src/lib/familyAvatar.js',import.meta.url),'utf8'));
});
