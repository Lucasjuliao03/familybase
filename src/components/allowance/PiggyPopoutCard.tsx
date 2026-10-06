import React, { useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  ViewStyle,
  StyleProp,
  ImageSourcePropType,
  Platform,
} from 'react-native';
import { Radii, Shadow } from '../../theme';

const DEFAULT_MARGIN = 14;
const CARD_BODY_H = 58;

export function usePiggyPopoutMetrics(horizontalMargin = DEFAULT_MARGIN) {
  const screenW = Dimensions.get('window').width;
  return useMemo(() => {
    const cardW = screenW - horizontalMargin * 2;
    /** Coluna esquerda dedicada ao cofrinho */
    const slotW = Math.round(cardW * 0.34);
    /** Imagem grande dentro da coluna (~94% da largura do slot) */
    const imageW = Math.round(slotW * 0.94);
    const imageH = Math.round(imageW * 1.06);
    /** Pop-out leve pelo topo, a partir do centro da coluna */
    const popOut = Math.round(imageH * 0.12);
    return {
      cardW,
      cardBodyH: CARD_BODY_H,
      slotW,
      imageW,
      imageH,
      popOut,
      horizontalMargin,
    };
  }, [screenW, horizontalMargin]);
}

interface PiggyPopoutCardProps {
  children: React.ReactNode;
  imageSource: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
  horizontalMargin?: number;
}

/**
 * Cofrinho centralizado na coluna esquerda (não no card inteiro),
 * maior dentro do slot, com pop-out suave pelo topo.
 */
export function PiggyPopoutCard({
  children,
  imageSource,
  style,
  cardStyle,
  footer,
  horizontalMargin = DEFAULT_MARGIN,
}: PiggyPopoutCardProps) {
  const {
    cardBodyH,
    slotW,
    imageW,
    imageH,
    popOut,
    horizontalMargin: margin,
  } = usePiggyPopoutMetrics(horizontalMargin);

  return (
    <View style={[s.outer, { marginHorizontal: margin, paddingTop: popOut }, style]}>
      <View style={[s.card, cardStyle]}>
        <View style={[s.bodyRow, { minHeight: cardBodyH }]}>
          <View style={[s.imageSlot, { width: slotW, height: cardBodyH }]}>
            <View
              style={[
                s.imagePopWrap,
                {
                  width: imageW,
                  height: imageH,
                  transform: [{ translateY: -popOut }],
                },
              ]}
            >
              <Image
                source={imageSource}
                style={s.piggyImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={s.content}>{children}</View>
        </View>

        {footer ? <View style={s.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

export function piggyScrollTopInset(horizontalMargin = DEFAULT_MARGIN): number {
  const screenW = Dimensions.get('window').width;
  const slotW = Math.round((screenW - horizontalMargin * 2) * 0.34);
  const imageW = Math.round(slotW * 0.94);
  const imageH = Math.round(imageW * 1.06);
  return Math.round(imageH * 0.12);
}

const s = StyleSheet.create({
  outer: {
    overflow: 'visible',
    zIndex: 4,
    marginBottom: 4,
  },
  card: {
    overflow: 'visible',
    backgroundColor: '#FFFAFD',
    borderRadius: Radii.lg,
    paddingVertical: 6,
    paddingRight: 12,
    paddingLeft: 0,
    borderWidth: 1,
    borderColor: '#F9D4EC',
    ...Shadow.sm,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 3,
  },
  imagePopWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#E879A9',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  piggyImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 2,
    zIndex: 2,
  },
  footer: {
    marginTop: 4,
    paddingTop: 4,
    gap: 3,
  },
});
