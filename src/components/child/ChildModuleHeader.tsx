import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { getMascot } from '../../lib/mascotCatalog';
import { ChildModuleId, getChildModuleHeader } from '../../lib/moduleHeaderCatalog';
import { Colors, FontSize } from '../../theme';

type Props = {
  moduleId: ChildModuleId;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  actionDisabled?: boolean;
};

export function ChildModuleHeader({ moduleId, title, subtitle, actionLabel, actionIcon, onAction, actionDisabled }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { childProfile } = useAuth();
  const mascot = getMascot(childProfile?.mascot_id);
  const source = getChildModuleHeader(childProfile?.mascot_id, moduleId);

  return (
    <View style={styles.container}>
      {source ? (
        <Image
          source={source}
          style={[styles.banner, { height: width / 3 }]}
          resizeMode="cover"
          accessibilityLabel={`${title} com ${mascot?.name ?? 'mascote'}`}
        />
      ) : (
        <View style={[styles.fallback, { height: width / 3 }]}><Text style={styles.fallbackTitle}>{title}</Text></View>
      )}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={24} color={Colors.primary} />
      </TouchableOpacity>
      <View style={styles.controls}>
        {subtitle ? (
          <View style={styles.subtitlePill}><Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text></View>
        ) : null}
        {onAction && actionLabel ? (
          <TouchableOpacity
            style={[styles.actionButton, actionDisabled && styles.disabled]}
            onPress={onAction}
            disabled={actionDisabled}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            activeOpacity={0.8}
          >
            {actionIcon ? <Ionicons name={actionIcon} size={14} color={Colors.primary} /> : null}
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', position: 'relative', backgroundColor: Colors.surface },
  banner: { width: '100%', backgroundColor: '#DCEFFA' },
  fallback: { width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLighter },
  fallbackTitle: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '900' },
  controls: { position: 'absolute', left: 12, right: 12, bottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  backButton: { position: 'absolute', top: 10, left: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', elevation: 3, shadowColor: '#243269', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  actionButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 16, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', elevation: 2, shadowColor: '#243269', shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  actionText: { color: Colors.primary, fontSize: 10, fontWeight: '900' },
  subtitlePill: { maxWidth: '56%', flexShrink: 1, borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  subtitle: { color: Colors.textSecondary, fontSize: 9, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
