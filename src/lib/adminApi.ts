import { supabase } from './supabase';
export async function adminRequest(action = 'snapshot', payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('app_admin', { p_action: action, p_payload: payload });
  if (error) throw new Error(error.message);
  return data;
}

