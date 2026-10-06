import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, FontSize } from '../../theme';

type Variant = 'primary' | 'success' | 'warning' | 'danger' | 'teal' | 'pink' | 'yellow' | 'blue' | 'ghost';

interface Props {
  label: string;
  variant?: Variant;
  icon?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

const variantMap: Record<Variant, { bg: string; text: string }> = {
  primary: { bg: Colors.primaryLighter, text: Colors.primary },
  success: { bg: Colors.greenLight,     text: Colors.green },
  warning: { bg: Colors.yellowLight,    text: '#B45309' },
  danger:  { bg: '#FEE2E2',             text: Colors.danger },
  teal:    { bg: Colors.tealLight,      text: '#0D9488' },
  pink:    { bg: Colors.pinkLight,      text: '#BE185D' },
  yellow:  { bg: Colors.yellowLight,    text: '#92400E' },
  blue:    { bg: Colors.blueLight,      text: '#1D4ED8' },
  ghost:   { bg: '#F3F4F6',             text: '#6B6B8A' },
};

export function Badge({ label, variant = 'primary', icon, style, size = 'md' }: Props) {
  const { bg, text } = variantMap[variant];
  return (
    <View style={[styles.badge, styles[size], { backgroundColor: bg }, style]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: Radii.full,
  },
  sm: { paddingVertical: 3,  paddingHorizontal: 8  },
  md: { paddingVertical: 5,  paddingHorizontal: 12 },
  icon:  { fontSize: 11 },
  label: { fontSize: FontSize.xs, fontWeight: '700' },
});
