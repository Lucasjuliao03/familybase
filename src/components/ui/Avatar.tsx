import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, FontSize } from '../../theme';

interface Props {
  initial?: string;
  emoji?: string;
  size?: number;
  bg?: string;
  border?: string;
  style?: ViewStyle;
}

export function Avatar({ initial, emoji, size = 44, bg = Colors.primary, border, style }: Props) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderWidth: border ? 2.5 : 0,
          borderColor: border,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.45, lineHeight: size * 0.6 }}>
        {emoji ?? (initial?.toUpperCase() ?? '?')}
      </Text>
    </View>
  );
}

// Preset child avatars
export const ChildAvatars = {
  boy:  { emoji: '👦', bg: '#DBEAFE' },
  girl: { emoji: '👧', bg: '#FDF2F8' },
  dad:  { emoji: '🧔', bg: '#D1FAE5' },
  mom:  { emoji: '👩', bg: '#FEF9C3' },
};

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
