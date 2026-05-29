import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Colors, Radii, FontSize, Shadow } from '../../theme';

interface ModuleHeaderProps {
  /** Nome do módulo (ex.: "Gerenciador de Tarefas"). */
  title: string;
  /** Emoji exibido ao lado do nome do módulo. */
  emoji?: string;
  subtitle?: string;
  /** Mostra o botão de voltar. */
  onBack?: () => void;
  /** Conteúdo opcional no canto direito (ações). */
  right?: ReactNode;
}

/**
 * Cabeçalho padrão dos módulos (gestor). Visual uniforme em todos os módulos:
 * superfície branca com cantos inferiores arredondados, nome do módulo + emoji,
 * subtítulo e botão de voltar. Usado para padronizar Tarefas, Mesada, etc.
 */
export function ModuleHeader({ title, emoji, subtitle, onBack, right }: ModuleHeaderProps) {
  return (
    <View style={s.header}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.8}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
      ) : null}

      <View style={s.center}>
        <Text style={s.title} numberOfLines={1}>
          {title}{emoji ? ` ${emoji}` : ''}
        </Text>
        {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>

      {right ? <View style={s.right}>{right}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 46,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Radii.lg,
    borderBottomRightRadius: Radii.lg,
    ...Shadow.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  backBtnText: { fontSize: 24, color: Colors.primary, fontWeight: 'bold', marginTop: -4 },
  center: { flex: 1 },
  title: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.text },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  right: { marginLeft: 'auto' },
});
