import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar,
} from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors, Radii, FontSize, Shadow } from '../src/theme';

export default function BillingWaitGestorScreen() {
  const { logout, user } = useAuth();

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" />
      <View style={s.card}>
        <Text style={s.icon}>📋</Text>
        <Text style={s.title}>Assinatura a cargo do gestor</Text>
        <Text style={s.desc}>
          O período experimental terminou ou a assinatura da família precisa ser renovada.
          Este acesso só pode ser libertado pelo gestor financeiro da família.
        </Text>
        <Text style={s.desc}>
          Peça ao gestor para iniciar sessão e concluir a assinatura. Um único pagamento cobre todos os membros.
        </Text>
        <TouchableOpacity style={s.ghostBtn} onPress={() => logout()}>
          <Text style={s.ghostText}>Sair da conta</Text>
        </TouchableOpacity>
        {user?.role === 'child' && (
          <Text style={s.note}>Conta: {user.email}</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gradStart, justifyContent: 'center', padding: 24, paddingTop: Platform.OS === 'ios' ? 56 : 36 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: 28, ...Shadow.lg },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 12 },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 10 },
  ghostBtn: { marginTop: 20, paddingVertical: 14, borderRadius: Radii.lg, backgroundColor: Colors.bg, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  ghostText: { fontWeight: '700', color: Colors.textSecondary, fontSize: FontSize.sm },
  note: { marginTop: 16, fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
});
