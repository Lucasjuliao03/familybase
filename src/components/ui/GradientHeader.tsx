import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize } from '../../theme';

interface ActionBtn {
  label: string;
  onPress: () => void;
}

interface Props {
  title: string;
  subtitle?: string;
  leftAction?: ActionBtn;
  rightAction?: ActionBtn;
  children?: React.ReactNode;
  extraBottom?: number;
  centerContent?: React.ReactNode;
}

export function GradientHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  children,
  extraBottom = 0,
  centerContent,
}: Props) {
  return (
    <LinearGradient
      colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingBottom: 20 + extraBottom }]}
    >
      <StatusBar barStyle="light-content" />

      {/* Top action row */}
      {(leftAction || rightAction) && (
        <View style={styles.topRow}>
          {leftAction ? (
            <TouchableOpacity style={styles.actionBtn} onPress={leftAction.onPress} activeOpacity={0.8}>
              <Text style={styles.actionBtnText}>{leftAction.label}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionBtn} />
          )}
          {rightAction ? (
            <TouchableOpacity style={styles.actionBtn} onPress={rightAction.onPress} activeOpacity={0.8}>
              <Text style={styles.actionBtnText}>{rightAction.label}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionBtn} />
          )}
        </View>
      )}

      {/* Center content (e.g. family illustration) */}
      {centerContent}

      {/* Title & subtitle */}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 52,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionBtn: {
    minWidth: 44,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  actionBtnText: {
    color: Colors.textWhite,
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textWhite,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
  },
});
