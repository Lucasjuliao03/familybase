/** Projecto activo: basefamiliar2 */
export const ACTIVE_SUPABASE_REF = 'dkymtsbevkolkiuiwtju';

const DEPRECATED_REFS = ['vderyfcxzcxsazqkfzzf'];

const ACTIVE_PUBLIC = {
  url: `https://${ACTIVE_SUPABASE_REF}.supabase.co`,
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreW10c2JldmtvbGtpdWl3dGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTg3ODIsImV4cCI6MjA5OTk5NDc4Mn0.8rP-5sKRMaayNLEdUj5NUdQf813axNVvlmi5Anuwx60',
};

function extractRef(url: string): string | null {
  const m = String(url || '').match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

function isDeprecatedUrl(url: string): boolean {
  const ref = extractRef(url);
  return !ref || DEPRECATED_REFS.includes(ref);
}

export function resolveSupabaseConfig() {
  const envUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const envKey = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  if (!envUrl || !envKey) {
    return {
      url: ACTIVE_PUBLIC.url,
      anonKey: envKey || ACTIVE_PUBLIC.anonKey,
      usedFallback: true as const,
      reason: 'env_ausente' as const,
    };
  }

  if (isDeprecatedUrl(envUrl)) {
    return {
      url: ACTIVE_PUBLIC.url,
      anonKey: envKey.startsWith('eyJ') ? envKey : ACTIVE_PUBLIC.anonKey,
      usedFallback: true as const,
      reason: 'projecto_antigo_inactivo' as const,
    };
  }

  return { url: envUrl, anonKey: envKey, usedFallback: false as const };
}
