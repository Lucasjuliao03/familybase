import { ADULT_AVATAR_IDS, CHILD_AVATAR_IDS } from './familyIdentity.js';

export function avatarKind(endpoint='',role) {
  return role==='child' || /\/(?:children|child)(?:\/|$)/.test(endpoint) ? 'child' : 'adult';
}

// React Native FormData implements getAll(), while browser FormData also has get().
export function formField(body,key) {
  if(typeof body?.get==='function') return body.get(key);
  if(typeof body?.getAll==='function') return body.getAll(key)[0] ?? null;
  if(typeof body?.getParts==='function') {
    const part=body.getParts().find(item=>item.fieldName===key);
    return part?.string ?? part ?? null;
  }
  return body?.[key] ?? null;
}

export async function saveFamilyAvatar(client,{familyId,presetId,childId=null,memberId=null,kind='adult'}) {
  const ids=kind==='child' ? CHILD_AVATAR_IDS : ADULT_AVATAR_IDS;
  if(!familyId || !ids.includes(presetId)) throw new Error('Escolha um avatar válido para este perfil.');
  const {data,error}=await client.rpc('update_family_avatar',{p_avatar_preset:presetId,p_child_id:childId,p_member_id:childId ? null:memberId});
  if(!error) {
    if(data?.avatar_preset!==presetId) throw new Error('O avatar não foi confirmado pelo banco. Tente novamente.');
    return data;
  }
  // Keep existing clients operational while the compatible database patch is reviewed.
  if(!['PGRST202','42883'].includes(error.code)) throw new Error(error.message || 'Não foi possível salvar o avatar.');
  const table=childId ? 'children':'users';
  const result=await client.from(table).update({avatar_preset:presetId,avatar_url:null})
    .eq('id',childId || memberId).eq('family_id',familyId).select(childId ? 'id,user_id,avatar_preset,avatar_url':'id,avatar_preset,avatar_url').single();
  if(result.error || result.data?.avatar_preset!==presetId) throw new Error(result.error?.message || 'Não foi possível salvar o avatar. Confira seu acesso e tente novamente.');
  if(childId && result.data.user_id) {
    const profile=await client.from('users').update({avatar_preset:presetId,avatar_url:null})
      .eq('id',result.data.user_id).eq('family_id',familyId).select('id').single();
    if(profile.error || !profile.data) throw new Error('O avatar do filho foi salvo; tente novamente para atualizar também seu perfil de acesso.');
  }
  return result.data;
}

export async function saveAvatarPhoto(client,{familyId,avatarUrl,childId=null,memberId=null}) {
  if(!familyId || !(childId || memberId)) throw new Error('Perfil não encontrado.');
  const result=await client.from(childId ? 'children':'users').update({avatar_url:avatarUrl,avatar_preset:null})
    .eq('id',childId || memberId).eq('family_id',familyId).select(childId ? 'id,user_id,avatar_url,avatar_preset':'id,avatar_url,avatar_preset').single();
  if(result.error || result.data?.avatar_url!==avatarUrl) throw new Error(result.error?.message || 'Não foi possível salvar a imagem do perfil.');
  if(childId && result.data.user_id) {
    const profile=await client.from('users').update({avatar_url:avatarUrl,avatar_preset:null})
      .eq('id',result.data.user_id).eq('family_id',familyId).select('id').single();
    if(profile.error || !profile.data) throw new Error('Imagem salva no filho; tente novamente para atualizar também seu perfil de acesso.');
  }
  return result.data;
}
