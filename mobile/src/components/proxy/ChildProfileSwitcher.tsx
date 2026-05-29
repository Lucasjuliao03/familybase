import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Radii, FontSize, Shadow } from '../../theme';
import { UserAvatar } from '../profile/UserAvatar';

export interface SwitchableChild {
  id: string;
  name?: string | null;
  color?: string | null;
  avatar_url?: string | null;
  avatar_preset?: string | null;
  family_id?: string | null;
}

interface Props {
  childrenList: SwitchableChild[];
  title?: string;
  subtitle?: string;
}

/**
 * Faixa de avatars dos filhos exibida ao pai. Tocar num avatar abre o modal de
 * confirmação e, ao confirmar, entra no "modo filho" (proxy) navegando para as
 * telas do filho — sem encerrar a sessão do pai.
 */
export function ChildProfileSwitcher({ childrenList, title, subtitle }: Props) {
  const router = useRouter();
  const { user, isGestor, enterChildProxy } = useAuth();
  const [selected, setSelected] = useState<SwitchableChild | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Segurança (requisito 6): só responsáveis veem o seletor.
  const canProxy =
    user?.role === 'master' ||
    user?.role === 'relative' ||
    (user?.role === 'parent' && (isGestor || (user?.access_profile ?? 'gestor') !== 'child'));

  if (!canProxy || !childrenList?.length) return null;

  const selectedName = selected?.name?.split(' ')[0] || selected?.name || 'filho';

  const handleConfirm = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await enterChildProxy(selected);
      setSelected(null);
      router.replace('/child');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível entrar no perfil do filho.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.title}>{title || 'Entrar como filho'}</Text>
        <View style={s.proxyTag}>
          <Text style={s.proxyTagText}>modo filho</Text>
        </View>
      </View>
      {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.avatarRow}
      >
        {childrenList.map((c) => {
          const color = c.color || Colors.primary;
          return (
            <TouchableOpacity
              key={c.id}
              style={s.avatarItem}
              activeOpacity={0.8}
              onPress={() => { setError(null); setSelected(c); }}
            >
              <View style={[s.avatarRing, { borderColor: color }]}>
                <UserAvatar
                  avatarUrl={c.avatar_url}
                  avatarPreset={c.avatar_preset}
                  name={c.name}
                  size={56}
                  bordered={false}
                  backgroundColor={`${color}18`}
                />
              </View>
              <Text style={s.avatarName} numberOfLines={1}>
                {c.name?.split(' ')[0] || 'Filho'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Modal de aviso/confirmação (requisito 2) */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && setSelected(null)}
      >
        <View style={s.overlay}>
          <View style={s.card}>
            <View style={[s.modalAvatar, { borderColor: selected?.color || Colors.primary }]}>
              <UserAvatar
                avatarUrl={selected?.avatar_url}
                avatarPreset={selected?.avatar_preset}
                name={selected?.name}
                size={72}
                bordered={false}
                backgroundColor={`${selected?.color || Colors.primary}18`}
              />
            </View>
            <Text style={s.modalTitle}>Atuar como {selectedName}</Text>
            <Text style={s.modalBody}>
              Você está atuando como{' '}
              <Text style={s.modalBodyStrong}>{selected?.name || 'este filho'}</Text>. Todas as
              alterações serão registradas no perfil dele e ficarão associadas a si para auditoria.
            </Text>

            {!!error && <Text style={s.modalError}>{error}</Text>}

            <TouchableOpacity
              style={[s.confirmBtn, busy && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.confirmBtnText}>Continuar como {selectedName}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setSelected(null)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={s.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 16,
    ...Shadow.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  proxyTag: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  proxyTagText: { fontSize: 9, fontWeight: '800', color: Colors.primaryDark, textTransform: 'uppercase' },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  avatarRow: { gap: 14, paddingVertical: 12, paddingHorizontal: 2 },
  avatarItem: { alignItems: 'center', width: 68 },
  avatarRing: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarName: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginTop: 6 },

  overlay: { flex: 1, backgroundColor: 'rgba(30,11,75,0.5)', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 22, alignItems: 'center',
    ...Shadow.lg,
  },
  modalAvatar: {
    width: 84, height: 84, borderRadius: 42, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12,
  },
  modalTitle: { fontSize: FontSize.md, fontWeight: '900', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  modalBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  modalBodyStrong: { fontWeight: '800', color: Colors.text },
  modalError: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  confirmBtn: {
    backgroundColor: Colors.primary, borderRadius: Radii.md, paddingVertical: 14,
    alignItems: 'center', alignSelf: 'stretch', marginTop: 18, ...Shadow.btn,
  },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSize.sm },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch', marginTop: 6 },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: FontSize.sm },
});
