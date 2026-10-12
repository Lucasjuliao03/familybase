import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { Colors } from '../src/theme';

export default function AuthConfirm() {
  const url = Linking.useURL();
  const router = useRouter();
  const handled = useRef(false);
  const [error,setError] = useState('');
  useEffect(() => {
    if (!url || handled.current) return;
    handled.current = true;
    void (async () => {
      const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1] || '');
      if (params.get('error')) throw new Error('A confirmação expirou. Volte ao cadastro e peça outro link.');
      const access_token = params.get('access_token'); const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) throw new Error('Abra o link recebido por e-mail e depois entre com seu e-mail e senha.');
      const result = await supabase.auth.setSession({ access_token,refresh_token });
      if (result.error || !result.data.user?.email_confirmed_at) throw new Error('Não foi possível confirmar. Peça outro link no cadastro.');
      router.replace('/register');
    })().catch(e => setError(e.message));
  }, [url,router]);
  return <View style={{ flex:1,backgroundColor:Colors.bg,justifyContent:'center',padding:28,gap:20 }}>{error ? <><Text accessibilityRole="alert">{error}</Text><PrimaryButton label="Voltar ao cadastro" onPress={() => router.replace('/register')} /></> : <><ActivityIndicator color={Colors.primary} /><Text style={{ textAlign:'center' }}>Confirmando seu e-mail…</Text></>}</View>;
}
