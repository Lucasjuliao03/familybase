import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { publicAssetUrl } from '../../lib/api';
import { getAvatarPresetSource } from '../../lib/avatarCatalog';

const C = {
  purpleDark: '#1F0B4D',
  purpleMain: '#5B2BEA',
  purpleLight: '#8B5CF6',
  white: '#FFFFFF',
  subText: 'rgba(255,255,255,0.75)',
} as const;

const AVATAR_SIZE = 48;

export type ChildModeHeaderProps = {
  childName: string;
  familyName?: string;
  parentName?: string;
  avatarUri?: string | null;
  /** Preset de avatar (fallback quando não há imagem remota). */
  avatarPreset?: string | null;
  onBackToParent: () => void;
  busy?: boolean;
};

function HeaderAvatar({
  avatarUri,
  avatarPreset,
  childName,
}: {
  avatarUri?: string | null;
  avatarPreset?: string | null;
  childName: string;
}) {
  const remote = avatarUri ? publicAssetUrl(avatarUri) : '';
  const preset = !remote && avatarPreset ? getAvatarPresetSource(avatarPreset) : undefined;

  if (remote) {
    return (
      <Image source={{ uri: remote }} style={s.avatarImage} resizeMode="cover" />
    );
  }
  if (preset) {
    return (
      <Image source={preset} style={s.avatarImage} resizeMode="cover" />
    );
  }

  const initial = childName?.trim()?.charAt(0)?.toUpperCase() || '👶';
  return (
    <View style={s.avatarFallback}>
      {initial.length === 1 && /[A-ZÀ-Ü]/i.test(initial) ? (
        <Text style={s.avatarInitial}>{initial}</Text>
      ) : (
        <Text style={s.avatarEmoji}>👶</Text>
      )}
    </View>
  );
}

/**
 * Header premium do modo filho (proxy): gradiente roxo, avatar, textos e botão voltar.
 */
export function ChildModeHeader({
  childName,
  familyName,
  parentName,
  avatarUri,
  avatarPreset,
  onBackToParent,
  busy = false,
}: ChildModeHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const safeTop = Math.max(
    insets.top,
    Platform.select({ ios: 44, android: 28, default: 12 }) ?? 12,
  );

  const displayChild = childName?.trim() || 'Filho(a)';
  const subtitle = parentName
    ? `Ações registradas em ${displayChild} por ${parentName}`
    : familyName
      ? familyName
      : 'Visualizando perfil da criança';

  return (
    <LinearGradient
      colors={[C.purpleDark, C.purpleMain, C.purpleLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        s.shell,
        {
          paddingTop: safeTop + 10,
          paddingBottom: compact ? 12 : 16,
        },
      ]}
    >
      <View style={s.row}>
        <View style={s.avatarRing}>
          <HeaderAvatar
            avatarUri={avatarUri}
            avatarPreset={avatarPreset}
            childName={displayChild}
          />
        </View>

        <View style={s.textBlock}>
          <Text
            style={[s.title, compact && s.titleCompact]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Modo filho · {displayChild}
          </Text>
          <Text
            style={[s.subtitle, compact && s.subtitleCompact]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subtitle}
          </Text>
        </View>

        <TouchableOpacity
          style={[s.backBtn, compact && s.backBtnCompact, busy && s.backBtnDisabled]}
          onPress={onBackToParent}
          disabled={busy}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Voltar ao pai"
        >
          {busy ? (
            <ActivityIndicator color={C.purpleMain} size="small" />
          ) : (
            <>
              <Ionicons
                name="chevron-back"
                size={compact ? 16 : 18}
                color={C.purpleMain}
                style={s.backIcon}
              />
              <Text style={[s.backLabel, compact && s.backLabelCompact]} numberOfLines={1}>
                Voltar ao pai
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

/** Alias pedido em algumas telas de visualização do filho. */
export const ChildViewHeader = ChildModeHeader;

const s = StyleSheet.create({
  shell: {
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: 14,
    minHeight: 72,
    ...Platform.select({
      ios: {
        shadowColor: '#1F0B4D',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 2,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 4,
  },
  title: {
    color: C.white,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  titleCompact: {
    fontSize: 16,
  },
  subtitle: {
    color: C.subText,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  subtitleCompact: {
    fontSize: 11,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minHeight: 40,
    maxWidth: 132,
    flexShrink: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#1F0B4D',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  backBtnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxWidth: 118,
    minHeight: 36,
  },
  backBtnDisabled: {
    opacity: 0.85,
  },
  backIcon: {
    marginRight: 2,
    marginLeft: -2,
  },
  backLabel: {
    color: C.purpleMain,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  backLabelCompact: {
    fontSize: 12,
  },
});
