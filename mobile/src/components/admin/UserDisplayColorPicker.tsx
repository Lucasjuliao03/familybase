import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import {
  USER_DISPLAY_COLOR_PALETTE,
  normalizeHex,
  isUserDisplaySwatchDisabled,
} from '../../shared/lib/userDisplayColors';
import { Colors, Radii, FontSize } from '../../theme';

interface AdultMember {
  id: string;
  display_color?: string;
}

interface UserDisplayColorPickerProps {
  label?: string;
  value?: string;
  onChange: (hex: string) => void;
  primaryColor?: string;
  secondaryColor?: string;
  excludeUserId?: string | null;
  adultMembers?: AdultMember[];
}

export function UserDisplayColorPicker({
  label = 'Cor no calendário',
  value,
  onChange,
  primaryColor,
  secondaryColor,
  excludeUserId,
  adultMembers = [],
}: UserDisplayColorPickerProps) {
  const current = normalizeHex(value || '');

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.grid}>
        {USER_DISPLAY_COLOR_PALETTE.map((c) => {
          const hex = normalizeHex(c);
          const disabled = isUserDisplaySwatchDisabled(hex, {
            primary: primaryColor,
            secondary: secondaryColor,
            excludeUserId: excludeUserId ?? undefined,
            adultMembers,
          });
          const selected = current === hex;
          return (
            <TouchableOpacity
              key={hex}
              disabled={disabled}
              onPress={() => onChange(hex)}
              style={[
                styles.swatch,
                { backgroundColor: hex },
                selected && styles.swatchSelected,
                disabled && styles.swatchDisabled,
              ]}
            />
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        value={value || ''}
        onChangeText={onChange}
        placeholder="#6C5CE7"
        autoCapitalize="characters"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  swatch: { width: 32, height: 32, borderRadius: 8 },
  swatchSelected: { borderWidth: 3, borderColor: Colors.text },
  swatchDisabled: { opacity: 0.25 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    backgroundColor: Colors.bg,
  },
});
