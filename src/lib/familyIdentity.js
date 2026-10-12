// Shared validation contract. Synced into both clients by scripts/sync-family-identity.mjs.
export const ADULT_AVATAR_IDS = ['homem1', 'homem2', 'menina2'];
export const CHILD_AVATAR_IDS = ['bia', 'caio', 'davi', 'lia', 'lua', 'lumi', 'nina', 'theo'];
export const MASCOT_IDS = ['lili', 'tobe', 'pipo', 'luca'];
export const PASSWORD_MIN = 6;
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random()*16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });
}
const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
export function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
export function isPersonalEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@tudodefamilia.com') && !email.endsWith('.invalid');
}
export function normalizeFamilyCode(value) {
  const compact = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  const code = compact.length === 11 && compact.startsWith('FAM') ? compact.slice(3) : compact;
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code) ? `FAM-${code.slice(0, 4)}-${code.slice(4)}` : '';
}
export function normalizeUsername(value) {
  const login = String(value || '').trim().toLowerCase();
  if (login.includes('@') && !login.endsWith('@tudodefamilia.com')) return '';
  const username = login.replace(/@tudodefamilia\.com$/, '');
  return /^[a-z][a-z0-9._-]{2,31}$/.test(username) ? username : '';
}
export function suggestUsername(name) {
  const base = String(name || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (base.length >= 3 && /^[a-z]/.test(base) ? base : 'membro').slice(0, 28);
}
function phoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  return digits;
}
export function normalizePhone(value) {
  const digits = phoneDigits(value);
  return DDDS.has(digits.slice(0, 2)) && /^(?:\d{2}[2-5]\d{7}|\d{2}9\d{8})$/.test(digits) ? `+55${digits}` : '';
}
export function maskPhone(value) {
  const d = phoneDigits(value).slice(0, 11);
  if (!d) return '';
  const head = d.length <= 2 ? `(${d}` : `(${d.slice(0, 2)}) `;
  const cut = d.length === 11 ? 7 : 6;
  return head + d.slice(2, cut) + (d.length > cut ? `-${d.slice(cut)}` : '');
}
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function birthAge(iso, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (y < 1900 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || iso > localToday(now)) return null;
  return now.getFullYear() - y - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
}
export function registrationErrors(form, now = new Date()) {
  const errors = {};
  const family = String(form.familyName || '').trim();
  const name = String(form.name || '').trim();
  if (family.length < 2 || family.length > 80) errors.familyName = 'Informe o nome da família (2 a 80 caracteres).';
  if (!/^\S+\s+\S+/.test(name) || name.length > 160) errors.name = 'Informe seu nome completo.';
  if (!['pai', 'mae'].includes(form.profileType)) errors.profileType = 'Escolha Pai ou Mãe.';
  if (!isPersonalEmail(form.email)) errors.email = 'Informe um e-mail pessoal válido.';
  if (String(form.password || '').length < PASSWORD_MIN) errors.password = 'Use pelo menos 6 caracteres.';
  if (form.confirmPassword !== undefined && form.password !== form.confirmPassword) errors.confirmPassword = 'As senhas não coincidem.';
  if (!normalizePhone(form.phone)) errors.phone = 'Informe um telefone brasileiro válido com DDD.';
  const age = birthAge(form.dateOfBirth, now);
  if (age === null) errors.dateOfBirth = 'Escolha uma data de nascimento válida.';
  else if (age < 18) errors.dateOfBirth = 'O responsável principal deve ter pelo menos 18 anos.';
  if (!ADULT_AVATAR_IDS.includes(form.avatarPreset)) errors.avatarPreset = 'Escolha um avatar adulto.';
  return errors;
}
export function signupMetadata(form) {
  return { registration_version: 3, family_name: form.familyName.trim(), name: form.name.trim(), profile_type: form.profileType,
    phone: normalizePhone(form.phone), date_of_birth: form.dateOfBirth, avatar_preset: form.avatarPreset };
}
