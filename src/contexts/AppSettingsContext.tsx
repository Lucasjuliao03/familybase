import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, Linking, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type AppSettings = { announcement: string; support_email: string; privacy_url: string; terms_url: string };
const empty: AppSettings = { announcement: '', support_email: '', privacy_url: '', terms_url: '' };
const Context = createContext({ settings: empty, refresh: async () => {} });
export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(empty);
  const refresh = useCallback(async () => {
    if (!user?.id) { setSettings(empty); return; }
    const { data, error } = await supabase.from('app_settings').select('announcement,support_email,privacy_url,terms_url').eq('id', true).single();
    if (!error && data) setSettings(data);
  }, [user?.id]);
  useEffect(() => { void refresh(); const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); }); return () => sub.remove(); }, [refresh]);
  return <Context.Provider value={{ settings, refresh }}>{children}</Context.Provider>;
}
export const useAppSettings = () => useContext(Context);
export function AppAnnouncement() {
  const { settings } = useAppSettings();
  if (!settings.announcement) return null;
  return <View accessibilityRole="alert" style={{ backgroundColor: '#e8f0ff', paddingHorizontal: 16, paddingVertical: 10 }}><Text style={{ color: '#223e72', fontSize: 13 }}>{settings.announcement}</Text></View>;
}
export function AppHelpLinks() {
  const { settings } = useAppSettings();
  const links = [
    { title: 'Suporte', url: settings.support_email ? 'mailto:' + settings.support_email : '' },
    { title: 'Política de privacidade', url: settings.privacy_url },
    { title: 'Termos de uso', url: settings.terms_url },
  ].filter(item => item.url);
  return <View style={{ gap: 10, marginVertical: 16 }}>{links.map(item => <TouchableOpacity key={item.title} accessibilityRole="link" onPress={() => { void Linking.openURL(item.url).catch(() => {}); }} style={{ padding: 12 }}><Text style={{ color: '#3348b8', fontWeight: '600' }}>{item.title}</Text></TouchableOpacity>)}</View>;
}

