import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { getDeviceId, getDeviceName, getDeviceType } from '../lib/deviceId';
import { saveLocationContext, LOCATION_TASK } from '../lib/locationBackgroundTask';

const isExpoGo = Constants.appOwnership === 'expo';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MIN_DISTANCE_M = 20;
const MIN_INTERVAL_MS = 30_000;

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  ts: number;
}

interface UseGeolocationOptions {
  familyId?: string;
  userId?: string;
  enabled?: boolean;
  shareWithChildren?: boolean;
}

export function useGeolocation({
  familyId,
  userId,
  enabled = true,
  shareWithChildren = true,
}: UseGeolocationOptions) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const lastSentRef = useRef({ lat: 0, lng: 0, ts: 0 });
  const sendingRef = useRef(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const shareRef = useRef(shareWithChildren);
  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    shareRef.current = shareWithChildren;
  }, [shareWithChildren]);

  const sendToSupabase = useCallback(
    async (lat: number, lng: number, accuracy?: number | null, speed?: number | null, heading?: number | null, force = false) => {
      if (!familyId || !userId || sendingRef.current) return;
      const last = lastSentRef.current;
      const now = Date.now();
      const dist = last.lat ? haversineMeters(last.lat, last.lng, lat, lng) : Infinity;
      const elapsed = now - last.ts;

      if (!force && dist < MIN_DISTANCE_M && elapsed < MIN_INTERVAL_MS) return;

      sendingRef.current = true;
      setSending(true);
      try {
        const deviceId = await getDeviceId();
        await supabase.from('family_member_devices').upsert({
          family_id: familyId,
          user_id: userId,
          device_id: deviceId,
          device_name: getDeviceName(),
          device_type: getDeviceType(),
          last_seen_at: new Date().toISOString(),
          is_location_enabled: true,
          is_primary_location_device: true,
        }, { onConflict: 'family_id,user_id,device_id' });

        const { error: upErr } = await supabase.from('family_locations').upsert({
          family_id: familyId,
          user_id: userId,
          device_id: deviceId,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
          speed: speed ?? null,
          heading: heading ?? null,
          source: 'gps',
          share_with_children: shareRef.current,
          status: speed != null && speed > 1.5 ? 'moving' : 'home',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'family_id,user_id,device_id' });

        if (!upErr) lastSentRef.current = { lat, lng, ts: now };
      } catch (e) {
        console.warn('[geo] send:', e);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [familyId, userId],
  );

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setPermissionReady(false);
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        setPermissionDenied(true);
        setPermissionGranted(false);
        setPermissionReady(true);
        setError('Permissão de localização negada.');
        return false;
      }

      setPermissionDenied(false);
      setPermissionGranted(true);
      setPermissionReady(true);

      // Background não funciona no Expo Go Android — só em dev build
      const canUseBackground = !(isExpoGo && Platform.OS === 'android');
      if (canUseBackground) {
        try {
          const { status: bg } = await Location.requestBackgroundPermissionsAsync();
          if (bg === 'granted' && familyId && userId) {
            await saveLocationContext({ familyId, userId, shareWithChildren: shareRef.current });
            const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
            if (!started) {
              await Location.startLocationUpdatesAsync(LOCATION_TASK, {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 30_000,
                distanceInterval: 50,
                foregroundService: Platform.OS === 'android' ? {
                  notificationTitle: 'FamilyBase — Localização',
                  notificationBody: 'Compartilhando localização com a família',
                } : undefined,
                pausesUpdatesAutomatically: false,
                showsBackgroundLocationIndicator: true,
              }).catch((e) => console.warn('[Location] BG start failed:', e));
            }
          }
        } catch {
          // Foreground é suficiente no Expo Go
        }
      }

      return true;
    } catch (e) {
      console.warn('[Location] permission error:', e);
      setPermissionReady(true);
      setError('Não foi possível obter permissão de localização.');
      return false;
    }
  }, [familyId, userId]);

  const forceRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const { latitude, longitude, accuracy, speed, heading } = loc.coords;
      setPosition({ lat: latitude, lng: longitude, accuracy, speed, heading, ts: Date.now() });
      setError(null);
      setPermissionDenied(false);
      setPermissionGranted(true);
      lastSentRef.current = { lat: 0, lng: 0, ts: 0 };
      await sendToSupabase(latitude, longitude, accuracy, speed, heading, true);
      return { lat: latitude, lng: longitude, accuracy };
    } catch (e) {
      setError('Não foi possível obter a localização.');
      throw e;
    } finally {
      setRefreshing(false);
    }
  }, [sendToSupabase]);

  useEffect(() => {
    if (!enabled || !familyId || !userId) return undefined;

    let cancelled = false;

    (async () => {
      const granted = await requestPermissions();
      if (cancelled || !granted) return;

      await saveLocationContext({ familyId, userId, shareWithChildren: shareRef.current });

      try {
        await forceRefresh();
      } catch {
        // watchPosition pode funcionar mesmo se getCurrentPosition falhar
      }

      if (cancelled) return;

      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 15_000, distanceInterval: 20 },
        (loc) => {
          const { latitude, longitude, accuracy, speed, heading } = loc.coords;
          setPosition({ lat: latitude, lng: longitude, accuracy, speed, heading, ts: Date.now() });
          setError(null);
          sendToSupabase(latitude, longitude, accuracy, speed, heading);
        },
      );
    })();

    const channel = supabase.channel(`location_updates:${familyId}`);
    broadcastRef.current = channel;
    channel.on('broadcast', { event: 'force_update' }, async (payload) => {
      if (payload.payload?.user_id === userId) {
        try { await forceRefresh(); } catch { /* noop */ }
      }
    }).subscribe();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
      if (broadcastRef.current) {
        supabase.removeChannel(broadcastRef.current);
        broadcastRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, familyId, userId]);

  useEffect(() => {
    if (familyId && userId) {
      saveLocationContext({ familyId, userId, shareWithChildren });
    }
  }, [familyId, userId, shareWithChildren]);

  return {
    position,
    error,
    permissionDenied,
    permissionGranted,
    permissionReady,
    sending,
    refreshing,
    requestPermissions,
    forceRefresh,
  };
}

/** Envia pedido de actualização GPS para um membro da família */
export function sendLocationForceUpdate(familyId: string, targetUserId: string): void {
  supabase.channel(`location_updates:${familyId}`).send({
    type: 'broadcast',
    event: 'force_update',
    payload: { user_id: targetUserId },
  });
}
