import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radii, Shadow, FontSize, Spacing } from '../../theme';
import { UserAvatar } from '../profile/UserAvatar';

interface Props {
  title: string;
  category: string;
  categoryIcon?: string;
  points: number;
  avatarUrl?: string | null;
  avatarPreset?: string | null;
  avatarName?: string | null;
  avatarBg?: string;
  done?: boolean;
  later?: boolean;
  dueTime?: string;
  onToggle?: () => void;
  onPress?: () => void;
}

export function TaskCard({
  title,
  category,
  categoryIcon = '📋',
  points,
  avatarUrl,
  avatarPreset,
  avatarName,
  avatarBg = '#DBEAFE',
  done = false,
  later = false,
  dueTime,
  onToggle,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, done && styles.cardDone]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {/* Task icon */}
      <View style={styles.iconWrap}>
        <Text style={styles.iconText}>{categoryIcon}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.category}>
          {categoryIcon} {category} {dueTime ? ` · 🕐 ${dueTime.slice(0, 5)}` : ''}
        </Text>
      </View>

      {/* Points */}
      <View style={styles.points}>
        <Text style={styles.coin}>⭐</Text>
        <Text style={styles.pointsValue}>{points}</Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>

      {/* Avatar */}
      <UserAvatar
        avatarUrl={avatarUrl}
        avatarPreset={avatarPreset}
        name={avatarName}
        size={36}
        bordered={false}
        backgroundColor={avatarBg}
      />

      {/* Status */}
      {later ? (
        <View style={styles.laterBtn}>
          <Text style={styles.laterText}>🕐 Mais tarde</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.check, done && styles.checkDone]}
          onPress={onToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {done && <Text style={styles.checkMark}>✓</Text>}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 12,
    marginBottom: 10,
    gap: 10,
    ...Shadow.sm,
  },
  cardDone: { opacity: 0.8 },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radii.sm,
    backgroundColor: Colors.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: 24 },

  info:    { flex: 1 },
  title:   { fontSize: FontSize.sm + 1, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  category:  { fontSize: FontSize.xs, color: Colors.textSecondary },

  points: { alignItems: 'center' },
  coin:   { fontSize: 14 },
  pointsValue: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, lineHeight: 16 },
  pointsLabel: { fontSize: 9, color: Colors.textMuted },

  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkDone: { backgroundColor: Colors.green, borderColor: Colors.green },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },

  laterBtn: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  laterText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
});
