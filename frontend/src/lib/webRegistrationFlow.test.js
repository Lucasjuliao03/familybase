import test from 'node:test';
import assert from 'node:assert/strict';
import { registerLegacyFamilyAccount } from './legacyFamilyAuth.js';
import { webRegistrationErrors, webRegistrationFailure, WEB_REGISTRATION_STEPS } from './webRegistrationFlow.js';

const form = { familyName: 'Silva', profileType: 'mae', name: 'Ana Silva', email: 'ana@example.com', password: 'abc123', confirmPassword: 'abc123', phone: '11999999999', dateOfBirth: '1990-10-11', avatarPreset: 'mae1', accepted: true };

test('three web steps preserve every required registration field', () => {
  assert.equal(WEB_REGISTRATION_STEPS.length, 3);
  assert.deepEqual(webRegistrationErrors(form, 2), {});
  assert.ok(webRegistrationErrors({ ...form, password: '123' }, 0).password);
  assert.ok(webRegistrationErrors({ ...form, phone: '' }, 1).phone);
  assert.ok(webRegistrationErrors({ ...form, avatarPreset: '' }, 2).avatarPreset);
  assert.equal(webRegistrationErrors({ ...form, phone: '' }, 0).phone, undefined);
  assert.equal(webRegistrationErrors({ ...form, password: '', confirmPassword: '' }, 0, true).password, undefined);
});

test('duplicate codes and the existing deployed messages offer explicit login guidance', () => {
  for (const error of [
    ...['signup_existing_account', 'user_already_exists', 'email_exists', 'email_already_in_use'].map(code => ({ code })),
    { message: 'User already registered' },
    { message: 'Este e-mail já tem conta. Entre para acessar sua família.' },
  ]) {
    const result = webRegistrationFailure(error);
    assert.equal(result.existingAccount, true);
    assert.match(result.message, /já está cadastrado.*Entre/);
  }
});

test('unrelated network, delivery and database errors are never mislabeled as an existing email', () => {
  for (const message of ['Network request failed', 'Database error saving new user', 'Não foi possível enviar a confirmação', 'Código inválido ou expirado.']) {
    assert.deepEqual(webRegistrationFailure(new Error(message)), { existingAccount: false, message });
  }
});

test('an obfuscated repeated signup cannot create a family or claim a confirmation was sent', async () => {
  const calls = [];
  const client = { auth: {
    getSession: async () => ({ data: { session: null } }),
    signUp: async () => { calls.push('signup'); return { data: { session: null, user: { id: 'obfuscated', identities: [] } } }; },
    updateUser: async () => { throw Error('Existing account must not be updated'); },
  }, rpc: async () => { throw Error('Existing email must not create a family'); } };
  await assert.rejects(() => registerLegacyFamilyAccount(client, form), error => webRegistrationFailure(error).existingAccount);
  assert.deepEqual(calls, ['signup']);
});

test('explicit Auth duplicate responses stop before profile writes and family creation', async () => {
  for (const code of ['email_exists', 'user_already_exists']) {
    const client = { auth: {
      getSession: async () => ({ data: { session: null } }),
      signUp: async () => ({ error: { code, message: 'User already registered' } }),
    }, rpc: async () => { throw Error('Duplicate signup must stop before the family RPC'); } };
    await assert.rejects(() => registerLegacyFamilyAccount(client, form), error => webRegistrationFailure(error).existingAccount);
  }
});

test('a new pending signup keeps the real email confirmation flow', async () => {
  const client = { auth: {
    getSession: async () => ({ data: { session: null } }),
    signUp: async () => ({ data: { session: null, user: { id: 'pending', identities: [{ id: 'email-identity' }] } } }),
  }, rpc: async () => { throw Error('Unconfirmed email must not create a family'); } };
  assert.deepEqual(await registerLegacyFamilyAccount(client, form), { status: 'confirmation_required', email: form.email });
});

test('a signed-in responsible with a family cannot overwrite their profile during signup', async () => {
  const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: { family_id: 'existing-family', role: 'parent' } }) };
  const client = { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'owner', email: form.email, email_confirmed_at: '2026-10-01' } } } }),
    updateUser: async () => { throw Error('Existing responsible must not have password or metadata changed'); },
  }, from: () => query, rpc: async () => { throw Error('Existing responsible must not create a second family'); } };
  await assert.rejects(() => registerLegacyFamilyAccount(client, form), error => webRegistrationFailure(error).existingAccount);
});
