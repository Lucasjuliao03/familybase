import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

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

const CRED_KEY = 'tdc_bio_credentials_v1';
const FLAG_KEY = 'tdc_bio_enabled_v1';

export interface BiometricCredentials {
  email: string;
  password: string;
}

/** Indica se o aparelho tem hardware biométrico e há biometria cadastrada. */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return !!enrolled;
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
    const flag = await SecureStore.getItemAsync(FLAG_KEY);
    if (flag !== '1') return false;
    const raw = await SecureStore.getItemAsync(CRED_KEY);
    return !!raw;
  } catch {
    return false;
  }
}

/** Guarda as credenciais com segurança e ativa o login biométrico. */
export async function enableBiometricLogin(creds: BiometricCredentials): Promise<void> {
  await SecureStore.setItemAsync(CRED_KEY, JSON.stringify(creds), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(FLAG_KEY, '1');
}

/** Desativa e apaga as credenciais guardadas. */
export async function disableBiometricLogin(): Promise<void> {
  try { await SecureStore.deleteItemAsync(CRED_KEY); } catch { /* noop */ }
  try { await SecureStore.deleteItemAsync(FLAG_KEY); } catch { /* noop */ }
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
  const ok = await runBiometricPrompt(promptMessage);
  if (!ok) return null;
  try {
    const raw = await SecureStore.getItemAsync(CRED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricCredentials;
    if (parsed?.email && parsed?.password) return parsed;
    return null;
  } catch {
    return null;
  }
}
