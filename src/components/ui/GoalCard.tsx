import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radii, Shadow, FontSize } from '../../theme';
import { ProgressBar } from './ProgressBar';

interface Props {
  icon?: string;
  name: string;
  value: string;
  progress: number;    // 0-100
  progressColor?: string;
  bg?: string;
  isNew?: boolean;
  onPress?: () => void;
}

export function GoalCard({
  icon,
  name,
  value,
  progress,
  progressColor = Colors.primary,
  bg = Colors.primaryLighter,
  isNew = false,
  onPress,
}: Props) {
  if (isNew) {
    return (
      <TouchableOpacity style={[styles.card, styles.newCard]} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.newIcon}>+</Text>
        <Text style={styles.newLabel}>Nova meta</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <Text style={styles.value}>{value}</Text>
      <ProgressBar
        progress={progress}
        color={progressColor}
        bg="rgba(0,0,0,0.07)"
        height={5}
        style={{ marginTop: 6 }}
      />
      <Text style={[styles.pct, { color: progressColor }]}>{progress}%</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 110,
    borderRadius: Radii.lg,
    padding: 12,
    marginRight: 10,
    ...Shadow.sm,
  },
  newCard: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    height: 120,
  },
  newIcon:  { fontSize: 28, color: Colors.textMuted },
  newLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', marginTop: 4 },

  icon:  { fontSize: 28, marginBottom: 6 },
  name:  { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
  value: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  pct:   { fontSize: FontSize.xs, fontWeight: '700', marginTop: 3 },
});
