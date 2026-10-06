import React from 'react';
import { Image, StyleProp, ImageStyle, ViewStyle, View } from 'react-native';

export const APP_LOGO = require('../../../icon/logo.png');

const SIZE_MAP = { sm: 72, md: 110, lg: 140 } as const;

type AppLogoSize = keyof typeof SIZE_MAP | number;

interface AppLogoProps {
  size?: AppLogoSize;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AppLogo({ size = 'md', style, containerStyle }: AppLogoProps) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  return (
    <View style={containerStyle}>
      <Image
        source={APP_LOGO}
        style={[{ width: px, height: px }, style]}
        resizeMode="contain"
        accessibilityLabel="Tudo de Família"
      />
    </View>
  );
}
