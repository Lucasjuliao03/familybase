import { View, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * Tela inicial — apenas spinner.
 * A navegação (para /login ou /<role>) é feita pelo RootLayoutNav
 * em app/_layout.tsx via useEffect + useSegments + useRouter.
 */
export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
});
