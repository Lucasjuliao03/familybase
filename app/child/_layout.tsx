import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useRouteModuleGuard } from '../../src/hooks/useRouteModuleGuard';
import { BottomNavBar } from '../../src/components/ui/BottomNavBar';
import { ChildProxyBanner } from '../../src/components/proxy/ChildProxyBanner';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../src/theme';
import { ChildLocationTracker } from '../../src/components/location/ChildLocationTracker';
import { BottomNavigationProvider } from '../../src/contexts/BottomNavigationContext';

export default function ChildLayout() {
  useRouteModuleGuard('/child');
  const { user, family, childProfile, loading, isChildProxy } = useAuth();
  const [proxyHeaderH, setProxyHeaderH] = useState(0);

  useEffect(() => {
    if (!isChildProxy) setProxyHeaderH(0);
  }, [isChildProxy]);

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: {
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: isChildProxy ? proxyHeaderH : 0,
      },
    }),
    [isChildProxy, proxyHeaderH],
  );

  // A atualização de perfil acontece ao abrir vários módulos. Manter o Stack
  // montado durante essa atualização preserva a rota atual e os modais abertos.
  if (loading || !family?.id || !childProfile?.id || (user?.role !== 'child' && !isChildProxy)) {
    return <View style={[styles.root,{ justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color={Colors.primary} /></View>;
  }
  return (
    <BottomNavigationProvider>
      <View style={styles.root}>
        <Stack screenOptions={screenOptions} />
        <ChildLocationTracker />
        <ChildProxyBanner onHeightChange={setProxyHeaderH} />
        <BottomNavBar role="child" />
      </View>
    </BottomNavigationProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
