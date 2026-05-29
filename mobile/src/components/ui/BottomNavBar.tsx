import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Image,
  ImageSourcePropType,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { Colors, Shadow, FontSize, Radii } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { moduleAllowed, anyModuleAllowed } from '../../shared/lib/familyModules';

/** Altura reservada para padding inferior do conteúdo */
export const BOTTOM_NAV_HEIGHT = Platform.OS === 'ios' ? 88 : 72;

const mesadaIcon = require('../../../icon/cofrinho.png');
const homeIcon = require('../../../icon/home.png');
const comprasIcon = require('../../../icon/compras.png');
const saudeIcon = require('../../../icon/saude.png');
const tarefasIcon = require('../../../icon/tarefas.png');
const lojaIcon = require('../../../icon/loja.png');
const localizacaoIcon = require('../../../icon/localizacao.png');
const calendarioIcon = require('../../../icon/calendario.png');
const notasIcon = require('../../../icon/notas.png');
const perfilIcon = require('../../../icon/perfil.png');
const muralIcon = require('../../../icon/mural.png');

/** Nome base do ícone Ionicons. Inativo usa `${ion}-outline` (2D), ativo usa a versão preenchida. */
type IonName = string;

type Tab = {
  icon: string;
  ion: IonName;
  imageIcon?: ImageSourcePropType;
  label: string;
  route: string;
  module?: string;
  anyOf?: string[];
  end?: boolean;
};

const PARENT_TABS_ALL: Tab[] = [
  { icon: '🏠', ion: 'home',       label: 'Início',      route: '/parent', end: true, imageIcon: homeIcon },
  { icon: '📅', ion: 'calendar',   label: 'Calendário',  route: '/parent/calendar', module: 'calendar', imageIcon: calendarioIcon },
  { icon: '✅', ion: 'checkbox',   label: 'Tarefas',     route: '/parent/tasks', module: 'tasks', imageIcon: tarefasIcon },
  { icon: '📚', ion: 'book',       label: 'Notas',       route: '/parent/grades', module: 'grades', imageIcon: notasIcon },
  { icon: '💰', ion: 'wallet',     label: 'Mesada',      route: '/parent/allowance', anyOf: ['allowance', 'piggy_bank', 'goals'], imageIcon: mesadaIcon },
  { icon: '🛍️', ion: 'storefront', label: 'Loja',        route: '/parent/store', module: 'family_shop', imageIcon: lojaIcon },
  { icon: '❤️', ion: 'heart',      label: 'Saúde',       route: '/parent/health', module: 'health', imageIcon: saudeIcon },
  { icon: '📌', ion: 'megaphone',  label: 'Mural',       route: '/parent/mural', module: 'mural', imageIcon: muralIcon },
  { icon: '🛒', ion: 'cart',       label: 'Compras',     route: '/parent/shopping', module: 'shopping', imageIcon: comprasIcon },
  { icon: '📍', ion: 'location',   label: 'Localização', route: '/parent/location', module: 'location', imageIcon: localizacaoIcon },
  { icon: '👤', ion: 'person',     label: 'Perfil',      route: '/parent/profile', imageIcon: perfilIcon },
];

const CHILD_TABS_ALL: Tab[] = [
  { icon: '🏠', ion: 'home',       label: 'Início',      route: '/child', end: true, imageIcon: homeIcon },
  { icon: '✅', ion: 'checkbox',   label: 'Tarefas',     route: '/child/tasks', module: 'tasks', imageIcon: tarefasIcon },
  { icon: '📚', ion: 'book',       label: 'Notas',       route: '/child/grades', module: 'grades', imageIcon: notasIcon },
  { icon: '🐷', ion: 'wallet',     label: 'Mesada',      route: '/child/allowance', anyOf: ['allowance', 'piggy_bank', 'goals'], imageIcon: mesadaIcon },
  { icon: '🛒', ion: 'storefront', label: 'Loja',        route: '/child/store', module: 'family_shop', imageIcon: lojaIcon },
  { icon: '📅', ion: 'calendar',   label: 'Calendário',  route: '/child/calendar', module: 'calendar', imageIcon: calendarioIcon },
  { icon: '❤️', ion: 'heart',      label: 'Saúde',       route: '/child/health', module: 'health', imageIcon: saudeIcon },
  { icon: '📌', ion: 'megaphone',  label: 'Mural',       route: '/child/mural', module: 'mural', imageIcon: muralIcon },
  { icon: '🛒', ion: 'cart',       label: 'Compras',     route: '/child/shopping', module: 'shopping', imageIcon: comprasIcon },
  { icon: '📍', ion: 'location',   label: 'Localização', route: '/child/location', module: 'location', imageIcon: localizacaoIcon },
  { icon: '👤', ion: 'person',     label: 'Perfil',      route: '/child/profile', imageIcon: perfilIcon },
];

/**
 * Ícone usado no drawer "Mais Módulos" com o mesmo esquema 2D→3D da barra:
 * - Inativo  → Ionicons outline (2D) cinza.
 * - Ativo    → PNG 3D (um pouco maior) quando existir; senão Ionicons preenchido colorido.
 */
function TabIcon({ tab, active, size = 'drawer' }: { tab: Tab; active: boolean; size?: 'bar' | 'drawer' }) {
  if (active && tab.imageIcon) {
    const dim = size === 'drawer' ? 50 : 36;
    return (
      <Image
        source={tab.imageIcon}
        style={{ width: dim, height: dim, backgroundColor: 'transparent' }}
        resizeMode="contain"
      />
    );
  }
  const iconSize = size === 'drawer' ? 28 : 24;
  return (
    <Ionicons
      name={(active ? tab.ion : `${tab.ion}-outline`) as any}
      size={iconSize}
      color={active ? Colors.primary : Colors.textMuted}
    />
  );
}

const BAR_ICON_SIZE = 26;
const BAR_IMG_SIZE = 32;

/**
 * Ícone da barra:
 * - Inativo  → ícone 2D vetorial (Ionicons outline) em cinza.
 * - Ativo    → ícone 3D já definido (PNG) quando existir; senão Ionicons preenchido colorido.
 * As duas camadas fazem cross-fade + leve escala, controladas por `progress` (0→1).
 */
function AnimatedBarIcon({ tab, progress }: { tab: Tab; progress: Animated.Value }) {
  const has3d = !!tab.imageIcon;
  const inactiveOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const activeOpacity = progress;
  const inactiveScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });
  const activeScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <View style={styles.iconBox}>
      {/* Camada 2D cinza (estado inativo) */}
      <Animated.View
        pointerEvents="none"
        style={[styles.iconLayer, { opacity: inactiveOpacity, transform: [{ scale: inactiveScale }] }]}
      >
        <Ionicons name={`${tab.ion}-outline` as any} size={BAR_ICON_SIZE} color={Colors.textMuted} />
      </Animated.View>

      {has3d ? (
        // Ícone 3D grande, ancorado pela base (junto ao texto) e crescendo para cima,
        // saindo da barra. A barra não muda de altura (overflow + transform).
        <Animated.View
          pointerEvents="none"
          style={[styles.iconLayer3d, { opacity: activeOpacity, transform: [{ scale: activeScale }] }]}
        >
          <Image source={tab.imageIcon} resizeMode="contain" style={styles.iconImg3d} />
        </Animated.View>
      ) : (
        // Sem PNG 3D: usa o Ionicons preenchido colorido, centrado.
        <Animated.View
          pointerEvents="none"
          style={[styles.iconLayer, { opacity: activeOpacity, transform: [{ scale: activeScale }] }]}
        >
          <Ionicons name={tab.ion as any} size={BAR_ICON_SIZE} color={Colors.primary} />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Aba individual da barra inferior.
 * - Ícone troca de 2D cinza para 3D colorido ao selecionar (com leve escala).
 * - O nome da aba fica sempre visível abaixo, mudando de cinza para roxo.
 * Tudo via `Animated` nativo, sem travar a UI.
 */
function AnimatedTab({
  tab,
  active,
  onPress,
}: {
  tab: Tab;
  active: boolean;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const labelColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.textMuted, Colors.primary],
  });

  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <AnimatedBarIcon tab={tab} progress={progress} />
      <Animated.Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
        {tab.label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

interface Props {
  role?: 'parent' | 'child';
}

export function BottomNavBar({ role = 'parent' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { modules } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const allTabs = role === 'child' ? CHILD_TABS_ALL : PARENT_TABS_ALL;

  const enabledTabs = allTabs.filter((tab) => {
    if (tab.module) return moduleAllowed(modules, tab.module);
    if (tab.anyOf) return anyModuleAllowed(modules, tab.anyOf);
    return true;
  });

  const pinnedCount = 4;

  const currentIdx = enabledTabs.findIndex((tab) => {
    if (tab.end) return pathname === tab.route;
    return pathname.startsWith(tab.route);
  });

  let pinnedItems: Tab[] = [];
  let drawerItems: Tab[] = [];

  if (enabledTabs.length > 5) {
    if (currentIdx >= pinnedCount - 1) {
      const currentTab = enabledTabs[currentIdx];
      pinnedItems = [...enabledTabs.slice(0, pinnedCount - 1), currentTab];
      drawerItems = enabledTabs.filter((it) => !pinnedItems.includes(it));
    } else {
      pinnedItems = enabledTabs.slice(0, pinnedCount);
      drawerItems = enabledTabs.slice(pinnedCount);
    }
  } else {
    pinnedItems = enabledTabs;
    drawerItems = [];
  }

  const hasMore = drawerItems.length > 0;

  const navigateTo = (route: string) => {
    setDrawerOpen(false);
    router.push(route as any);
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.container}>
        {pinnedItems.map((tab) => {
          const active = tab.end
            ? pathname === tab.route
            : pathname === tab.route || pathname.startsWith(tab.route + '/');
          return (
            <AnimatedTab
              key={tab.route}
              tab={tab}
              active={active}
              onPress={() => navigateTo(tab.route)}
            />
          );
        })}

        {hasMore && (
          <AnimatedTab
            key="__more__"
            tab={{ icon: '⋯', ion: 'apps', label: 'Mais', route: '__more__' }}
            active={drawerOpen}
            onPress={() => setDrawerOpen(true)}
          />
        )}
      </View>

      <Modal
        visible={drawerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setDrawerOpen(false)} />
          <View style={styles.drawer}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Mais Módulos 🎛️</Text>

            <View style={styles.grid}>
              {drawerItems.map((tab) => {
                const active = pathname === tab.route || pathname.startsWith(tab.route + '/');
                return (
                  <TouchableOpacity
                    key={tab.route}
                    style={styles.gridItem}
                    onPress={() => navigateTo(tab.route)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.gridIconWrap, active && styles.gridIconWrapActive]}>
                      <TabIcon tab={tab} active={active} size="drawer" />
                    </View>
                    <Text style={[styles.gridLabel, active && styles.gridLabelActive]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadow.md,
    shadowOffset: { width: 0, height: -4 },
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  iconBox: {
    width: BAR_IMG_SIZE,
    height: BAR_IMG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    width: BAR_IMG_SIZE,
    height: BAR_IMG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer3d: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconImg3d: {
    width: BAR_IMG_SIZE * 2,
    height: BAR_IMG_SIZE * 2,
    backgroundColor: 'transparent',
  },
  icon: { fontSize: 24, lineHeight: 28, textAlign: 'center', color: Colors.textMuted },
  drawerEmoji: { fontSize: 24 },
  tabImageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    marginBottom: -6,
  },
  tabImageActive: { opacity: 1, transform: [{ scale: 1.06 }] },
  tabImageInactive: { opacity: 0.72 },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 3 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 11, 75, 0.4)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  drawer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    maxHeight: '70%',
    ...Shadow.lg,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 20,
  },
  drawerTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'flex-start',
  },
  gridItem: {
    width: '21%',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  gridIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  gridIconWrapActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  gridLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  gridLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
