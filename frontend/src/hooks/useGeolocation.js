import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getDeviceId, getDeviceType, getDeviceName } from '../lib/device';

/**
 * Distância Haversine em metros entre dois pontos (lat/lng em graus).
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MIN_DISTANCE_M = 20;
const MIN_INTERVAL_MS = 30_000;

/**
 * Hook de geolocalização do browser.
 * - Captura posição via watchPosition
 * - Envia ao Supabase com throttle inteligente (distância OU tempo)
 * - Retorna { position, error, permissionDenied, sending }
 */
export function useGeolocation({ familyId, userId, enabled = true }) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sending, setSending] = useState(false);

  const lastSentRef = useRef({ lat: 0, lng: 0, ts: 0 });
  const watchIdRef = useRef(null);
  const sendingRef = useRef(false);

  const sendToSupabase = useCallback(
    async (lat, lng, accuracy, speed, heading) => {
      if (!familyId || !userId || sendingRef.current) return;
      const last = lastSentRef.current;
      const now = Date.now();
      const dist = last.lat ? haversineMeters(last.lat, last.lng, lat, lng) : Infinity;
      const elapsed = now - last.ts;

      if (dist < MIN_DISTANCE_M && elapsed < MIN_INTERVAL_MS) return;

      sendingRef.current = true;
      setSending(true);
      try {
        const deviceId = getDeviceId();
        const deviceType = getDeviceType();
        
        // Registrar/atualizar dispositivo (fire and forget ou await)
        await supabase.from('family_member_devices').upsert({
          family_id: familyId,
          user_id: userId,
          device_id: deviceId,
          device_name: getDeviceName(),
          device_type: deviceType,
          last_seen_at: new Date().toISOString(),
          is_primary_location_device: deviceType === 'mobile', // Celular tem prioridade
        }, { onConflict: 'family_id,user_id,device_id' });

        const row = {
          family_id: familyId,
          user_id: userId,
          device_id: deviceId,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
          speed: speed ?? null,
          heading: heading ?? null,
          source: (deviceType !== 'mobile' && accuracy > 1000) ? 'approximate' : 'gps',
          status: speed != null && speed > 1.5 ? 'moving' : 'home',
          updated_at: new Date().toISOString(),
        };
        const { error: upErr } = await supabase
          .from('family_locations')
          .upsert(row, { onConflict: 'family_id,user_id,device_id' });
        if (upErr) console.warn('[geo] upsert:', upErr.message);
        else lastSentRef.current = { lat, lng, ts: now };
      } catch (e) {
        console.warn('[geo] send:', e);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [familyId, userId],
  );

  useEffect(() => {
    if (!enabled || !familyId || !userId) return undefined;
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada neste browser.');
      return undefined;
    }

    const onSuccess = (pos) => {
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      setPosition({ lat: latitude, lng: longitude, accuracy, speed, heading, ts: Date.now() });
      setError(null);
      setPermissionDenied(false);
      sendToSupabase(latitude, longitude, accuracy, speed, heading);
    };

    const onError = (err) => {
      if (err.code === 1) {
        setPermissionDenied(true);
        setError('Permissão de localização negada.');
      } else if (err.code === 2) {
        setError('Posição indisponível.');
      } else {
        setError('Tempo esgotado ao obter localização.');
      }
    };

    const opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, opts);

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, familyId, userId, sendToSupabase]);

  return { position, error, permissionDenied, sending };
}
