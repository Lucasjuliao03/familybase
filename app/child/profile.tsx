import React, { useState } from 'react';
import { AppHelpLinks } from '../../src/contexts/AppSettingsContext';
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
  Image,
} from 'react-native';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import { useAuth } from '../../src/contexts/AuthContext';
import { useRouter } from 'expo-router';
import api from '../../src/services/api';
import { USER_DISPLAY_COLOR_PALETTE, normalizeHex } from '../../src/shared/lib/userDisplayColors';
import { getMascot, MASCOTS } from '../../src/lib/mascotCatalog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChildProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, family, childProfile, logout, refreshProfile } = useAuth();
  const router = useRouter();

  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      return Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres.');
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
  const childColor = selectedColor || normalizeHex(childProfile?.color) || Colors.primary;
  const selectedMascot = getMascot(childProfile?.mascot_id);

  const chooseColor = async (color: string) => {
    if (!childProfile?.id || colorSaving || color === childColor) return;
    setColorSaving(true);
    try {
      await api.put('/children/me/color', { child_id: childProfile.id, color });
      setSelectedColor(color);
      await refreshProfile();
    } catch (err: any) {
      Alert.alert('Não foi possível salvar a cor', err?.message || 'Tente novamente.');
    } finally {
      setColorSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 18, 45) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Meu Perfil</Text>
        </View>

        <View style={styles.profileCard}>
          <TouchableOpacity
            onPress={() => router.push('/child/avatar' as any)}
            accessibilityRole="button"
            accessibilityLabel="Escolher meu avatar"
            activeOpacity={0.85}
            style={styles.avatarAction}
          >
            <UserAvatar
              avatarUrl={childProfile?.avatar_url}
              avatarPreset={childProfile?.avatar_preset}
              name={displayName}
              size={88}
              ringColor={childColor}
            />
            <View style={styles.avatarEditBadge}><Text style={styles.avatarEditText}>✎</Text></View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Toque no avatar para escolher seu visual</Text>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>🏅 Filho(a) · Nível {childProfile?.level ?? 1}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Meu mascote</Text>
        <TouchableOpacity
          style={[styles.mascotCard, { backgroundColor: selectedMascot?.softBackground || '#FFF4F7' }]}
          onPress={() => router.push('/child/mascot' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={selectedMascot ? `Trocar mascote ${selectedMascot.name}` : 'Escolher meu mascote'}
        >
          <Image source={(selectedMascot || MASCOTS[0]).thumbnail} style={styles.mascotImage} resizeMode="contain" />
          <View style={styles.mascotTextGroup}>
            <Text style={styles.mascotTitle}>{selectedMascot ? `${selectedMascot.name} é seu companheiro!` : 'Escolha seu companheiro'}</Text>
            <Text style={styles.mascotHint}>{selectedMascot ? 'Toque para conhecer e trocar de mascote' : 'Conheça Lili, Tobe, Pipo e Luca'}</Text>
          </View>
          <Text style={styles.mascotArrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Minha cor</Text>
        <View style={styles.colorCard}>
          <Text style={styles.colorHint}>Escolha a cor que vai identificar você no mapa, agenda e cartões da família.</Text>
          <View style={styles.colorGrid}>
            {USER_DISPLAY_COLOR_PALETTE.map((color) => (
              <TouchableOpacity
                key={color}
                accessibilityRole="button"
                accessibilityLabel={`Escolher cor ${color}`}
                accessibilityState={{ selected: childColor === color, disabled: colorSaving }}
                disabled={colorSaving}
                onPress={() => chooseColor(color)}
                style={[styles.colorSwatch, { backgroundColor: color }, childColor === color && styles.colorSelected]}
              >
                {childColor === color ? <Text style={styles.colorCheck}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
          {colorSaving ? <ActivityIndicator color={childColor} /> : null}
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
        <AppHelpLinks />
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
  avatarAction: { alignItems: 'center', justifyContent: 'center' },
  avatarEditBadge: { position: 'absolute', right: -4, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, borderWidth: 2, borderColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  avatarEditText: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  avatarHint: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 10 },
  profileName: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginTop: 16 },
  profileEmail: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, marginBottom: 12 },
  colorCard: { backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  mascotCard: { flexDirection: 'row', alignItems: 'center', borderRadius: Radii.md, padding: 12, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  mascotImage: { width: 60, height: 60 },
  mascotTextGroup: { flex: 1, marginLeft: 10 },
  mascotTitle: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '900' },
  mascotHint: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 3 },
  mascotArrow: { color: Colors.textSecondary, fontSize: 24, fontWeight: '700' },
  colorHint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 14, lineHeight: 20 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorSwatch: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  colorSelected: { borderWidth: 3, borderColor: Colors.text },
  colorCheck: { color: Colors.white, fontSize: 23, fontWeight: '900' },
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
