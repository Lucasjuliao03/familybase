import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Colors, Radii, FontSize, Shadow } from '../../theme';

interface Category {
  id: string;
  label: string;
  icon?: string;
}

interface Props {
  categories: Category[];
  onSelect?: (id: string) => void;
  initialSelected?: string;
}

export function CategoryFilter({ categories, onSelect, initialSelected }: Props) {
  const [selected, setSelected] = useState(initialSelected ?? categories[0]?.id);

  const handleSelect = (id: string) => {
    setSelected(id);
    onSelect?.(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {categories.map((cat) => {
        const active = cat.id === selected;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => handleSelect(cat.id)}
            activeOpacity={0.75}
          >
            {cat.icon ? (
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Text style={styles.iconText}>{cat.icon}</Text>
              </View>
            ) : null}
            <Text style={[styles.label, active && styles.labelActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  chipActive: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.primaryLight,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: { backgroundColor: Colors.primaryLighter },
  iconText: { fontSize: 15 },
  label:       { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  labelActive: { color: Colors.primary, fontWeight: '700' },
});
