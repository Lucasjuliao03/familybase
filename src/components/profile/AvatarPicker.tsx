import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { AVATAR_OPTIONS } from '../../lib/avatarCatalog';
import { Colors, Radii, FontSize, Shadow } from '../../theme';
import { UserAvatar } from './UserAvatar';
import api from '../../services/api';

interface AvatarSaveResult {
  avatar_url?: string | null;
  avatar_preset?: string | null;
}

interface AvatarPickerProps {
  currentAvatarUrl?: string | null;
  currentPreset?: string | null;
  name?: string | null;
  endpoint?: string;
  size?: number;
  onSave?: (result: AvatarSaveResult) => void;
}

export function AvatarPicker({
  currentAvatarUrl,
  currentPreset,
  name,
  endpoint = '/auth/avatar',
  size = 80,
  onSave,
}: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null | undefined>(currentAvatarUrl);
  const [localPreset, setLocalPreset] = useState<string | null | undefined>(currentPreset);

  useEffect(() => {
    setLocalUrl(currentAvatarUrl);
    setLocalPreset(currentPreset);
  }, [currentAvatarUrl, currentPreset]);

  const handleSelectPreset = async (presetId: string) => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('avatar_preset', presetId);
      const { data } = await api.put(endpoint, formData);
      setLocalPreset(presetId);
      setLocalUrl(null);
      onSave?.(data);
      setOpen(false);
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível salvar o avatar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.85}>
        <View>
          <UserAvatar
            avatarUrl={localUrl}
            avatarPreset={localPreset}
            name={name}
            size={size}
          />
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeText}>✎</Text>
          </View>
        </View>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Escolher avatar</Text>

            {saving ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView contentContainerStyle={styles.presetGrid}>
                {AVATAR_OPTIONS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.presetItem, localPreset === p.id && styles.presetItemActive]}
                    onPress={() => handleSelectPreset(p.id)}
                  >
                    <Image source={p.source} style={styles.presetImage} resizeMode="cover" />
                    <Text style={styles.presetLabel} numberOfLines={1}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  editBadgeText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '82%',
    ...Shadow.md,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 8,
    justifyContent: 'center',
  },
  presetItem: {
    width: '44%',
    maxWidth: 140,
    alignItems: 'center',
    padding: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  presetItemActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  presetImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 6,
  },
  presetLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  closeBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: Colors.textSecondary, fontWeight: '700' },
});
