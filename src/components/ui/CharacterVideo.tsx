import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

class VideoBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn('[CharacterVideo]', error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Playback({ source }: { source: number }) {
  const player = useVideoPlayer(source, instance => {
    instance.loop = true;
    instance.muted = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const opacity = useRef(new Animated.Value(0)).current;
  const revealed = useRef(false);
  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [opacity]);
  useEffect(() => {
    player.play();
    // useVideoPlayer releases the native player on unmount. Calling pause in a
    // cleanup runs after that release and crashes when changing characters.
  }, [player]);
  if (status === 'error') return null;
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
    <VideoView player={player} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
      contentFit="cover" nativeControls={false} playsInline surfaceType="textureView"
      useExoShutter={false} onFirstFrameRender={reveal} />
  </Animated.View>;
}

/** The scene image underneath remains usable even when native video fails. */
export function CharacterVideo({ source }: { source: number }) {
  return <VideoBoundary><Playback source={source} /></VideoBoundary>;
}
