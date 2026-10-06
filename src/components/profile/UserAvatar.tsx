import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, ImageResizeMode } from 'react-native';
import { publicAssetUrl } from '../../lib/api';
import { getAvatarPresetSource } from '../../lib/avatarCatalog';
import { Colors } from '../../theme';

interface UserAvatarProps {
  avatarUrl?: string | null;
  avatarPreset?: string | null;
  name?: string | null;
  size?: number;
  style?: ViewStyle;
  bordered?: boolean;
  backgroundColor?: string;
  /** circle = recorte redondo; character = PNG completo sem círculo (ex.: header) */
  presentation?: 'circle' | 'character';
}

export function UserAvatar({
  avatarUrl,
  avatarPreset,
  name,
  size = 72,
  style,
  bordered = true,
  backgroundColor,
  presentation = 'circle',
}: UserAvatarProps) {
  const isCharacter = presentation === 'character';
  const remoteSrc = avatarUrl ? publicAssetUrl(avatarUrl) : '';
  const presetSource = !remoteSrc && avatarPreset ? getAvatarPresetSource(avatarPreset) : undefined;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const fallbackBg = backgroundColor || Colors.primaryLighter;
  const hasImage = !!(remoteSrc || presetSource);

  const width = size;
  const height = isCharacter ? Math.round(size * 1.18) : size;
  const radius = isCharacter ? 0 : size / 2;
  const resizeMode: ImageResizeMode = isCharacter ? 'contain' : 'cover';
  const imageStyle = { width, height, borderRadius: radius };

  return (
    <View
      style={[
        styles.wrap,
        isCharacter ? styles.wrapCharacter : styles.wrapCircle,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: hasImage ? 'transparent' : fallbackBg,
          borderWidth: bordered && !isCharacter ? 3 : 0,
        },
        style,
      ]}
    >
      {remoteSrc ? (
        <Image source={{ uri: remoteSrc }} style={imageStyle} resizeMode={resizeMode} />
      ) : presetSource ? (
        <Image source={presetSource} style={imageStyle} resizeMode={resizeMode} />
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: Colors.primaryDark }}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    borderColor: Colors.primary,
  },
  wrapCircle: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wrapCharacter: {
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
});
