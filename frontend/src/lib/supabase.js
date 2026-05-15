import { createClient } from '@supabase/supabase-js';

/**
 * URL que o browser usa para Auth/REST/Storage/Functions.
 * Em produção comercial: aponte para o proxy do teu backend, ex. https://api.teudominio.com/api/supabase
 * (o servidor define SUPABASE_URL com https://<ref>.supabase.co e resolve o DNS).
 * Em dev: http://localhost:5173/api/supabase (Vite reencaminha) ou http://localhost:3001/api/supabase
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase config ausente. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env');
}

/**
 * Converte falhas de fetch/DNS do browser em mensagem acionável (ex.: ERR_NAME_NOT_RESOLVED).
 */
export function mapAuthNetworkError(err) {
  const msg = err?.message || String(err);
  const name = err?.name;
  const isNetwork =
    (name === 'TypeError' && /Failed to fetch|Load failed|NetworkError|network error/i.test(msg)) ||
    /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_REFUSED/i.test(msg);
  if (isNetwork) {
    return new Error(
      'Não foi possível ligar ao servidor. Verifique a ligação à Internet ou tente dentro de instantes. ' +
        'Se o problema persistir, contacte o suporte.',
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
