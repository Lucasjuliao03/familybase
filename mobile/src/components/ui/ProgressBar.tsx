import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii } from '../../theme';

interface Props {
  progress: number;         // 0-100
  color?: string;
  bg?: string;
  height?: number;
  showLabel?: boolean;
  labelInside?: boolean;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  color = Colors.primary,
  bg = Colors.primaryLighter,
  height = 8,
  showLabel = false,
  labelInside = false,
  style,
}: Props) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <View style={style}>
      {showLabel && !labelInside && (
        <Text style={[styles.label, { color }]}>{pct}%</Text>
      )}
      <View style={[styles.track, { backgroundColor: bg, height, borderRadius: height / 2 }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${pct}%`,
              height,
              backgroundColor: color,
              borderRadius: height / 2,
            },
          ]}
        />
        {showLabel && labelInside && (
          <Text style={styles.labelInside}>{pct}%</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track:   { width: '100%', overflow: 'hidden' },
  fill:    { position: 'absolute', left: 0, top: 0 },
  label:   { fontSize: 11, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
  labelInside: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    textAlignVertical: 'center',
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
});
