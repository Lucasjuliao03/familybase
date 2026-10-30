import { resolveSupabaseConfig } from './supabaseConfig.js';
export async function loadPublicCatalog() {
  const { url, anonKey } = resolveSupabaseConfig();
  // Public RLS projection only. No session SDK, cookies or private identity on the landing.
  const response = await fetch(`${url}/rest/v1/rpc/web_public_catalog`, {
    method:'POST', headers:{apikey:anonKey,'Content-Type':'application/json'},
    body:'{}', credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Catálogo público indisponível');
  return response.json();
}
