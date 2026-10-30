import { birthAge, normalizeEmail, normalizeUsername } from './familyIdentity.js';

export function legacyMemberEmail(body) {
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email || (username ? username+'@tudodefamilia.com' : ''));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail de acesso válido.');
  return email;
}
const pick = (body,keys) => Object.fromEntries(keys.filter(key=>body[key]!==undefined).map(key=>[key,body[key]]));

export async function provisionScopedMember(client, body, role) {
  const username=normalizeUsername(body.username);
  if (!username) throw new Error('Use um usuário de 3 a 32 caracteres.');
  const {data,error}=await client.functions.invoke('create-family-member',{body:{...pick(body,['request_id','name','password','birthday','avatar_preset','mascot_id','nickname','phone','color','notes','relationship','emoji','display_color','access_profile','must_change_password','linked_child_ids','child_id']),username,email:role==='child'?undefined:normalizeEmail(body.email),role}});
  if (error || data?.error || !data?.user?.id || !data?.family_code || (role==='child' && !data.child?.id)) {
    let message=data?.error || 'Não foi possível concluir o acesso. Tente salvar novamente.';
    try { message=(await error.context.json()).error || message; } catch { /* no response body */ }
    throw new Error(message);
  }
  const member=role==='child'?data.child:data.user;
  return {...member,username:data.user.username,user_email:data.user.email,family_code:data.family_code,family_name:data.family_name};
}

async function updateLinks(client,familyId,userId,ids) {
  const requested = [...new Set(ids)];
  if(requested.length) {
    const { data,error }=await client.from('children').select('id').eq('family_id',familyId).in('id',requested);
    if(error || data.length!==requested.length) throw new Error('Selecione somente filhos desta família.');
  }
  const old=await client.from('relative_children').select('id,child_id').eq('family_id',familyId).eq('relative_user_id',userId);
  if(old.error) throw new Error(old.error.message);
  const additions=requested.filter(id=>!old.data.some(link=>link.child_id===id));
  if(additions.length) {
    const {error}=await client.from('relative_children').insert(additions.map(child_id=>({ family_id:familyId,relative_user_id:userId,child_id })));
    if(error) throw new Error(error.message);
  }
  const removed=old.data.filter(link=>!requested.includes(link.child_id)).map(link=>link.id);
  if(removed.length) {
    const {error}=await client.from('relative_children').delete().eq('family_id',familyId).eq('relative_user_id',userId).in('id',removed);
    if(error) throw new Error(error.message);
  }
}

export async function updateLegacyMember(client,familyId,id,body,role) {
  const payload=pick(body,['name','phone','emoji','display_color','relationship','avatar_preset']);
  if(body.birthday!==undefined) payload.date_of_birth=body.birthday || null;
  if(role==='parent' && body.access_profile!==undefined) {
    const current=await client.from('users').select('access_profile').eq('family_id',familyId).eq('id',id).eq('role',role).single();
    if(current.error) throw new Error(current.error.message);
    if(current.data.access_profile!==body.access_profile) {
      const changed=await client.rpc('update_member_access_profile',{p_member_id:id,p_access_profile:body.access_profile});
      if(changed.error) throw new Error(changed.error.message);
    }
  }
  const result=await client.from('users').update(payload).eq('family_id',familyId).eq('id',id).eq('role',role).select().single();
  if(result.error) throw new Error(result.error.message);
  if(role==='relative' && Array.isArray(body.linked_child_ids)) await updateLinks(client,familyId,id,body.linked_child_ids);
  return result.data;
}

async function provisionLegacyAccount(client,familyId,body,role) {
  const email=legacyMemberEmail(body);
  const existing=await client.from('users').select('id,email,name,role').eq('family_id',familyId).eq('email',email).maybeSingle();
  if(existing.error) throw new Error(existing.error.message);
  if(existing.data) {
    if(existing.data.role!==role || existing.data.name.trim()!==body.name.trim()) throw new Error('Este e-mail de acesso já está em uso. Escolha outro.');
    return existing.data;
  }
  const {data,error}=await client.functions.invoke('create-family-member',{body:{ email,password:body.password,name:body.name,role,access_profile:body.access_profile,must_change_password:!!body.must_change_password }});
  if(error || data?.error || !data?.user?.id) {
    let message=data?.error || 'Não foi possível criar o acesso. Tente novamente.';
    try {message=(await error.context.json()).error || message;} catch {/* provider response may not have JSON */}
    throw new Error(message);
  }
  return data.user;
}

export async function createLegacyMember(client,familyId,body,role) {
  if (body.request_id) return provisionScopedMember(client,body,role);
  const user=await provisionLegacyAccount(client,familyId,body,role);
  if(role!=='child') return updateLegacyMember(client,familyId,user.id,body,role);
  const existing=await client.from('children').select('*').eq('family_id',familyId).eq('user_id',user.id).maybeSingle();
  if(existing.error) throw new Error(existing.error.message);
  if(existing.data) return {...existing.data,user_email:user.email};
  const payload=pick(body,['name','nickname','birthday','avatar_preset','mascot_id','color','emoji','notes']);
  if(payload.birthday) payload.age=birthAge(payload.birthday);
  if(!payload.mascot_id) delete payload.mascot_id;
  if(!payload.birthday) delete payload.birthday;
  const result=await client.from('children').insert({...payload,family_id:familyId,user_id:user.id}).select().single();
  if(result.error) throw new Error('O acesso foi criado, mas falta concluir o perfil do filho. Tente salvar novamente: '+result.error.message);
  return {...result.data,user_email:user.email};
}

export async function updateLegacyChild(client,familyId,id,body) {
  const current=await client.from('children').select('*').eq('family_id',familyId).eq('id',id).maybeSingle();
  if(current.error || !current.data) throw new Error('Criança não encontrada nesta família.');
  let userId=current.data.user_id;
  if (!userId && body.password && body.request_id) return provisionScopedMember(client,{...body,child_id:id},'child');
  if(!userId && body.password) {
    const user=await provisionLegacyAccount(client,familyId,body,'child');
    const linked=await client.from('children').select('id').eq('family_id',familyId).eq('user_id',user.id).maybeSingle();
    if(linked.error || (linked.data && linked.data.id!==id)) throw new Error('Este acesso já está vinculado a outro filho.');
    userId=user.id;
  }
  const payload=pick(body,['name','nickname','birthday','avatar_preset','mascot_id','color','emoji','notes']);
  if(payload.birthday) payload.age=birthAge(payload.birthday);
  if(payload.mascot_id==='') payload.mascot_id=null;
  if(userId && !current.data.user_id) payload.user_id=userId;
  const result=await client.from('children').update(payload).eq('family_id',familyId).eq('id',id).select().single();
  if(result.error) throw new Error(result.error.message);
  if(userId) {
    const profile=pick(body,['name','avatar_preset']);
    if(body.birthday!==undefined) profile.date_of_birth=body.birthday || null;
    if(Object.keys(profile).length) {
      const {error}=await client.from('users').update(profile).eq('family_id',familyId).eq('id',userId).eq('role','child');
      if(error) throw new Error('Perfil do filho salvo; não foi possível atualizar o perfil de acesso. Tente novamente.');
    }
  }
  return result.data;
}
