import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, ImageResizeMode } from 'react-native';
import { publicAssetUrl } from '../../lib/api';
import { getAvatarPresetPortraitSource, getAvatarPresetSource } from '../../lib/avatarCatalog';
import { Colors } from '../../theme';

interface UserAvatarProps {
  avatarUrl?: string | null;
  avatarPreset?: string | null;
  name?: string | null;
  size?: number;
  style?: ViewStyle;
  bordered?: boolean;
  backgroundColor?: string;
  ringColor?: string;
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
  ringColor,
  presentation = 'circle',
}: UserAvatarProps) {
  const isCharacter = presentation === 'character';
  const [failedUri,setFailedUri]=useState('');
  const requestedSrc=avatarUrl ? publicAssetUrl(avatarUrl):'';
  const remoteSrc = requestedSrc!==failedUri ? requestedSrc:'';
  const presetSource = !remoteSrc && avatarPreset
    ? (isCharacter ? getAvatarPresetSource(avatarPreset) : getAvatarPresetPortraitSource(avatarPreset))
    : undefined;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const fallbackBg = backgroundColor || Colors.primaryLighter;
  const identityColor = ringColor || (backgroundColor && /^#[0-9a-f]{6}/i.test(backgroundColor)
    ? backgroundColor.slice(0, 7) : undefined);
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
          borderWidth: !isCharacter && identityColor ? 2 : (bordered && !isCharacter ? 3 : 0),
          borderColor: identityColor || Colors.primary,
        },
        style,
      ]}
    >
      {remoteSrc ? (
        <Image source={{ uri: remoteSrc }} style={imageStyle} resizeMode={resizeMode} onError={() => setFailedUri(remoteSrc)} />
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
