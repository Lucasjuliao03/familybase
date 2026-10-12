import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomNavigationHeight } from '../../src/contexts/BottomNavigationContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { CHILD_AVATARS, ChildAvatar, getChildAvatar } from '../../src/lib/childAvatarCatalog';
import api from '../../src/services/api';
import { CharacterVideo } from '../../src/components/ui/CharacterVideo';

const THUMB_WIDTH = 96;

export default function ChildAvatarScreen() {
  const { childProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigationHeight = useBottomNavigationHeight();
  const [footerHeight, setFooterHeight] = useState(0);
  const { width, height } = useWindowDimensions();
  const initialIndex = Math.max(0, CHILD_AVATARS.findIndex((item) => item.id === childProfile?.avatar_preset));
  const listRef = useRef<FlatList<ChildAvatar>>(null);
  const pendingTap = useRef<number | null>(null);
  const activeIndexRef = useRef(initialIndex);
  const didInteract = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLocked = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oldSceneOpacity = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [oldScene, setOldScene] = useState<ChildAvatar | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const active = CHILD_AVATARS[activeIndex];
  const compact = height < 750;

  const centerSelected = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: activeIndexRef.current * THUMB_WIDTH,
        animated: false,
      });
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    }).catch(() => { if (mounted) setReduceMotion(false); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
      if (dragTimer.current) clearTimeout(dragTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (didInteract.current) return;
    const savedIndex = Math.max(0, CHILD_AVATARS.findIndex((item) => item.id === childProfile?.avatar_preset));
    activeIndexRef.current = savedIndex;
    setActiveIndex(savedIndex);
    centerSelected();
  }, [childProfile?.avatar_preset, centerSelected]);

  useEffect(() => {
    centerSelected();
  }, [centerSelected, width]);

  const choosePreview = useCallback((index: number) => {
    if (saveLocked.current) return;
    const safeIndex = Math.max(0, Math.min(CHILD_AVATARS.length - 1, index));
    const current = activeIndexRef.current;
    if (current === safeIndex) return;
    activeIndexRef.current = safeIndex;
    setOldScene(CHILD_AVATARS[current]);
    oldSceneOpacity.stopAnimation();
    oldSceneOpacity.setValue(1);
    Animated.timing(oldSceneOpacity, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setOldScene(null); });
    setActiveIndex(safeIndex);
    setErrorMessage('');
    setSavedMessage('');
  }, [oldSceneOpacity]);

  const scrollToIndex = useCallback((index: number) => {
    if (saveLocked.current) return;
    didInteract.current = true;
    pendingTap.current = index;
    choosePreview(index);
    listRef.current?.scrollToOffset({ offset: index * THUMB_WIDTH, animated: true });
  }, [choosePreview]);

  const finishScroll = useCallback((offsetX: number) => {
    const index = Math.max(0, Math.min(
      CHILD_AVATARS.length - 1,
      Math.round(offsetX / THUMB_WIDTH),
    ));
    if (pendingTap.current !== null) {
      if (index !== pendingTap.current) {
        listRef.current?.scrollToOffset({ offset: pendingTap.current * THUMB_WIDTH, animated: true });
        return;
      }
      pendingTap.current = null;
    }
    didInteract.current = true;
    choosePreview(index);
  }, [choosePreview]);

  const confirm = useCallback(async () => {
    if (saveLocked.current || !childProfile?.id) {
      if (!childProfile?.id) setErrorMessage('Não foi possível encontrar seu perfil. Entre novamente e tente mais uma vez.');
      return;
    }
    saveLocked.current = true;
    setSaving(true);
    setErrorMessage('');
    try {
      const result = await api.put('/children/me/avatar-preset', {
        child_id: childProfile.id,
        avatar_preset: active.id,
      });
      if (result?.data?.avatar_preset !== active.id) throw new Error('O avatar escolhido não foi confirmado pelo banco.');
      await refreshProfile();
      setSavedMessage(`${active.name} agora representa você!`);
      leaveTimer.current = setTimeout(() => router.back(), 1300);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível salvar. Tente novamente.');
      saveLocked.current = false;
    } finally {
      setSaving(false);
    }
  }, [active, childProfile?.id, refreshProfile, router]);

  const saved = getChildAvatar(childProfile?.avatar_preset);

  return (
    <View style={[styles.root, { backgroundColor: active.softBackground }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mediaStage} pointerEvents="none" testID="character-media">
        <Image source={active.scene} resizeMode="cover" style={styles.scene} accessibilityIgnoresInvertColors />
        {!reduceMotion ? <CharacterVideo key={active.id} source={active.video} /> : null}
        {oldScene ? (
          <Animated.Image
            source={oldScene.scene}
            resizeMode="cover"
            style={[styles.scene, { opacity: oldSceneOpacity }]}
          />
        ) : null}
      </View>

      <View style={[styles.layout, { paddingTop: Math.max(insets.top, 8), paddingBottom: navigationHeight + 8 }]}>
        <View style={styles.topRow}>
          <Pressable
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Voltar ao perfil"
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={active.darkAccent} />
          </Pressable>
          <Text style={[styles.topTitle, { color: active.darkAccent }]}>{active.name.toUpperCase()}</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.spacer} />
        <LinearGradient
          colors={['transparent', `${active.softBackground}DD`, active.softBackground]}
          locations={[0, 0.32, 1]}
          style={[styles.bottomWash, { height: footerHeight + navigationHeight + 24 }]}
          pointerEvents="none"
        />
        <View style={[styles.footer, compact && styles.footerCompact]} onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} testID="character-footer">
          <View style={styles.identity}>
            <Text style={[styles.species, { color: active.darkAccent }]}>{active.species}</Text>
            <Text style={[styles.phrase, { color: active.darkAccent }]}>
              <Text style={[styles.emphasis, { color: active.accent }]}>{active.emphasis}</Text> {active.phrase}
            </Text>
          </View>

          <FlatList
            style={styles.choices}
            ref={listRef}
            horizontal
            onLayout={centerSelected}
            onContentSizeChange={centerSelected}
            scrollEnabled={!saving && !savedMessage}
            data={CHILD_AVATARS as ChildAvatar[]}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const selected = index === activeIndex;
              return (
                <Pressable
                  focusable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.species}${saved?.id === item.id ? ', escolhido' : ''}`}
                  accessibilityState={{ selected }}
                  disabled={saving || !!savedMessage}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex((current) => current === index ? null : current)}
                  onPress={() => scrollToIndex(index)}
                  style={[styles.thumbButton, { width: THUMB_WIDTH }]}
                >
                  <View style={[
                    styles.thumbCircle,
                    { backgroundColor: item.softBackground, borderColor: selected || focusedIndex === index ? item.accent : 'transparent' },
                    selected && styles.thumbSelected,
                  ]}>
                    <Image source={item.thumbnail} resizeMode="contain" style={styles.thumbImage} />
                  </View>
                  <Text style={[styles.thumbLabel, { color: selected ? item.darkAccent : '#6E6674' }, selected && styles.thumbLabelSelected]}>{item.name}</Text>
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingHorizontal: Math.max(0, (Math.min(width, 600) - THUMB_WIDTH) / 2) }}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({ length: THUMB_WIDTH, offset: THUMB_WIDTH * index, index })}
            snapToInterval={THUMB_WIDTH}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => { didInteract.current = true; pendingTap.current = null; if (dragTimer.current) clearTimeout(dragTimer.current); }}
            onScrollEndDrag={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              dragTimer.current = setTimeout(() => finishScroll(offsetX), 100);
            }}
            onMomentumScrollBegin={() => { if (dragTimer.current) clearTimeout(dragTimer.current); }}
            onMomentumScrollEnd={(event) => finishScroll(event.nativeEvent.contentOffset.x)}
          />

          {errorMessage ? <Text style={styles.feedbackError} accessibilityRole="alert">{errorMessage}</Text> : null}
          {savedMessage ? <Text style={[styles.feedbackSuccess, { color: active.darkAccent }]} accessibilityRole="alert">{savedMessage}</Text> : null}
          <Pressable
            style={[styles.confirmButton, { backgroundColor: active.accent }, saving && styles.confirmDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Escolher ${active.name}`}
            accessibilityState={{ disabled: saving || !!savedMessage }}
            disabled={saving || !!savedMessage}
            onPress={confirm}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Escolher {active.name}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  mediaStage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  scene: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  layout: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFFCC', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, top: 14, fontSize: 32, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  topSpacer: { width: 38 },
  spacer: { flex: 1 },
  bottomWash: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { gap: 8, flexShrink: 0, width: '100%', maxWidth: 600, alignSelf: 'center' },
  footerCompact: { gap: 6 },
  identity: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  choices: { flexGrow: 0, flexShrink: 0 },
  species: { fontSize: 15, fontWeight: '700', marginTop: -2 },
  phrase: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  emphasis: { fontWeight: '900' },
  thumbButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  thumbCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbSelected: { transform: [{ scale: 1.08 }] },
  thumbImage: { width: 58, height: 58 },
  thumbLabel: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  thumbLabelSelected: { fontWeight: '900' },
  confirmButton: { marginHorizontal: 24, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  confirmDisabled: { opacity: 0.7 },
  confirmText: { fontSize: 17, fontWeight: '900', color: '#FFFFFF' },
  feedbackError: { textAlign: 'center', color: '#8F2335', fontSize: 13, fontWeight: '700', paddingHorizontal: 24 },
  feedbackSuccess: { textAlign: 'center', fontSize: 14, fontWeight: '800', paddingHorizontal: 24 },
});
