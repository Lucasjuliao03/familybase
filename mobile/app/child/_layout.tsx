import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useRouteModuleGuard } from '../../src/hooks/useRouteModuleGuard';
import { BottomNavBar } from '../../src/components/ui/BottomNavBar';
import { ChildProxyBanner } from '../../src/components/proxy/ChildProxyBanner';

export default function ChildLayout() {
  useRouteModuleGuard('/child');

  return (
    <View style={styles.root}>
      {/* Destaque no topo quando um pai está a atuar como o filho (modo proxy). */}
      <ChildProxyBanner />
      <Stack screenOptions={{ headerShown: false }} />
      {/* Barra inferior persistente: não re-monta ao navegar, então só o conteúdo acima troca. */}
      <BottomNavBar role="child" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
