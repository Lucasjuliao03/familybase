import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = { children: React.ReactNode };
type State = { failed: boolean };

/** Keeps an unexpected screen render error from leaving the user on a blank page. */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#1e293b', textAlign: 'center' }}>Ocorreu um erro nesta tela</Text>
        <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center', marginTop: 12 }}>Tente carregar novamente. Se o problema continuar, feche e abra o aplicativo.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => this.setState({ failed: false })} style={{ backgroundColor: '#4f46e5', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginTop: 24 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
