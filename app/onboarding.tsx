import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Dimensions,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { Colors } from '../src/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const SLIDES = [
  { id: '1', source: require('../icon/1.png') },
  { id: '2', source: require('../icon/2.png') },
  { id: '3', source: require('../icon/3.png') },
  { id: '4', source: require('../icon/4.png') },
  { id: '5', source: require('../icon/5.png') },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<(typeof SLIDES)[number]>>(null);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(idx);
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Image source={item.source} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
          </View>
        )}
      />

      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.88)', 'rgba(255,255,255,0.98)']}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 16) }]}
        pointerEvents="box-none"
      >
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.id}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
              accessibilityLabel={`Slide ${i + 1} de ${SLIDES.length}`}
            />
          ))}
        </View>

        <PrimaryButton
          label="Fazer login"
          onPress={() => router.replace('/login')}
          style={styles.loginBtn}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E8F4FC',
  },
  slide: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  loginBtn: {
    marginBottom: 4,
  },
});
