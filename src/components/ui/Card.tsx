import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Radii, Shadow } from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  shadow?: 'sm' | 'md' | 'lg';
  radius?: number;
  padding?: number;
  bg?: string;
  onLayout?: (event: any) => void;
}

export function Card({
  children,
  style,
  shadow = 'md',
  radius = Radii.lg,
  padding = 16,
  bg = Colors.surface,
  onLayout,
}: Props) {
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        Shadow[shadow],
        { borderRadius: radius, padding, backgroundColor: bg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 0,
  },
});
