import { ADULT_AVATAR_IDS, normalizeEmail, registrationErrors, signupMetadata } from './familyIdentity.js';
import { signInFamilyAccount } from './familyAuth.js';

export function authFailure(error) {
  const code = error?.code || '';
  let message;
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message || '')) message = 'E-mail ou senha incorretos.';
  else if (code === 'email_not_confirmed') message = 'Confirme seu e-mail pelo link recebido antes de entrar.';
  else if (['over_email_send_rate_limit','email_send_rate_limit'].includes(code)) message = 'O limite de envio de e-mails foi atingido. Aguarde antes de pedir outra confirmação.';
  else if (code === 'email_address_not_authorized' || /sending confirmation email|send.*email/i.test(error?.message || '')) message = 'Não foi possível enviar a confirmação por e-mail. Tente mais tarde ou fale com o suporte.';
  else if (error?.status === 429) message = 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  else if (error?.status >= 500 || error?.name === 'AuthRetryableFetchError' || /fetch|network|timed? ?out|timeout|abort/i.test(error?.message || '')) message = 'Não foi possível conectar ao servidor. Verifique a internet e tente novamente.';
  else message = error?.message || 'Não foi possível entrar. Tente novamente.';
  return Object.assign(new Error(message), { code: code || (message==='E-mail ou senha incorretos.' ? 'invalid_credentials' : message.includes('conectar') ? 'auth_network_error' : 'auth_error') });
}

// Uses the deployed email/password identity, including existing child and relative accounts.
export async function signInExistingAccount(client, email, password, familyCode) {
  if (familyCode !== undefined && familyCode !== null) return signInFamilyAccount(client, email, password, familyCode);
  const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) throw authFailure(error);
  if (!data?.user) throw new Error('Não foi possível iniciar a sessão. Tente novamente.');
  return data;
}

export function canCompleteLegacyRegistration(metadata) {
  return !!metadata?.family_name && !!metadata?.name && ['pai','mae'].includes(metadata.profile_type)
    && (metadata.legacy_registration === true || metadata.registration_version === 2
      || (metadata.registration_version === 3 && metadata.terms_accepted === true));
}

export async function completeLegacyFamilyRegistration(client, metadata) {
  const { data: owner, error: authError } = await client.auth.getUser();
  if (authError || !owner?.user?.email_confirmed_at) throw new Error('Confirme seu e-mail pelo link recebido antes de continuar.');
  const { data, error } = await client.rpc('register_family_and_user', {
    p_family_name: metadata.family_name, p_user_name: metadata.name,
    p_profile_type: metadata.profile_type, p_phone: metadata.phone || null,
    p_date_of_birth: metadata.date_of_birth || null, p_avatar_url: metadata.avatar_url || null,
    p_contact_email: normalizeEmail(owner.user.email),
  });
  if (error) throw new Error(error.message || 'Não foi possível criar a família. Tente novamente.');
  if (!data?.family_id) throw new Error('Não foi possível concluir o vínculo da família. Tente novamente.');
  if (ADULT_AVATAR_IDS.includes(metadata.avatar_preset)) {
    const result = await client.from('users').update({ avatar_preset: metadata.avatar_preset }).eq('id',owner.user.id).eq('family_id',data.family_id);
    if (result.error) throw new Error('A família foi criada, mas não foi possível salvar o avatar. Tente novamente.');
  }
  return data;
}

// A confirmed signup may not have a public profile yet. Complete it before loading the app.
export async function loadExistingFamilyProfile(client, userId) {
  let result = await client.from('users').select('*').eq('id',userId).maybeSingle();
  if (result.error) throw new Error('Não foi possível carregar seu perfil. Verifique a conexão e tente novamente.');
  if (result.data?.family_id || result.data?.role === 'master') return result.data;
  const { data: owner, error } = await client.auth.getUser();
  if (!error && owner?.user?.id === userId && owner.user.email_confirmed_at && canCompleteLegacyRegistration(owner.user.user_metadata)) {
    await completeLegacyFamilyRegistration(client,owner.user.user_metadata);
    result = await client.from('users').select('*').eq('id',userId).maybeSingle();
  }
  if (result.error || !result.data) throw new Error('Não foi possível carregar seu cadastro. Tente novamente ou fale com o gestor.');
  return result.data;
}

export async function registerLegacyFamilyAccount(client, form, redirectTo) {
  if (!form.accepted) throw new Error('Aceite os Termos de Uso e a Política de Privacidade.');
  const email = normalizeEmail(form.email);
  const { data: current, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw authFailure(sessionError);
  const currentUser = current?.session?.user;
  if (currentUser && normalizeEmail(currentUser.email) !== email) throw new Error('Saia da conta atual para cadastrar outra família.');
  const completing = !!currentUser?.email_confirmed_at;
  const errors = registrationErrors(completing ? { ...form,password:'completion-only',confirmPassword:undefined } : form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const metadata = { ...signupMetadata(form), legacy_registration:true, terms_accepted:true };
  let user = currentUser;
  if (completing) {
    const profile = await client.from('users').select('family_id,role').eq('id',user.id).maybeSingle();
    if (profile.error) throw new Error('Não foi possível carregar seu cadastro. Tente novamente.');
    if (profile.data?.family_id || profile.data?.role === 'master') throw new Error('Este e-mail já tem conta. Entre para acessar sua família.');
    const { error } = await client.auth.updateUser({ data:metadata });
    if (error) throw authFailure(error);
  } else {
    const { data, error } = await client.auth.signUp({ email,password:form.password,options:{ data:metadata,...(redirectTo ? { emailRedirectTo:redirectTo } : {}) } });
    if (error) throw authFailure(error);
    // Supabase deliberately returns an obfuscated user for a repeated confirmed
    // signup. That response does not mean another confirmation email was sent.
    if (!data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
      throw Object.assign(new Error('Não foi possível iniciar um novo cadastro com este e-mail. Se você já possui uma conta, entre ou recupere sua senha.'),{code:'signup_existing_account'});
    }
    if (!data?.session && !data?.user) throw new Error('Não foi possível iniciar seu cadastro. Tente novamente.');
    if (!data?.session) return { status:'confirmation_required',email };
    user = data.user;
  }
  const result = await completeLegacyFamilyRegistration(client,metadata);
  return { status:'registered',userId:user.id,...result };
}

export async function resendSignupConfirmation(client, email, redirectTo) {
  const { error } = await client.auth.resend({ type:'signup',email:normalizeEmail(email),options:redirectTo ? { emailRedirectTo:redirectTo } : {} });
  if (error) throw authFailure(error);
}

export async function confirmSignupCode(client, email, token) {
  const code=String(token || '').trim();
  if (!/^\d{6,10}$/.test(code)) throw new Error('Digite o código numérico recebido por e-mail.');
  const {data,error}=await client.auth.verifyOtp({email:normalizeEmail(email),token:code,type:'email'});
  if (error) {
    if(error.status===429) throw authFailure(error);
    throw new Error('Código inválido ou expirado. Confira o e-mail ou peça outro código.');
  }
  if (!data?.session || !data.user?.email_confirmed_at || normalizeEmail(data.user.email)!==normalizeEmail(email)) {
    throw new Error('Não foi possível confirmar seu e-mail. Peça outro código.');
  }
  return data.user;
}
