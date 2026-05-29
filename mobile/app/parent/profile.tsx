import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { AvatarPicker } from '../../src/components/profile/AvatarPicker';
import { useAuth, userCanManageFamilyBilling } from '../../src/contexts/AuthContext';
import { useRouter } from 'expo-router';

export default function ParentProfileScreen() {
  const { user, family, isGestor, effectiveSubscription, logout, refreshProfile } = useAuth();
  const canBilling = userCanManageFamilyBilling(user, effectiveSubscription);
  const router = useRouter();

  const accessLabel = user?.access_profile === 'gestor' ? 'Gestor' : (user?.access_profile || 'Responsável');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Meu Perfil</Text>
        </View>

        <View style={styles.profileCard}>
          <AvatarPicker
            currentAvatarUrl={user?.avatar_url as string | undefined}
            currentPreset={user?.avatar_preset as string | undefined}
            name={user?.name}
            endpoint="/auth/avatar"
            size={88}
            onSave={() => refreshProfile()}
          />
          <Text style={styles.profileName}>{user?.name || 'Responsável'}</Text>
          <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>👨‍👩‍👧 {accessLabel}</Text>
          </View>
        </View>

        {isGestor && (
          <>
            <Text style={styles.sectionTitle}>Gestão</Text>
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => router.push('/parent/family-administration')}
              activeOpacity={0.85}
            >
              <Text style={styles.adminBtnIcon}>⚙️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.adminBtnTitle}>Administração da família</Text>
                <Text style={styles.adminBtnSub}>Módulos, membros, medalhas, aparência e mais</Text>
              </View>
              <Text style={styles.adminChevron}>›</Text>
            </TouchableOpacity>
            {canBilling && (
              <TouchableOpacity
                style={styles.adminBtn}
                onPress={() => router.push('/parent/billing')}
                activeOpacity={0.85}
              >
                <Text style={styles.adminBtnIcon}>💳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adminBtnTitle}>Assinatura e billing</Text>
                  <Text style={styles.adminBtnSub}>Plano, pagamentos e trial</Text>
                </View>
                <Text style={styles.adminChevron}>›</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Minha Família</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nome da Família</Text>
            <Text style={styles.infoValue}>{family?.name || 'Base Familiar'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Plano</Text>
            <Text style={[styles.infoValue, { color: Colors.primary, fontWeight: '800' }]}>
              {family?.subscription_status === 'active' ? 'Assinatura ativa' : 'Período de testes'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 45, paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  backBtnText: { fontSize: 24, color: Colors.primary, fontWeight: 'bold', marginTop: -4 },
  title: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  profileCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 24, ...Shadow.sm,
  },
  profileName: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginTop: 16 },
  profileEmail: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, marginBottom: 12 },
  roleBadge: {
    backgroundColor: Colors.primaryLighter, borderRadius: Radii.xs,
    paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border,
  },
  roleBadgeText: { color: Colors.primaryDark, fontSize: FontSize.xs, fontWeight: '700' },
  sectionTitle: {
    fontSize: FontSize.sm, fontWeight: '800', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12,
  },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 24, ...Shadow.sm,
  },
  adminBtnIcon: { fontSize: 24 },
  adminBtnTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  adminBtnSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  adminChevron: { fontSize: 22, color: Colors.textMuted, fontWeight: '700' },
  infoCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 32, ...Shadow.sm,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  infoValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '700' },
  logoutBtn: {
    backgroundColor: Colors.surface, borderRadius: Radii.md, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.danger, ...Shadow.sm,
  },
  logoutText: { color: Colors.danger, fontSize: FontSize.base, fontWeight: '800' },
});
