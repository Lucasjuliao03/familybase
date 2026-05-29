import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Radii, FontSize } from '../../theme';

/**
 * Faixa fixa no topo, visível em TODAS as telas do filho enquanto o pai está a
 * atuar como o filho (modo proxy). Indica claramente o estado e oferece o botão
 * "Voltar ao perfil do pai" (requisitos 4 e 5).
 */
export function ChildProxyBanner() {
  const router = useRouter();
  const { isChildProxy, actingAsChild, user, exitChildProxy } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!isChildProxy) return null;

  const childName = actingAsChild?.name?.split(' ')[0] || actingAsChild?.name || 'filho';
  const parentName = user?.name?.split(' ')[0] || 'pai';

  const handleExit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exitChildProxy();
      router.replace('/parent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.bar}>
      <View style={s.left}>
        <View style={s.dot} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>Modo filho · {childName}</Text>
          <Text style={s.sub} numberOfLines={1}>
            Ações registadas em {childName} por {parentName}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={s.btn} onPress={handleExit} disabled={busy} activeOpacity={0.85}>
        {busy ? (
          <ActivityIndicator color={Colors.primaryDark} size="small" />
        ) : (
          <Text style={s.btnText}>Voltar ao pai</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: '#1E0B4B',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FBBF24' },
  title: { color: '#fff', fontSize: FontSize.xs + 1, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', marginTop: 1 },
  btn: {
    backgroundColor: '#fff',
    borderRadius: Radii.full,
    paddingVertical: 7,
    paddingHorizontal: 14,
    minWidth: 96,
    alignItems: 'center',
  },
  btnText: { color: Colors.primaryDark, fontSize: FontSize.xs, fontWeight: '800' },
});
