import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { Colors, Radii, Shadow, FontSize, Spacing } from '../../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'teal' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = true,
}: Props) {
  const btnStyle = [
    styles.base,
    styles[size],
    styles[`variant_${variant}`],
    disabled || loading ? styles.disabled : null,
    fullWidth ? null : { alignSelf: 'flex-start' as const },
    style,
  ];

  const txtStyle = [
    styles.text,
    styles[`text_${size}`],
    styles[`textVariant_${variant}`],
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={btnStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : Colors.primary} />
      ) : (
        <View style={styles.row}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text style={txtStyle}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: FontSize.md },

  // sizes
  sm: { paddingVertical: 9,  paddingHorizontal: 18 },
  md: { paddingVertical: 13, paddingHorizontal: 24 },
  lg: { paddingVertical: 17, paddingHorizontal: 28 },

  // text sizes
  text:      { fontWeight: '700' },
  text_sm:   { fontSize: FontSize.sm },
  text_md:   { fontSize: FontSize.base },
  text_lg:   { fontSize: FontSize.md },

  // variants
  variant_primary: {
    backgroundColor: Colors.primary,
    ...Shadow.btn,
  },
  variant_secondary: {
    backgroundColor: Colors.primaryLighter,
  },
  variant_outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  variant_teal: {
    backgroundColor: Colors.teal,
    shadowColor: Colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  variant_danger: {
    backgroundColor: Colors.danger,
  },

  // text variants
  textVariant_primary:   { color: Colors.textWhite },
  textVariant_secondary: { color: Colors.primary },
  textVariant_outline:   { color: Colors.primary },
  textVariant_ghost:     { color: Colors.primary },
  textVariant_teal:      { color: Colors.textWhite },
  textVariant_danger:    { color: Colors.textWhite },

  disabled: { opacity: 0.55 },
});
