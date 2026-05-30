import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';

interface Props {
  onFinish: () => void;
}

// Carregamento dinâmico e seguro de expo-av para evitar crashes nativos
let Video: any = null;
let ResizeMode: any = null;
let expoAvAvailable = false;

try {
  const expoAv = require('expo-av');
  Video = expoAv.Video;
  ResizeMode = expoAv.ResizeMode;
  expoAvAvailable = !!Video;
} catch (e) {
  console.log('[IntroVideo] Módulo expo-av não está disponível nativamente neste build. Utilizando fallback.');
}

export function IntroVideo({ onFinish }: Props) {
  const videoRef = useRef<any>(null);
  const [hasError, setHasError] = useState(!expoAvAvailable);

  useEffect(() => {
    // Se o expo-av não estiver disponível nativamente, avança de imediato
    if (!expoAvAvailable) {
      onFinish();
      return;
    }

    if (videoRef.current) {
      videoRef.current.setVolumeAsync(1.0).catch(() => {});
    }
  }, [onFinish]);

  if (hasError || !Video) {
    // Renderiza container vazio enquanto o useEffect processa o desvio para a próxima tela
    return (
      <View style={styles.container}>
        <StatusBar hidden />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <Video
        ref={videoRef}
        source={require('../../../icon/intro.mp4')}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        onError={() => {
          console.log('[IntroVideo] Erro na reprodução do vídeo. Avançando para a próxima tela...');
          onFinish();
        }}
        onPlaybackStatusUpdate={(status: any) => {
          if (status.isLoaded && status.didJustFinish) {
            onFinish();
          }
        }}
      />
      
      {/* Botão de Pular no canto superior direito */}
      <TouchableOpacity 
        style={styles.skipButton} 
        onPress={onFinish}
        activeOpacity={0.8}
      >
        <Text style={styles.skipText}>Pular ⏭️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 999,
  },
  skipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
