import React, { createContext, useContext, useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  useSafeAreaFrame,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

const consumedInsets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const WindowInsetsContext = createContext<EdgeInsets | null>(null);

/** Use for a Modal/portal that occupies the physical window, outside the safe content. */
export function useWindowSafeAreaInsets() {
  const windowInsets = useContext(WindowInsetsContext);
  const contentInsets = useSafeAreaInsets();
  return windowInsets ?? contentInsets;
}

/** Own all system insets once. Descendants receive insets relative to the safe content. */
export function AppSafeArea({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const contentMetrics = useMemo(() => ({
    insets: consumedInsets,
    frame: {
      x: frame.x + insets.left,
      y: frame.y + insets.top,
      width: Math.max(0, frame.width - insets.left - insets.right),
      height: Math.max(0, frame.height - insets.top - insets.bottom),
    },
  }), [frame, insets]);

  return (
    <WindowInsetsContext.Provider value={insets}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']} testID="app-safe-area">
        {Platform.OS === 'web' ? (
          // The web provider reports window CSS env() insets even when nested.
          // Scope these contexts explicitly after the outer view consumed them.
          <SafeAreaFrameContext.Provider value={contentMetrics.frame}>
            <SafeAreaInsetsContext.Provider value={consumedInsets}>
              {children}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        ) : (
          // Native descendants (including future SafeAreaViews) measure this
          // provider inside the padded frame, so they cannot add the inset twice.
          <SafeAreaProvider initialMetrics={contentMetrics}>
            {children}
          </SafeAreaProvider>
        )}
      </SafeAreaView>
    </WindowInsetsContext.Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#ffffff' } });
