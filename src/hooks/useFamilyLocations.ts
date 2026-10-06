import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface FamilyLocationRow {
  id: string;
  user_id: string;
  device_id?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  updated_at: string;
  share_with_children: boolean;
  users?: { id?: string; name?: string; role?: string; display_color?: string; avatar_url?: string; avatar_preset?: string };
  device?: { device_type?: string; is_primary_location_device?: boolean; is_location_enabled?: boolean };
}

interface UseFamilyLocationsOptions {
  familyId?: string;
  enabled?: boolean;
  viewerUserId?: string;
  viewerRole?: string;
}

async function fetchLocationsFromDb(familyId: string): Promise<Map<string, FamilyLocationRow>> {
  const { data: devData } = await supabase
    .from('family_member_devices')
    .select('*')
    .eq('family_id', familyId);

  const devMap = new Map<string, any>();
  (devData || []).forEach((d) => devMap.set(d.device_id, d));

  const { data, error: qErr } = await supabase
    .from('family_locations')
    .select('*, users:user_id(id, name, email, avatar_url, avatar_preset, role, display_color)')
    .eq('family_id', familyId);

  if (qErr) throw new Error(qErr.message);

  const locMap = new Map<string, FamilyLocationRow>();
  (data || []).forEach((row: any) => {
    const devInfo = devMap.get(row.device_id);
    if (devInfo && devInfo.is_location_enabled === false) return;
    locMap.set(row.device_id || row.user_id, { ...row, device: devInfo });
  });

  return locMap;
}

export function useFamilyLocations({
  familyId,
  enabled = true,
  viewerUserId,
  viewerRole,
}: UseFamilyLocationsOptions) {
  const [locationsMap, setLocationsMap] = useState<Map<string, FamilyLocationRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyLocMap = useCallback((locMap: Map<string, FamilyLocationRow>) => {
    if (mountedRef.current) {
      setLocationsMap(locMap);
      setError(null);
    }
  }, []);

  const loadOnce = useCallback(async (fid: string, showLoader = false) => {
    if (showLoader && mountedRef.current) setLoading(true);
    try {
      const locMap = await fetchLocationsFromDb(fid);
      applyLocMap(locMap);
    } catch (e) {
      if (mountedRef.current) setError((e as Error).message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyLocMap]);

  const refresh = useCallback(async () => {
    if (!familyId) return;
    await loadOnce(familyId, false);
  }, [familyId, loadOnce]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !familyId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const teardown = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    (async () => {
      await loadOnce(familyId, true);
      if (cancelled) return;

      // Canal com nome único — evita reutilizar canal já subscrito (bug Supabase RN)
      const channel = supabase.channel(`fam-loc-${familyId}-${Date.now()}`);
      channelRef.current = channel;

      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'family_locations',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const row = payload.new as FamilyLocationRow;
          if (!row?.user_id) return;
          setLocationsMap((prev) => {
            const next = new Map(prev);
            const key = row.device_id || row.user_id;
            const existing = prev.get(key);
            next.set(key, {
              ...row,
              users: existing?.users || row.users,
              device: existing?.device,
            });
            return next;
          });
        },
      );

      channel.subscribe();

      // Polling de fallback (Expo Go / redes instáveis)
      pollRef.current = setInterval(() => {
        if (!cancelled && familyId) {
          loadOnce(familyId, false).catch(() => {});
        }
      }, 30_000);
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      teardown();
    };
  }, [familyId, enabled, loadOnce]);

  const locations = useMemo(() => {
    const byUser = new Map<string, FamilyLocationRow>();
    locationsMap.forEach((loc) => {
      const existing = byUser.get(loc.user_id);
      if (!existing) {
        byUser.set(loc.user_id, loc);
        return;
      }
      if (loc.device?.is_primary_location_device) {
        byUser.set(loc.user_id, loc);
      } else if (loc.device?.device_type === 'mobile' && existing.device?.device_type !== 'mobile') {
        byUser.set(loc.user_id, loc);
      }
    });

    const list = Array.from(byUser.values());
    if (viewerRole === 'child' && viewerUserId) {
      return list.filter((l) => l.user_id === viewerUserId || l.share_with_children !== false);
    }
    return list;
  }, [locationsMap, viewerRole, viewerUserId]);

  return { locations, loading, error, refresh };
}
