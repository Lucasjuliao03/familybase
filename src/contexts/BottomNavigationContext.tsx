import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';

/** Initial reservation until the persistent bar reports its actual layout. */
export const BOTTOM_NAV_HEIGHT = Platform.OS === 'ios' ? 88 : 72;
const NavigationContext = createContext({ height: BOTTOM_NAV_HEIGHT, onLayout: (_event: LayoutChangeEvent) => {} });

export function BottomNavigationProvider({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState(BOTTOM_NAV_HEIGHT);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (Number.isFinite(measured) && measured > 0) setHeight(measured);
  }, []);
  const value = useMemo(() => ({ height, onLayout }), [height, onLayout]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export const useBottomNavigationHeight = () => useContext(NavigationContext).height;
export const useBottomNavigationLayout = () => useContext(NavigationContext).onLayout;
