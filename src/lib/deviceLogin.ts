import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createRememberedLoginStore } from './rememberedLogin';

export const canRememberDeviceLogin = Platform.OS === 'android' || Platform.OS === 'ios';
export const deviceLogin = createRememberedLoginStore({
  getItem: async key => canRememberDeviceLogin ? SecureStore.getItemAsync(key) : null,
  setItem: async (key, value) => {
    if (!canRememberDeviceLogin) return;
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  removeItem: async key => { if (canRememberDeviceLogin) await SecureStore.deleteItemAsync(key); },
});
