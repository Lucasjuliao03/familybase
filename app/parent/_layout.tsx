import { View, StyleSheet } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { useRouteModuleGuard } from '../../src/hooks/useRouteModuleGuard';
import { BottomNavBar } from '../../src/components/ui/BottomNavBar';
import { LocationAlertsListener } from '../../src/components/location/LocationAlertsListener';

export default function ParentLayout() {
  useRouteModuleGuard('/parent');
  const segments: readonly string[] = useSegments();
  const isOnboarding = segments[1] === 'onboarding';

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }} />
      <LocationAlertsListener />
      {/* Barra inferior persistente: não re-monta ao navegar, então só o conteúdo acima troca. */}
      {!isOnboarding && <BottomNavBar role="parent" />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
