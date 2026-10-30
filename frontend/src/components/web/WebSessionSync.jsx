import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { recordWebEvent } from '../../services/webAdmin';

export default function WebSessionSync() {
  const client = useQueryClient();
  const { user, family, fetchMe } = useAuth();
  const { pathname } = useLocation();
  const identity = useRef(undefined);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id || null;
      if (next !== identity.current) { client.clear(); identity.current = next; }
    });
    return () => subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (!user?.id || !family?.id) return;
    const channel = supabase.channel(`web-context-${user.id}-${family.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'families', filter: `id=eq.${family.id}` }, () => { fetchMe(); client.invalidateQueries(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_modules', filter: `family_id=eq.${family.id}` }, () => { fetchMe(); client.invalidateQueries(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, family?.id, fetchMe, client]);
  useEffect(() => {
    let active = true;
    const uid = user?.id;
    if (!uid) return;
    supabase.auth.getUser().then(({ data }) => {
      const navigation=performance.getEntriesByType('navigation')[0];
      if (active && data.user?.id === uid) recordWebEvent('page_load', pathname.split('/')[1], navigation?.duration>0 ? navigation.duration : undefined);
    });
    return () => { active = false; };
  }, [pathname, user?.id]);
  useEffect(() => {
    const node = document.createElement('meta'); node.name = 'robots'; node.content = 'noindex,nofollow';
    document.head.append(node);
    return () => node.remove();
  }, []);
  return null;
}
