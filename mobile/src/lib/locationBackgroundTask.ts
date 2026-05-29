import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export const LOCATION_TASK = 'background-location-task';
const LOCATION_CTX_KEY = 'familia_location_ctx';

export interface LocationContext {
  familyId: string;
  userId: string;
  shareWithChildren: boolean;
}

export async function saveLocationContext(ctx: LocationContext): Promise<void> {
  await AsyncStorage.setItem(LOCATION_CTX_KEY, JSON.stringify(ctx));
}

export async function loadLocationContext(): Promise<LocationContext | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CTX_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocationContext;
  } catch {
    return null;
  }
}

async function persistBackgroundLocation(
  latitude: number,
  longitude: number,
  accuracy?: number | null,
  speed?: number | null,
  heading?: number | null,
): Promise<void> {
  const ctx = await loadLocationContext();
  if (!ctx?.familyId || !ctx.userId) return;

  const deviceId = `mob_${ctx.userId.substring(0, 8)}`;

  await supabase.from('family_member_devices').upsert({
    family_id: ctx.familyId,
    user_id: ctx.userId,
    device_id: deviceId,
    device_name: 'Celular Mobile',
    device_type: 'mobile',
    last_seen_at: new Date().toISOString(),
    is_location_enabled: true,
    is_primary_location_device: true,
  }, { onConflict: 'family_id,user_id,device_id' });

  await supabase.from('family_locations').upsert({
    family_id: ctx.familyId,
    user_id: ctx.userId,
    device_id: deviceId,
    latitude,
    longitude,
    accuracy: accuracy ?? 10,
    speed: speed ?? 0,
    heading: heading ?? 0,
    source: 'gps',
    share_with_children: ctx.shareWithChildren,
    status: (speed ?? 0) > 1.5 ? 'moving' : 'home',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'family_id,user_id,device_id' });
}

// Registo global — importar uma vez no _layout raiz
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[BG Location]', error);
      return;
    }
    const locations = (data as { locations?: { coords: { latitude: number; longitude: number; accuracy?: number; speed?: number; heading?: number } }[] })?.locations;
    if (!locations?.length) return;
    const loc = locations[0].coords;
    try {
      await persistBackgroundLocation(
        loc.latitude,
        loc.longitude,
        loc.accuracy,
        loc.speed,
        loc.heading,
      );
    } catch (e) {
      console.warn('[BG Location] persist error:', e);
    }
  });
}
