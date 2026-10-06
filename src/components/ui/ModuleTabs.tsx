import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Radii, FontSize, Shadow } from '../../theme';

export interface ModuleTabItem {
  key: string;
  label: string;
  emoji?: string;
  /** Contador opcional exibido como badge (ex.: aprovações pendentes). */
  count?: number;
}

interface ModuleTabsProps {
  tabs: ModuleTabItem[];
  active: string;
  onChange: (key: string) => void;
}

/**
 * Abas responsivas em formato "pílula" com rolagem horizontal. Cada aba tem
 * largura do conteúdo (não usa flex dentro de scroll), evitando que rótulos
 * longos quebrem o layout. Aba ativa em destaque com a cor primária.
 */
export function ModuleTabs({ tabs, active, onChange }: ModuleTabsProps) {
  return (
    <View style={s.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.pill, isActive && s.pillActive]}
              onPress={() => onChange(t.key)}
              activeOpacity={0.85}
            >
              <Text style={[s.pillText, isActive && s.pillTextActive]} numberOfLines={1}>
                {t.emoji ? `${t.emoji} ` : ''}{t.label}
              </Text>
              {typeof t.count === 'number' && t.count > 0 && (
                <View style={[s.badge, isActive && s.badgeActive]}>
                  <Text style={[s.badgeText, isActive && s.badgeTextActive]}>{t.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: Colors.bg },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.xs + 1, fontWeight: '700', color: Colors.textSecondary },
  pillTextActive: { color: Colors.white, fontWeight: '900' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.primaryLighter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
  badgeText: { fontSize: 10, fontWeight: '900', color: Colors.primaryDark },
  badgeTextActive: { color: Colors.white },
});
