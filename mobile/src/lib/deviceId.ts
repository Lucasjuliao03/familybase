import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'familia_device_id';

function randomId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `mob_${randomId()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceType(): 'mobile' {
  return 'mobile';
}

export function getDeviceName(): string {
  return Platform.OS === 'ios' ? 'iPhone/iPad' : 'Android';
}
