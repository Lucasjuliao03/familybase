import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { getHomeScene } from '../../lib/homeSceneCatalog';
import { Colors } from '../../theme';

type Props = {
  sceneWidth: number;
  avatarId?: string | null;
  mascotId?: string | null;
  onChooseAvatar: () => void;
  onChooseMascot: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function HomeSceneHeader({ sceneWidth, avatarId, mascotId, onChooseAvatar, onChooseMascot, children, style }: Props) {
  const source = getHomeScene(avatarId, mascotId);
  const curveSize = sceneWidth * 1.15;
  const curveRise = Math.min(sceneWidth * 0.14, 72);

  return (
    <View style={[styles.frame, style]} testID="child-home-scene">
      {source ? (
        <Image
          source={source}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={`Cena de ${avatarId} com ${mascotId}`}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Sua aventura começa aqui</Text>
          <Text style={styles.placeholderHint}>Escolha seu avatar e seu mascote para ver sua cena.</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onChooseAvatar} style={styles.action} accessibilityRole="button" accessibilityLabel="Escolher avatar">
              <Text style={styles.actionText}>Escolher avatar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onChooseMascot} style={styles.action} accessibilityRole="button" accessibilityLabel="Escolher mascote">
              <Text style={styles.actionText}>Escolher mascote</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={styles.wave} pointerEvents="none">
        <View style={[styles.waveCurve, {
          width: curveSize,
          height: curveSize,
          left: (sceneWidth - curveSize) / 2,
          bottom: -(curveSize - curveRise),
          borderRadius: curveSize / 2,
        }]} />
        <View style={styles.waveBase} />
      </View>
      {children ? <View style={styles.overlay} pointerEvents="box-none">{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 650,
    aspectRatio: 1,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#EAF7FF',
  },
  image: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFill },
  wave: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  waveCurve: { position: 'absolute', backgroundColor: Colors.bg },
  waveBase: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 20, backgroundColor: Colors.bg },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  placeholderTitle: { fontSize: 20, fontWeight: '900', color: '#314367', textAlign: 'center' },
  placeholderHint: { fontSize: 13, color: '#5A6883', textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  action: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  actionText: { color: '#355A8C', fontWeight: '800', fontSize: 12 },
});
