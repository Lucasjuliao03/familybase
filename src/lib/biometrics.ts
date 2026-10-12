import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { loginIdentity, parseRememberedLogin, type RememberedLogin } from './rememberedLogin';

/**
 * Biometria (Face ID / Touch ID / impressão digital) para login de pais/gestores.
 *
 * As credenciais ficam guardadas no SecureStore (Keychain no iOS, Keystore no
 * Android) — armazenamento cifrado pelo sistema operativo. A biometria apenas
 * autoriza a leitura dessas credenciais para refazer o login no Supabase.
 *
 * IMPORTANTE: requer `expo-local-authentication` e `expo-secure-store`.
 * Após instalar (`npx expo install expo-local-authentication expo-secure-store`)
 * é necessário recompilar o app (dev build), pois são módulos nativos.
 */

const CRED_KEY = 'tdc_bio_credentials_v2';
const FLAG_KEY = 'tdc_bio_enabled_v2';
const LEGACY_KEYS = ['tdc_bio_credentials_v1', 'tdc_bio_enabled_v1'];

export interface BiometricCredentials {
  email: string;
  password: string;
  familyCode?: string;
}

/** Indica se o aparelho tem hardware biométrico e há biometria cadastrada. */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return !!enrolled && SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** Rótulo amigável do tipo de biometria disponível. */
export async function getBiometricLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Touch ID';
    }
  } catch { /* noop */ }
  return 'Biometria';
}

/** Executa o desafio biométrico. Retorna true se autenticado. */
export async function runBiometricPrompt(promptMessage = 'Confirme a sua identidade'): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
    });
    return !!res.success;
  } catch {
    return false;
  }
}

/** true se já existem credenciais guardadas e a biometria está ativada. */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    // Old credentials used an app-level prompt. Require a new opt-in to store
    // credentials behind the operating system's biometric key protection.
    await Promise.all(LEGACY_KEYS.map(key => SecureStore.deleteItemAsync(key)));
    return !!parseRememberedLogin(await SecureStore.getItemAsync(FLAG_KEY));
  } catch {
    return false;
  }
}

export async function biometricMatchesIdentity(identity: RememberedLogin): Promise<boolean> {
  try {
    const saved = parseRememberedLogin(await SecureStore.getItemAsync(FLAG_KEY));
    return !!saved && JSON.stringify(saved) === JSON.stringify(identity);
  } catch { return false; }
}

/** Guarda as credenciais com segurança e ativa o login biométrico. */
export async function enableBiometricLogin(creds: BiometricCredentials): Promise<void> {
  const identity = loginIdentity(creds.email, creds.familyCode);
  if (!identity || !(await isBiometricSupported())) throw new Error('Biometria segura não disponível neste aparelho.');
  // iOS does not challenge when creating a new keychain entry.
  if (Platform.OS === 'ios' && !(await runBiometricPrompt('Ativar acesso biométrico'))) return;
  await SecureStore.setItemAsync(CRED_KEY, JSON.stringify(creds), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: 'Proteger acesso ao Tudo de Família',
  });
  try { await SecureStore.setItemAsync(FLAG_KEY, JSON.stringify(identity)); }
  catch (error) { await disableBiometricLogin(); throw error; }
}

/** Desativa e apaga as credenciais guardadas. */
export async function disableBiometricLogin(): Promise<void> {
  if (Platform.OS === 'web') return;
  const results = await Promise.allSettled([CRED_KEY, FLAG_KEY, ...LEGACY_KEYS].map(key => SecureStore.deleteItemAsync(key)));
  if (results.some(result => result.status === 'rejected')) throw new Error('Não foi possível apagar o acesso biométrico deste aparelho.');
}

/**
 * Solicita biometria e, em caso de sucesso, devolve as credenciais guardadas.
 * Retorna null se não autorizado ou sem credenciais.
 */
export async function getCredentialsWithBiometric(
  promptMessage = 'Entrar com biometria',
): Promise<BiometricCredentials | null> {
  const enabled = await isBiometricEnabled();
  if (!enabled) return null;
  try {
    const raw = await SecureStore.getItemAsync(CRED_KEY, { requireAuthentication: true, authenticationPrompt: promptMessage });
    if (!raw) { await disableBiometricLogin(); return null; }
    const parsed = JSON.parse(raw) as BiometricCredentials;
    const identity = loginIdentity(parsed?.email, parsed?.familyCode);
    if (identity && typeof parsed?.password === 'string' && parsed.password && await biometricMatchesIdentity(identity)) return parsed;
    return null;
  } catch {
    return null;
  }
}
