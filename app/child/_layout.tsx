import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useRouteModuleGuard } from '../../src/hooks/useRouteModuleGuard';
import { BottomNavBar } from '../../src/components/ui/BottomNavBar';
import { ChildProxyBanner } from '../../src/components/proxy/ChildProxyBanner';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../src/theme';

export default function ChildLayout() {
  useRouteModuleGuard('/child');
  const { isChildProxy } = useAuth();
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

  return (
    <View style={styles.root}>
      <Stack screenOptions={screenOptions} />
      <ChildProxyBanner onHeightChange={setProxyHeaderH} />
      <BottomNavBar role="child" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
