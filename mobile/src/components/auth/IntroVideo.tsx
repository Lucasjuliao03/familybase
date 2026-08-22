import React, { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useEventListener } from "expo";
import {
  VideoView,
  useVideoPlayer,
  StatusChangeEventPayload,
} from "expo-video";
interface Props {
  onFinish: () => void;
}

const videoSource = require("../../../icon/intro.mp4");
const finishOnceCounter = { current: 0 };

export function IntroVideo({ onFinish }: Props) {
  const [hasError, setHasError] = useState(false);
  const finishedRef = useRef(false);
  console.info("IntroVideo");

  const finishOnce = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
    finishOnceCounter.current += 1;
    console.info("finishOnce", finishOnceCounter.current);
  };

  const player = useVideoPlayer(videoSource, (player) => {
    try {
      player.play();
      player.volume = 1.0;
      console.info("Player iniciado com sucesso");
    } catch {
      console.error("Erro ao iniciar o player.");
      setHasError(true);
      finishOnce();
    }
  });

  // Listener events
  const handleStatusChange = ({ status, error }: StatusChangeEventPayload) => {
    if (error) {
      console.error(
        "[IntroVideo] Erro na reprodução do vídeo. Avançando para a próxima tela...",
        error.message,
        status,
      );
      setHasError(true);
      finishOnce();
    }
  };
  useEventListener(player, "statusChange", handleStatusChange);
  useEventListener(player, "playToEnd", finishOnce);

  // Nunca bloquear o utilizador mais de 5s — login fica acessível depressa
  // Timeout de segurança (5s)
  useEffect(() => {
    const autoSkip = setTimeout(finishOnce, 5000);
    return () => clearTimeout(autoSkip);
  }, []);

  if (hasError) {
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
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <TouchableOpacity
        style={styles.skipButton}
        onPress={finishOnce}
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
    backgroundColor: "#000000",
  },
  skipButton: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    zIndex: 999,
  },
  skipText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
