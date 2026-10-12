import { ADULT_AVATAR_IDS, maskPhone, normalizeEmail, registrationErrors } from './familyIdentity.js';

export const REGISTRATION_STEPS = [
  { id: 'profileType', prompt: 'Você é o pai ou a mãe?', hint: 'Os dois perfis têm as mesmas permissões para cuidar da família.' },
  { id: 'name', prompt: 'Qual é o seu nome completo?', hint: 'Você será o responsável pela família.' },
  { id: 'email', prompt: 'Qual é o seu e-mail?', hint: 'Use um e-mail pessoal ao qual você tenha acesso.' },
  { id: 'verification', prompt: 'Vamos confirmar seu e-mail?', hint: 'Digite os números do código que enviamos para seu e-mail.' },
  { id: 'password', prompt: 'Agora, escolha sua senha', hint: 'Use pelo menos 6 caracteres e repita a mesma senha para confirmar.' },
  { id: 'phone', prompt: 'Qual é o seu telefone?', hint: 'Inclua o DDD para mantermos seus dados de contato completos.' },
  { id: 'dateOfBirth', prompt: 'Quando você nasceu?', hint: 'O responsável principal precisa ter pelo menos 18 anos.' },
  { id: 'avatarPreset', prompt: 'Escolha seu avatar', hint: 'Toque nas opções para ver e escolher quem vai representar você.' },
  { id: 'familyName', prompt: 'Como vamos chamar sua família?', hint: 'Escolha um nome que tenha a cara de vocês.' },
  { id: 'terms', prompt: 'Tudo pronto para criar sua família!', hint: 'Confira seus dados e aceite os termos para concluir.' },
];
export const EMPTY_REGISTRATION = { familyName: '', name: '', profileType: '', email: '', password: '', confirmPassword: '', phone: '', dateOfBirth: '', avatarPreset: '' };
export function registrationStepErrors(form, step) {
  const all = registrationErrors(form);
  const keys = step === 'password' ? ['password','confirmPassword'] : [step];
  return Object.fromEntries(keys.filter(k => all[k]).map(k => [k, all[k]]));
}
// Passwords and verification codes never enter local storage or user metadata.
export function safeRegistrationDraft(form, step, emailVerified = false, passwordSet = false) {
  const data=Object.fromEntries(Object.keys(EMPTY_REGISTRATION).filter(k => !['password','confirmPassword'].includes(k)).map(k => [k,form[k]]));
  return { version: 1, data, step, emailVerified, passwordSet, updatedAt: Date.now() };
}
export function restoreRegistrationDraft(draft) {
  if (draft?.version !== 1 || !Number.isFinite(draft.updatedAt) || Date.now() - draft.updatedAt > 24*60*60*1000) return null;
  const data = Object.fromEntries(Object.keys(EMPTY_REGISTRATION).filter(k => !['password','confirmPassword'].includes(k)).map(k => [k, String(draft.data?.[k] || '')]));
  const incomplete=!data.profileType ? 0 : !data.name ? 1 : !data.email ? 2 : 3;
  return { form: { ...EMPTY_REGISTRATION, ...data }, step: Math.min(incomplete,Math.max(0,Math.trunc(Number(draft.step))||0)) };
}
export function validateSimulationCode(value) {
  if (!/^\d{1,10}$/.test(String(value || '').trim())) throw new Error('No teste, digite qualquer código numérico.');
}
export function registrationFromUser(authUser) {
  const m = authUser.user_metadata || {};
  return { ...EMPTY_REGISTRATION, familyName: m.family_name || '', name: m.name || '', profileType: ['pai','mae'].includes(m.profile_type) ? m.profile_type : '',
    email: normalizeEmail(authUser.email), phone: maskPhone(m.phone || ''), dateOfBirth: m.date_of_birth || '', avatarPreset: ADULT_AVATAR_IDS.includes(m.avatar_preset) ? m.avatar_preset : '' };
}
