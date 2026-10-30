import { supabase } from '../lib/supabase';
import { emitWebEvent } from '../lib/webTelemetry';
export async function webAdmin(section = 'access', payload = {}) {
  const rpc = section === 'settings' ? 'web_admin_settings' : section === 'save_settings' ? 'web_update_settings' : section === 'payments' ? 'web_play_payments' : 'web_admin';
  const args = section === 'settings' ? {} : ['save_settings','payments'].includes(section) ? { p_payload: payload } : { p_section: section, p_payload: payload };
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw new Error(error.message || 'Não foi possível concluir a operação administrativa.');
  if (data == null) throw new Error('O servidor não confirmou a operação.');
  return data;
}
export function recordWebEvent(kind, route, duration) {
  return emitWebEvent(supabase, kind, route, duration);
}
