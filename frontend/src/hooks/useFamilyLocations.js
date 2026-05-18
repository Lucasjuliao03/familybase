import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook de localizações da família em tempo real.
 * - Carrega posições iniciais da tabela family_locations
 * - Subscreve Realtime (INSERT + UPDATE) filtrado por family_id
 * - Retorna { locations: Map<userId, locationRow>, loading, error, refresh }
 */
export function useFamilyLocations({ familyId, enabled = true }) {
  const [locations, setLocations] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchInitial = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from('family_locations')
        .select('*, users:user_id(id, name, email, avatar_url, avatar_preset, role, display_color)')
        .eq('family_id', familyId);
      if (qErr) throw new Error(qErr.message);
      if (!mountedRef.current) return;
      const map = new Map();
      (data || []).forEach((row) => {
        map.set(row.user_id, row);
      });
      setLocations(map);
      setError(null);
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [familyId]);

  // Subscribe to Realtime
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !familyId) {
      setLoading(false);
      return undefined;
    }

    fetchInitial();

    // Create Realtime channel
    const channel = supabase
      .channel(`family-locations-${familyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'family_locations',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const row = payload.new;
          if (!row?.user_id) return;
          setLocations((prev) => {
            const next = new Map(prev);
            const existing = prev.get(row.user_id);
            
            if (existing?.users && !row.users) {
              next.set(row.user_id, { ...row, users: existing.users });
            } else {
              next.set(row.user_id, row);
              // If it's a completely new row without users relation, fetch it asynchronously
              if (!existing?.users && !row.users) {
                supabase
                  .from('users')
                  .select('id, name, email, avatar_url, avatar_preset, role, display_color')
                  .eq('id', row.user_id)
                  .single()
                  .then(({ data: userData }) => {
                    if (userData && mountedRef.current) {
                      setLocations((currentMap) => {
                        const updatedMap = new Map(currentMap);
                        const currentLoc = updatedMap.get(row.user_id);
                        if (currentLoc) {
                          updatedMap.set(row.user_id, { ...currentLoc, users: userData });
                        }
                        return updatedMap;
                      });
                    }
                  });
              }
            }
            return next;
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      mountedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [familyId, enabled, fetchInitial]);

  const refresh = useCallback(() => {
    fetchInitial();
  }, [fetchInitial]);

  return { locations, loading, error, refresh };
}
