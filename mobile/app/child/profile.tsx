import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { AvatarPicker } from '../../src/components/profile/AvatarPicker';
import { useAuth } from '../../src/contexts/AuthContext';
import { useRouter } from 'expo-router';
import api from '../../src/services/api';

export default function ChildProfileScreen() {
  const { user, family, childProfile, logout, refreshProfile } = useAuth();
  const router = useRouter();

  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleUpdatePassword = async () => {
    if (newPassword.length < 4) {
      return Alert.alert('Erro', 'A senha deve ter pelo menos 4 caracteres.');
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert('Erro', 'As senhas não coincidem.');
    }
    setPwLoading(true);
    try {
      await api.put('/auth/password', { newPassword });
      Alert.alert('Sucesso', 'Senha atualizada com sucesso!');
      setPwModalVisible(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao atualizar senha.');
    } finally {
      setPwLoading(false);
    }
  };

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

        <Text style={styles.sectionTitle}>Segurança</Text>
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={() => setPwModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.adminBtnIcon}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminBtnTitle}>Alterar minha senha</Text>
            <Text style={styles.adminBtnSub}>Mantenha sua conta segura redefinindo sua senha</Text>
          </View>
          <Text style={styles.adminChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={pwModalVisible} transparent animationType="fade" onRequestClose={() => setPwModalVisible(false)}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Alterar Senha</Text>
              <TouchableOpacity onPress={() => setPwModalVisible(false)}>
                <Text style={modalStyles.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={modalStyles.body}>
              <Text style={modalStyles.label}>Nova Senha</Text>
              <TextInput
                style={modalStyles.input}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Digite a nova senha"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={modalStyles.label}>Confirmar Nova Senha</Text>
              <TextInput
                style={modalStyles.input}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirme a nova senha"
                placeholderTextColor={Colors.textMuted}
              />
              <View style={modalStyles.row}>
                <TouchableOpacity style={[modalStyles.btn, modalStyles.btnGhost]} onPress={() => setPwModalVisible(false)}>
                  <Text style={modalStyles.btnGhostText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[modalStyles.btn, modalStyles.btnPrimary]} onPress={handleUpdatePassword} disabled={pwLoading}>
                  {pwLoading ? <ActivityIndicator color="#fff" /> : <Text style={modalStyles.btnText}>Salvar</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 24, ...Shadow.sm,
  },
  adminBtnIcon: { fontSize: 24 },
  adminBtnTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  adminBtnSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  adminChevron: { fontSize: 22, color: Colors.textMuted, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, flex: 1 },
  close: { fontSize: 20, color: Colors.textSecondary, padding: 4 },
  body: { padding: 16, paddingBottom: 28 },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm, backgroundColor: Colors.bg, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: Radii.md, alignItems: 'center' },
  btnGhost: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  btnPrimary: { backgroundColor: Colors.primary },
  btnText: { fontWeight: '800', color: Colors.white },
  btnGhostText: { fontWeight: '700', color: Colors.textSecondary },
});
