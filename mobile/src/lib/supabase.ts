import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchNoStoreWithDeadline } from './fetchWithDeadline';

export { fetchNoStoreWithDeadline, fetchNoStoreWithDeadline as fetchNoStore } from './fetchWithDeadline';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase config ausente. Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no .env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchNoStoreWithDeadline,
  },
});

/**
 * Converte falhas de rede em mensagem acionável.
 */
export function mapAuthNetworkError(err: unknown): Error {
  const msg = (err as Error)?.message || String(err);
  const name = (err as Error)?.name;
  const isNetwork =
    (name === 'TypeError' &&
      /Failed to fetch|Load failed|NetworkError|network error/i.test(msg)) ||
    /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED/i.test(msg);
  if (isNetwork) {
    return new Error(
      'Não foi possível ligar ao servidor. Verifique a ligação à Internet ou tente dentro de instantes.',
    );
  }
  return err instanceof Error ? err : new Error(msg);
}
