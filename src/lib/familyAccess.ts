import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeFamilyCode, normalizeUsername } from './familyIdentity.js';

export type FamilyAccessMember = {
  id: string; family_id: string; name: string; role: 'child' | 'parent' | 'relative'; username: string;
};

export function scopedAccessMembers(rows: unknown, familyId: string): FamilyAccessMember[] {
  if (!familyId || !Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const username = normalizeUsername(row?.username);
    if (row?.family_id !== familyId || row?.status !== 'active' || !row?.id || !username
      || !['child', 'parent', 'relative'].includes(row.role)) return [];
    // A whitelist keeps email aliases and credentials out of the sharing UI.
    return [{ id: String(row.id), family_id: familyId, name: String(row.name || 'Membro'), role: row.role, username }];
  });
}

export async function loadFamilyAccessMembers(client: SupabaseClient, familyId: string, familyCode: string) {
  if (!familyId || !normalizeFamilyCode(familyCode)) throw new Error('O código da família ainda não está disponível.');
  // Authenticated RLS remains authoritative; this query never uses a privileged key.
  const { data, error } = await client.from('users')
    .select('id,family_id,name,role,username,status')
    .eq('family_id', familyId).eq('status', 'active').in('role', ['child', 'parent', 'relative']).order('name');
  if (error) throw new Error('Não foi possível carregar os acessos. Tente novamente.');
  return scopedAccessMembers(data, familyId);
}
