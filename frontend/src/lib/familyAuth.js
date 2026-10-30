import { isPersonalEmail, normalizeEmail, normalizeFamilyCode, normalizeUsername, PASSWORD_MIN, registrationErrors, signupMetadata } from './familyIdentity.js';

export async function signInFamilyAccount(client, email, password, familyCode) {
  if (familyCode === undefined || familyCode === null) {
    const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) throw new Error(error.code === 'email_not_confirmed' ? 'Confirme seu e-mail antes de entrar.' : 'E-mail ou senha incorretos.');
    return data;
  }
  const code = normalizeFamilyCode(familyCode);
  const username = normalizeUsername(email);
  if (!code || !username) throw new Error('Informe o código da família e um login válido.');
  const { data, error } = await client.functions.invoke('family-login', { body: { family_code: code, username, password } });
  if (error) {
    let message = 'Não foi possível entrar. Verifique a conexão e tente novamente.';
    try { message = (await error.context.json()).error || message; } catch { /* no response body */ }
    throw Object.assign(new Error(message), { code: error.context?.status === 401 ? 'invalid_credentials' : error.context?.status === 429 ? 'rate_limit_exceeded' : 'auth_network_error' });
  }
  if (!data?.session) throw new Error(data?.error || 'Código da família, login ou senha incorretos.');
  const result = await client.auth.setSession(data.session);
  if (result.error || !result.data.user) throw new Error('Não foi possível iniciar a sessão. Tente novamente.');
  return result.data;
}

export async function completeFamilyRegistration(client, metadata) {
  const { data, error } = await client.rpc('complete_family_registration', {
    p_family_name: metadata.family_name, p_user_name: metadata.name, p_profile_type: metadata.profile_type,
    p_phone: metadata.phone, p_date_of_birth: metadata.date_of_birth, p_avatar_preset: metadata.avatar_preset,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function requestRegistrationEmail(client, form, redirectTo) {
  const email = normalizeEmail(form.email);
  if (!isPersonalEmail(email)) throw new Error('Informe um e-mail pessoal válido.');
  const { error } = await client.auth.signInWithOtp({ email, options: {
    shouldCreateUser: true,
    ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
    data: { registration_flow: 'conversation', family_name: form.familyName.trim(), name: form.name.trim(), profile_type: form.profileType },
  } });
  if (error) throw new Error(error.status === 429 ? 'Aguarde um minuto antes de pedir outro código.' : 'Não foi possível enviar a confirmação. Verifique o e-mail e tente novamente.');
}

export async function verifyRegistrationEmail(client, email, token) {
  if (!/^\d{6,10}$/.test(String(token || '').trim())) throw new Error('Digite o código recebido por e-mail.');
  const { data, error } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: token.trim(), type: 'email' });
  if (error || !data.user?.email_confirmed_at) throw new Error('Código inválido ou expirado. Confira o e-mail ou solicite outro código.');
  const profile = await client.from('users').select('family_id,role').eq('id',data.user.id).maybeSingle();
  if (profile.error) throw new Error('Não foi possível carregar seu cadastro. Tente novamente.');
  if (profile.data?.family_id || profile.data?.role === 'master') throw new Error('Este e-mail já tem conta. Entre para acessar sua família.');
  return data.user;
}

export async function setRegistrationPassword(client, email, password, confirmation) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) throw new Error('Use pelo menos 6 caracteres.');
  if (password !== confirmation) throw new Error('As senhas não coincidem.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at || normalizeEmail(data.user.email) !== normalizeEmail(email)) throw new Error('Confirme seu e-mail para continuar.');
  const profile = await client.from('users').select('family_id,role').eq('id',data.user.id).maybeSingle();
  if (profile.error || profile.data?.family_id || profile.data?.role === 'master') throw new Error('Este e-mail já tem conta. Entre para acessar sua família.');
  const result = await client.auth.updateUser({ password, data: { registration_password_set: true } });
  if (result.error) throw new Error(result.error.message || 'Não foi possível salvar a senha. Tente novamente.');
}

export async function registerFamilyAccount(client, form) {
  const email = normalizeEmail(form.email);
  const { data: current } = await client.auth.getSession();
  const completing = current?.session?.user?.email_confirmed_at && normalizeEmail(current.session.user.email) === email;
  if (!completing) throw new Error('Confirme seu e-mail antes de criar a família.');
  if (!form.accepted) throw new Error('Aceite os Termos de Uso e a Política de Privacidade.');
  const errors = registrationErrors(completing ? { ...form, password: 'completion-only', confirmPassword: undefined } : form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const metadata = { ...signupMetadata(form), terms_accepted: true };
  let session = current?.session;
  if (completing) {
    const { error } = await client.auth.updateUser({ data: metadata });
    if (error) throw new Error('Não foi possível salvar os dados. Tente novamente.');
  }
  const result = await completeFamilyRegistration(client, metadata);
  return { status: 'registered', userId: session.user.id, ...result };
}
