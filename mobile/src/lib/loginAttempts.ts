import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Bloqueio temporário de login após múltiplas tentativas inválidas.
 * Persiste em AsyncStorage para resistir a reinícios do app.
 */

const KEY = 'tdc_login_attempts_v1';
const MAX_ATTEMPTS = 5;        // a partir daqui, bloqueia
const BASE_LOCK_MS = 30_000;   // 30s; dobra a cada bloqueio adicional
const MAX_LOCK_MS = 10 * 60_000; // teto de 10 min

interface AttemptState {
  fails: number;
  lockUntil: number; // epoch ms; 0 = sem bloqueio
}

async function read(): Promise<AttemptState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.fails === 'number') {
        return { fails: parsed.fails, lockUntil: parsed.lockUntil || 0 };
      }
    }
  } catch { /* noop */ }
  return { fails: 0, lockUntil: 0 };
}

async function write(state: AttemptState): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
}

/** Milissegundos restantes de bloqueio (0 se desbloqueado). */
export async function getRemainingLockMs(): Promise<number> {
  const { lockUntil } = await read();
  const remaining = lockUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Regista uma falha e devolve o bloqueio resultante (ms restantes, 0 se nenhum). */
export async function registerFailedAttempt(): Promise<number> {
  const state = await read();
  const fails = state.fails + 1;
  let lockUntil = 0;
  if (fails >= MAX_ATTEMPTS) {
    const overflow = fails - MAX_ATTEMPTS; // 0,1,2...
    const lockMs = Math.min(BASE_LOCK_MS * 2 ** overflow, MAX_LOCK_MS);
    lockUntil = Date.now() + lockMs;
  }
  await write({ fails, lockUntil });
  return lockUntil > 0 ? lockUntil - Date.now() : 0;
}

/** Limpa o contador após login bem-sucedido. */
export async function resetAttempts(): Promise<void> {
  await write({ fails: 0, lockUntil: 0 });
}

export const LOGIN_MAX_ATTEMPTS = MAX_ATTEMPTS;
