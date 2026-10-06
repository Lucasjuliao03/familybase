import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors, Shadow } from '../../theme';

interface Props {
  icon?: string;
  onPress: () => void;
  size?: number;
  color?: string;
}

export function FAB({ icon = '+', onPress, size = 56, color = Colors.primary }: Props) {
  return (
    <TouchableOpacity
      style={[styles.fab, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Text style={styles.icon}>{icon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.btn,
  },
  icon: { fontSize: 26, color: '#fff', lineHeight: 30 },
});
