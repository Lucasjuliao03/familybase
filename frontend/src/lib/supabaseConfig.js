/** Projeto confirmado pelo responsável. Nunca trocar de banco silenciosamente. */
export const ACTIVE_SUPABASE_REF = 'tcyvnclzhczmgamwxigv';

export function resolveSupabaseConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (url !== 'https://' + ACTIVE_SUPABASE_REF + '.supabase.co') {
    throw new Error('Configure VITE_SUPABASE_URL para o projeto ' + ACTIVE_SUPABASE_REF + '.');
  }
  if (!anonKey.startsWith('sb_publishable_')) {
    throw new Error('Configure VITE_SUPABASE_ANON_KEY com a chave publishable do projeto.');
  }
  return { url, anonKey, usedFallback: false };
}

/** Diagnóstico sem reproduzir a chave. */
export function getSupabaseConfigDiagnostics() {
  const { url, usedFallback } = resolveSupabaseConfig();
  return { url, usedFallback, envUrl: import.meta.env.VITE_SUPABASE_URL || '', activeRef: ACTIVE_SUPABASE_REF };
}
