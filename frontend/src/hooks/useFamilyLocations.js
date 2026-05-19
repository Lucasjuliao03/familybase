import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook de localizações da família em tempo real (Multi-Device).
 */
export function useFamilyLocations({ familyId, enabled = true }) {
  const [locations, setLocations] = useState(new Map());
  const [devices, setDevices] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const channelRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchInitial = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      // 1. Buscar devices
      const { data: devData } = await supabase
        .from('family_member_devices')
        .select('*')
        .eq('family_id', familyId);
      
      const devMap = new Map();
      (devData || []).forEach(d => devMap.set(d.device_id, d));
      if (mountedRef.current) setDevices(devMap);

      // 2. Buscar locations com users
      const { data, error: qErr } = await supabase
        .from('family_locations')
        .select('*, users:user_id(id, name, email, avatar_url, avatar_preset, role, display_color)')
        .eq('family_id', familyId);
      
      if (qErr) throw new Error(qErr.message);
      
      if (!mountedRef.current) return;
      const locMap = new Map();
      (data || []).forEach((row) => {
        // Vincula a info do device se existir
        const devInfo = devMap.get(row.device_id);
        locMap.set(row.device_id, { ...row, device: devInfo });
      });
      setLocations(locMap);
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
          if (!row?.device_id) return;
          
          setLocations((prev) => {
            const next = new Map(prev);
            const existing = prev.get(row.device_id);
            
            // Reutiliza users data se já tínhamos, senao vai sem
            let usersData = existing?.users || row.users;
            let deviceData = existing?.device;

            const nextRow = { ...row, users: usersData, device: deviceData };
            next.set(row.device_id, nextRow);

            // Fetch fallback se faltar user info (como no fix anterior)
            if (!usersData) {
              supabase
                .from('users')
                .select('id, name, email, avatar_url, avatar_preset, role, display_color')
                .eq('id', row.user_id)
                .single()
                .then(({ data: userData }) => {
                  if (userData && mountedRef.current) {
                    setLocations((currentMap) => {
                      const updatedMap = new Map(currentMap);
                      const currentLoc = updatedMap.get(row.device_id);
                      if (currentLoc) {
                        updatedMap.set(row.device_id, { ...currentLoc, users: userData });
                      }
                      return updatedMap;
                    });
                  }
                });
            }

            // Fetch fallback se faltar device info
            if (!deviceData) {
              supabase
                .from('family_member_devices')
                .select('*')
                .eq('device_id', row.device_id)
                .single()
                .then(({ data: dData }) => {
                  if (dData && mountedRef.current) {
                    setLocations((currentMap) => {
                      const updatedMap = new Map(currentMap);
                      const currentLoc = updatedMap.get(row.device_id);
                      if (currentLoc) {
                        updatedMap.set(row.device_id, { ...currentLoc, device: dData });
                      }
                      return updatedMap;
                    });
                  }
                });
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
