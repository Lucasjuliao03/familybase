import React, { useState, useEffect } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { ChildModeHeader } from './ChildModeHeader';

type Props = {
  /** Altura medida do header — usada pelo layout para empurrar o conteúdo para baixo. */
  onHeightChange?: (height: number) => void;
};

/**
 * Header fixo do modo proxy (pai visualizando como filho).
 * Renderizado em overlay absoluto acima das telas /child/*.
 */
export function ChildProxyBanner({ onHeightChange }: Props) {
  const router = useRouter();
  const { isChildProxy, actingAsChild, user, family, exitChildProxy } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isChildProxy) onHeightChange?.(0);
  }, [isChildProxy, onHeightChange]);

  if (!isChildProxy) return null;

  const childName =
    actingAsChild?.name?.split(' ')[0] || actingAsChild?.name || 'filho';
  const parentName = user?.name?.split(' ')[0] || user?.name || 'pai';

  const handleExit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exitChildProxy();
      router.replace('/parent');
    } finally {
      setBusy(false);
    }
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  return (
    <View style={s.overlay} onLayout={handleLayout} pointerEvents="box-none">
      <ChildModeHeader
        childName={childName}
        familyName={family?.name}
        parentName={parentName}
        avatarUri={actingAsChild?.avatar_url ?? null}
        avatarPreset={actingAsChild?.avatar_preset ?? null}
        onBackToParent={handleExit}
        busy={busy}
      />
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: 200,
  },
});
