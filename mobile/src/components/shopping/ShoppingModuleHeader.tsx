import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Colors, FontSize, Radii } from '../../theme';

const comprasHeaderImg = require('../../../icon/fcompras.png');
const comprasAsset = Image.resolveAssetSource(comprasHeaderImg);
const comprasAspect =
  comprasAsset?.width && comprasAsset?.height
    ? comprasAsset.width / comprasAsset.height
    : 1.08;

const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.42)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

interface ShoppingModuleHeaderProps {
  title: string;
  subtitle: string;
  backgroundColor: string;
  showAdd?: boolean;
  onAdd?: () => void;
}

export function ShoppingModuleHeader({
  title,
  subtitle,
  backgroundColor,
  showAdd = true,
  onAdd,
}: ShoppingModuleHeaderProps) {
  const { width: screenW } = useWindowDimensions();
  const imgSize = useMemo(() => {
    const baseH = Math.round(Math.min(112, screenW * 0.27));
    const scale = 2.5 * 0.75 * 0.7 * 0.8;
    const h = Math.round(baseH * scale);
    const w = Math.round(h * comprasAspect);
    return {
      w,
      h,
      textPad: Math.max(96, Math.round(w * 0.42)),
    };
  }, [screenW]);

  return (
    <View style={[styles.header, { backgroundColor }]}>
      <View
        style={[
          styles.headerImgSlot,
          {
            width: imgSize.w,
            height: imgSize.h,
            right: showAdd ? 40 : 0,
          },
        ]}
      >
        <Image
          source={comprasHeaderImg}
          style={styles.headerBgImg}
          resizeMode="contain"
        />
      </View>

      <View style={[styles.headerTextWrap, { paddingRight: imgSize.textPad }]}>
        <Text style={[styles.headerTitle, textShadow]}>{title}</Text>
        <Text style={[styles.headerSub, textShadow]}>{subtitle}</Text>
      </View>

      {showAdd && onAdd ? (
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 0,
    overflow: 'hidden',
    minHeight: Platform.OS === 'ios' ? 118 : 106,
    borderBottomLeftRadius: Radii.lg,
    borderBottomRightRadius: Radii.lg,
  },
  headerImgSlot: {
    position: 'absolute',
    bottom: 0,
    zIndex: 0,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  headerBgImg: {
    width: '100%',
    height: '100%',
    opacity: 0.92,
  },
  headerTextWrap: {
    flex: 1,
    zIndex: 2,
    alignSelf: 'center',
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.white,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    marginBottom: 10,
  },
  addBtnText: {
    fontSize: 22,
    color: Colors.white,
    lineHeight: 26,
  },
});
