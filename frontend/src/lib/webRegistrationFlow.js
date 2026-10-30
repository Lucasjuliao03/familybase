import { registrationErrors } from './familyIdentity.js';

export const WEB_REGISTRATION_STEPS = [
  { title: 'Sua conta', hint: 'Dados do responsável e acesso à família.', fields: ['profileType', 'name', 'email', 'password', 'confirmPassword'] },
  { title: 'Sua família', hint: 'Personalize a família e complete seus dados.', fields: ['familyName', 'phone', 'dateOfBirth', 'avatarPreset'] },
  { title: 'Revisar e criar', hint: 'Confira os dados antes de enviar a confirmação.', fields: null },
];

export function webRegistrationErrors(form, step, passwordAlreadySet = false) {
  const errors = registrationErrors(passwordAlreadySet ? { ...form, password: 'completion-only', confirmPassword: undefined } : form);
  const fields = WEB_REGISTRATION_STEPS[step]?.fields;
  return fields ? Object.fromEntries(fields.filter(key => errors[key]).map(key => [key, errors[key]])) : errors;
}

export function webRegistrationFailure(error) {
  const code = error?.code || error?.response?.data?.code;
  const message = error?.message || error?.response?.data?.error || '';
  const existingAccount = ['signup_existing_account', 'user_already_exists', 'email_exists', 'email_already_in_use'].includes(code)
    || /(?:user|email|e-mail).*(?:already (?:been )?registered|already exists|already in use)|(?:e-mail|email).*(?:já tem conta|já está cadastrado|já cadastrado)/i.test(message);
  return {
    existingAccount,
    message: existingAccount ? 'Este e-mail já está cadastrado. Entre para acessar sua família.' : message || 'Não foi possível continuar. Tente novamente.',
  };
}
