import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../theme';

export type CelebrationKind = 'task' | 'savings' | 'medicine';
export type CelebrationEvent = { id: number; kind: CelebrationKind; message: string };

const THEMES = {
  task: { icon: '🌟', accent: '#F59E0B', title: 'Missão cumprida!', particles: ['✨', '⭐', '✨', '⭐'] },
  savings: { icon: '🪙', accent: '#10B981', title: 'Cofrinho feliz!', particles: ['✨', '💛', '✨', '🪙'] },
  medicine: { icon: '💊', accent: '#4F46E5', title: 'Cuidou de você!', particles: ['✨', '💚', '✨', '💚'] },
} as const;

/** Feedback de sucesso sem Modal nativo; não bloqueia o toque nem altera o layout. */
export function ActionCelebration({ event, onFinish }: { event: CelebrationEvent | null; onFinish: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.75)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (!event) return;
    opacity.setValue(0);
    scale.setValue(0.75);
    burst.setValue(0);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(580),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) onFinishRef.current(); });
    return () => animation.stop();
  }, [event?.id, opacity, scale, burst]);

  if (!event) return null;
  const theme = THEMES[event.kind];
  const positions = [
    { x: -104, y: -82 }, { x: 102, y: -70 }, { x: -86, y: 72 }, { x: 94, y: 78 },
  ];

  return (
    <View pointerEvents="none" style={styles.overlay} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.card, { borderColor: theme.accent, opacity, transform: [{ scale }] }]}>
        <View style={styles.artArea}>
          {theme.particles.map((particle, index) => (
            <Animated.Text
              key={`${index}-${particle}`}
              style={[
                styles.particle,
                {
                  opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.8] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, positions[index].x] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, positions[index].y] }) },
                    { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) },
                  ],
                },
              ]}
            >{particle}</Animated.Text>
          ))}
          <Text style={styles.icon}>{theme.icon}</Text>
        </View>
        <Text style={[styles.title, { color: theme.accent }]}>{theme.title}</Text>
        <Text style={styles.message}>{event.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  card: { width: 248, minHeight: 174, backgroundColor: Colors.surface, borderWidth: 2, borderRadius: 24, alignItems: 'center', justifyContent: 'center', padding: 20, elevation: 12, shadowColor: '#111827', shadowOpacity: 0.18, shadowRadius: 18 },
  artArea: { width: 80, height: 70, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 48, textAlign: 'center' },
  particle: { position: 'absolute', fontSize: 20 },
  title: { fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  message: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
