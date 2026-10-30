import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
const REFRESH_MS=5*60_000;

/**
 * Hook de geolocalização do browser.
 * - Captura posição via watchPosition
 * - Envia ao Supabase com throttle inteligente (distância OU tempo)
 * - Retorna { position, error, permissionDenied, sending }
 */
export function useGeolocation({ familyId, userId, enabled = true }) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(() => enabled && familyId && userId && typeof navigator !== 'undefined' && !navigator.geolocation ? 'Geolocalização não suportada neste browser.' : null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const lastSentRef = useRef({ lat: 0, lng: 0, ts: 0 });
  const watchIdRef = useRef(null);
  const sendingRef = useRef(false);
  const scopeRef=useRef(enabled?`${familyId}/${userId}`:'');
  useLayoutEffect(()=>{scopeRef.current=enabled?`${familyId}/${userId}`:'';},[enabled,familyId,userId]);
  const [previousInputs, setPreviousInputs] = useState({ enabled, familyId, userId });
  if (previousInputs.enabled !== enabled || previousInputs.familyId !== familyId || previousInputs.userId !== userId) {
    setPreviousInputs({ enabled, familyId, userId });
    setPosition(null);
    setError(enabled && familyId && userId && typeof navigator !== 'undefined' && !navigator.geolocation ? 'Geolocalização não suportada neste browser.' : null);
    setSending(false);
    setRefreshing(false);
  }
  useEffect(() => {
    lastSentRef.current = { lat: 0, lng: 0, ts: 0 };
    sendingRef.current = false;
  }, [enabled, familyId, userId]);

  const sendToSupabase = useCallback(
    async (lat, lng, accuracy, speed, heading, capturedAt) => {
      if (!familyId || !userId || sendingRef.current || scopeRef.current!==`${familyId}/${userId}` || (await supabase.auth.getSession()).data.session?.user.id!==userId) return;
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
        const existing=await supabase.from('family_member_devices').select('is_location_enabled').eq('family_id',familyId).eq('user_id',userId).eq('device_id',deviceId).maybeSingle();
        if(existing.error)throw existing.error;
        if(existing.data?.is_location_enabled===false||scopeRef.current!==`${familyId}/${userId}`)return;
        
        // Registrar/atualizar dispositivo (fire and forget ou await)
        const device=await supabase.from('family_member_devices').upsert({
          family_id: familyId,
          user_id: userId,
          device_id: deviceId,
          device_name: getDeviceName(),
          device_type: deviceType,
          last_seen_at: new Date().toISOString(),
          ...(!existing.data?{is_location_enabled:true,is_primary_location_device:deviceType==='mobile'}:{}),
        }, { onConflict: 'family_id,user_id,device_id' });
        if(device.error)throw device.error;

        if(scopeRef.current!==`${familyId}/${userId}` || (await supabase.auth.getSession()).data.session?.user.id!==userId)return;
        const row = {
          family_id: familyId,
          user_id: userId,
          device_id: deviceId,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
          speed: typeof speed==='number'&&speed>=0?speed:null,
          captured_at:new Date(capturedAt).toISOString(),battery_level:null,battery_charging:null,
          heading: heading ?? null,
          source: 'gps_v2',
          status: speed != null && speed > 1.5 ? 'moving' : 'home',
          updated_at: new Date().toISOString(),
        };
        const { error: upErr } = await supabase
          .from('family_locations')
          .upsert(row, { onConflict: 'family_id,user_id,device_id' });
        if (upErr) console.warn('[geo] upsert:', upErr.message);
        else if(scopeRef.current===`${familyId}/${userId}`)lastSentRef.current = { lat, lng, ts: now };
      } catch (e) {
        console.warn('[geo] send:', e);
      } finally {
        if(scopeRef.current===`${familyId}/${userId}`){sendingRef.current = false;setSending(false);}
      }
    },
    [familyId, userId],
  );

  useEffect(() => {
    if (!enabled || !familyId || !userId) return undefined;
    if (!navigator.geolocation) {
      return undefined;
    }

    const onSuccess = (pos) => {
      if(scopeRef.current!==`${familyId}/${userId}`)return;
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      setPosition({ lat: latitude, lng: longitude, accuracy, speed, heading, ts: pos.timestamp });
      setError(null);
      setPermissionDenied(false);
      sendToSupabase(latitude, longitude, accuracy, speed, heading,pos.timestamp);
    };

    const onError = (err) => {
      if(scopeRef.current!==`${familyId}/${userId}`)return;
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

  /**
   * Força uma atualização imediata da localização do usuário atual.
   * Ignora o throttle de distância/tempo e envia direto ao Supabase.
   * Retorna uma Promise que resolve quando a posição for obtida.
   */
  const forceRefresh = useCallback(() => {
    return new Promise((resolve, reject) => {
      const scope=`${familyId}/${userId}`;
      if(!familyId||!userId||scopeRef.current!==scope){resolve(null);return;}
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }
      setRefreshing(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if(scopeRef.current!==scope){resolve(null);return;}
          const { latitude, longitude, accuracy, speed, heading } = pos.coords;
          setPosition({ lat: latitude, lng: longitude, accuracy, speed, heading, ts: pos.timestamp });
          setError(null);
          setPermissionDenied(false);
          // Zera o throttle para forçar envio imediato
          lastSentRef.current = { lat: 0, lng: 0, ts: 0 };
          sendToSupabase(latitude, longitude, accuracy, speed, heading,pos.timestamp)
            .finally(() => {if(scopeRef.current===scope)setRefreshing(false);});
          resolve({ lat: latitude, lng: longitude, accuracy });
        },
        (err) => {
          if(scopeRef.current!==scope){resolve(null);return;}
          setRefreshing(false);
          if (err.code === 1) {
            setPermissionDenied(true);
            setError('Permissão de localização negada.');
          } else {
            setError('Não foi possível obter a localização.');
          }
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [sendToSupabase, familyId, userId]);

  useEffect(()=>{
    if(!enabled||!familyId||!userId)return;
    const check=async()=>{const {data}=await supabase.from('family_location_refresh_requests').select('id').eq('family_id',familyId).eq('target_user_id',userId).is('completed_at',null).gt('expires_at',new Date().toISOString()).limit(1);if(data?.length&&scopeRef.current===`${familyId}/${userId}`)await forceRefresh().catch(()=>{});};
    const channel=supabase.channel('web-location-request-'+userId+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'family_location_refresh_requests',filter:'target_user_id=eq.'+userId},()=>void check()).subscribe();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void forceRefresh().catch(()=>{});},REFRESH_MS);
    return()=>{clearInterval(timer);void supabase.removeChannel(channel);};
  },[enabled,familyId,userId,forceRefresh]);
  return { position, error, permissionDenied, sending, refreshing, forceRefresh };
}
