import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, FontSize, Shadow } from '../../theme';
import { ParentModuleIcon } from './ParentModuleIcon';

interface ModuleHeaderProps {
  title: string;
  /** @deprecated use iconName */
  emoji?: string;
  iconName?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

export function ModuleHeader({ title, emoji, iconName, subtitle, onBack, right }: ModuleHeaderProps) {
  const resolvedIcon = iconName || (emoji ? undefined : 'dashboard');

  return (
    <View style={s.header}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.8} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
      ) : null}

      <View style={s.center}>
        <View style={s.titleRow}>
          {resolvedIcon ? (
            <View style={s.iconBadge}>
              <ParentModuleIcon name={resolvedIcon} size={18} color={Colors.primary} />
            </View>
          ) : null}
          <Text style={s.title} numberOfLines={1}>{title}</Text>
        </View>
        {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>

      {right ? <View style={s.right}>{right}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 46,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Radii.lg,
    borderBottomRightRadius: Radii.lg,
    ...Shadow.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  center: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primaryLighter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: FontSize.lg, fontWeight: '900', color: Colors.text },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4, marginLeft: 44 },
  right: { marginLeft: 'auto' },
});
