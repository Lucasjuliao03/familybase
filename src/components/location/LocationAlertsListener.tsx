import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

/** Shows newly persisted location and health alerts while an adult has the app open. */
export function LocationAlertsListener() {
  const { user } = useAuth();
  const seen = useRef(new Set<string>());
  const since = useRef(new Date().toISOString());

  useEffect(() => {
    if (!user?.id || !user.family_id || !['parent', 'master'].includes(user.role)) return;
    const recipientId = user.id;
    const familyId = user.family_id;
    let active = true;

    const show = (row: any) => {
      if (!active || !row?.id || seen.current.has(row.id)) return;
      if (row.user_id !== recipientId || !['zone_enter', 'zone_exit', 'health_symptom'].includes(row.type)) return;
      seen.current.add(row.id);
      Alert.alert(row.title || 'Alerta da família', row.message || 'Há uma nova informação da família.');
    };
    const check = async () => {
      const { data } = await supabase.from('notifications')
        .select('id,user_id,title,message,type,created_at')
        .eq('family_id', familyId).eq('user_id', recipientId)
        .in('type', ['zone_enter', 'zone_exit', 'health_symptom'])
        .gt('created_at', since.current)
        .order('created_at', { ascending: true }).limit(20);
      (data || []).forEach(show);
    };
    const channel = supabase.channel(`zone-alerts-${recipientId}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${recipientId}` },
        (payload) => show(payload.new))
      .subscribe();
    const timer = setInterval(() => { void check(); }, 30_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      active = false;
      clearInterval(timer);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [user?.id, user?.family_id, user?.role]);
  return null;
}
