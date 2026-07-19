import { createClient } from '@supabase/supabase-js';
import { fetchNoStoreWithDeadline } from './fetchWithDeadline';
import { resolveSupabaseConfig } from './supabaseConfig';

export { fetchNoStoreWithDeadline, fetchNoStoreWithDeadline as fetchNoStore } from './fetchWithDeadline';
export { getSupabaseConfigDiagnostics, ACTIVE_SUPABASE_REF, resolveSupabaseConfig } from './supabaseConfig';

const { url: supabaseUrl, anonKey: supabaseAnonKey, usedFallback, reason } = resolveSupabaseConfig();

/** URL activa do Supabase (com fallback se o build apontar ao projecto antigo). */
export { supabaseUrl, supabaseAnonKey };

if (usedFallback && typeof console !== 'undefined') {
  console.warn(
    `[supabase] A usar projecto basefamiliar2 (${reason}). ` +
      'Actualize VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env / Vercel.',
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Supabase config inválida. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
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
    const cfg = resolveSupabaseConfig();
    const hint = cfg.usedFallback
      ? ''
      : ' Se acabou de migrar o Supabase, actualize VITE_SUPABASE_URL na Vercel e faça redeploy.';
    return new Error(
      'Não foi possível ligar ao servidor Supabase (DNS/rede). Verifique a Internet' +
        hint +
        ' Projecto activo: basefamiliar2.',
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
  global: {
    fetch: fetchNoStoreWithDeadline,
  },
});

/**
 * Evita reconnect desnecessário sem canais ou com aba pouco tempo ao fundo.
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 * @param {number} hiddenDurationMs tempo com document não visível
 */
export function shouldReconnectSupabaseRealtime(client = supabase, hiddenDurationMs = 0) {
  const rt = client?.realtime;
  if (!rt || typeof rt.getChannels !== 'function') return false;
  const channels = rt.getChannels();
  if (!Array.isArray(channels) || channels.length === 0) return false;
  if (hiddenDurationMs >= 9000) return true;
  try {
    if (typeof rt.isConnected === 'function') return rt.isConnected() === false;
  } catch {
    /* ignora introspection opcional da lib */
  }
  return false;
}

/**
 * Reforço do WebSocket Realtime após suspensão; só chamar quando `shouldReconnectSupabaseRealtime`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 * @param {string | null | undefined} [accessToken]
 */
export async function reconnectSupabaseRealtime(client = supabase, accessToken) {
  const rt = client?.realtime;
  if (!rt) return;
  try {
    let token = accessToken;
    if (token === undefined) {
      const { data } = await client.auth.getSession();
      token = data?.session?.access_token ?? null;
    }
    if (typeof rt.disconnect === 'function') {
      await rt.disconnect();
    }
    if (typeof rt.connect === 'function') {
      rt.connect();
    }
    if (typeof rt.setAuth === 'function') {
      if (token) rt.setAuth(token);
      else rt.setAuth();
    }
  } catch (e) {
    console.warn('[supabase] realtime reconnect:', e);
  }
}
