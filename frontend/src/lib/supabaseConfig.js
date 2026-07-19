/**
 * Configuração pública Supabase (URL + anon/publishable key).
 * Fallback para basefamiliar2 quando o build ainda aponta ao projecto INACTIVE
 * (vderyfcxzcxsazqkfzzf — DNS inexistente → ERR_NAME_NOT_RESOLVED no login).
 */

/** Projecto activo: basefamiliar2 */
export const ACTIVE_SUPABASE_REF = 'dkymtsbevkolkiuiwtju';

/** Projectos desactivados — hostname já não resolve. */
const DEPRECATED_REFS = ['vderyfcxzcxsazqkfzzf'];

/** Valores públicos do projecto activo (equivalentes ao painel Supabase → API). */
const ACTIVE_PUBLIC = {
  url: `https://${ACTIVE_SUPABASE_REF}.supabase.co`,
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreW10c2JldmtvbGtpdWl3dGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTg3ODIsImV4cCI6MjA5OTk5NDc4Mn0.8rP-5sKRMaayNLEdUj5NUdQf813axNVvlmi5Anuwx60',
};

function extractRef(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

function isDeprecatedUrl(url) {
  const ref = extractRef(url);
  return !ref || DEPRECATED_REFS.includes(ref);
}

/**
 * @returns {{ url: string, anonKey: string, usedFallback: boolean, reason?: string }}
 */
export function resolveSupabaseConfig() {
  const envUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const envKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!envUrl || !envKey) {
    return {
      url: ACTIVE_PUBLIC.url,
      anonKey: envKey || ACTIVE_PUBLIC.anonKey,
      usedFallback: true,
      reason: 'env_ausente',
    };
  }

  if (isDeprecatedUrl(envUrl)) {
    return {
      url: ACTIVE_PUBLIC.url,
      anonKey: envKey.startsWith('eyJ') ? envKey : ACTIVE_PUBLIC.anonKey,
      usedFallback: true,
      reason: 'projecto_antigo_inactivo',
    };
  }

  return { url: envUrl, anonKey: envKey, usedFallback: false };
}

export function getSupabaseConfigDiagnostics() {
  const cfg = resolveSupabaseConfig();
  return {
    ...cfg,
    envUrl: import.meta.env.VITE_SUPABASE_URL || '',
    activeRef: ACTIVE_SUPABASE_REF,
  };
}
