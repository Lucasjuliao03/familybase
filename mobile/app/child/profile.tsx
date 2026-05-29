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
import { useAuth } from '../../src/contexts/AuthContext';
import { useRouter } from 'expo-router';

export default function ChildProfileScreen() {
  const { user, family, childProfile, logout, refreshProfile } = useAuth();
  const router = useRouter();

  const displayName = childProfile?.name || user?.name || 'Criança';
  const childEndpoint = childProfile?.id
    ? `/auth/avatar/child/${childProfile.id}`
    : '/auth/avatar';

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
            currentAvatarUrl={childProfile?.avatar_url}
            currentPreset={childProfile?.avatar_preset}
            name={displayName}
            endpoint={childEndpoint}
            size={88}
            onSave={() => refreshProfile()}
          />
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>🏅 Filho(a) · Nível {childProfile?.level ?? 1}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Minha Família</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nome da Família</Text>
            <Text style={styles.infoValue}>{family?.name || 'Base Familiar'}</Text>
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
