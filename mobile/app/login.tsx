import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ScrollView, StatusBar, ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../src/theme';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { AppLogo } from '../src/components/ui/AppLogo';
import {
  isBiometricSupported,
  isBiometricEnabled,
  getBiometricLabel,
  getCredentialsWithBiometric,
  enableBiometricLogin,
  runBiometricPrompt,
} from '../src/lib/biometrics';
import {
  getRemainingLockMs,
  registerFailedAttempt,
  resetAttempts,
} from '../src/lib/loginAttempts';

function fmtMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLabel, setBioLabel] = useState('Biometria');

  const [lockMs, setLockMs] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estado inicial de biometria + bloqueio.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [supported, enabled, label, remaining] = await Promise.all([
        isBiometricSupported(),
        isBiometricEnabled(),
        getBiometricLabel(),
        getRemainingLockMs(),
      ]);
      if (!mounted) return;
      setBioSupported(supported);
      setBioEnabled(enabled);
      setBioLabel(label);
      setLockMs(remaining);
      // Se já há biometria configurada, tenta autenticar de imediato.
      if (supported && enabled && remaining <= 0) {
        handleBiometricLogin();
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contagem regressiva do bloqueio.
  useEffect(() => {
    if (lockMs <= 0) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    if (!tickRef.current) {
      tickRef.current = setInterval(async () => {
        const remaining = await getRemainingLockMs();
        setLockMs(remaining);
      }, 1000);
    }
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    };
  }, [lockMs]);

  const offerEnableBiometric = useCallback(async (em: string, pw: string) => {
    try {
      if (!(await isBiometricSupported())) return;
      if (await isBiometricEnabled()) return;
      const label = await getBiometricLabel();
      Alert.alert(
        `Ativar ${label}?`,
        `Entre mais rápido nas próximas vezes usando o ${label}.`,
        [
          { text: 'Agora não', style: 'cancel' },
          {
            text: 'Ativar',
            onPress: async () => {
              const ok = await runBiometricPrompt(`Ativar ${label}`);
              if (ok) await enableBiometricLogin({ email: em, password: pw });
            },
          },
        ],
      );
    } catch { /* noop */ }
  }, []);

  const doLogin = useCallback(async (em: string, pw: string) => {
    const remaining = await getRemainingLockMs();
    if (remaining > 0) {
      setLockMs(remaining);
      Alert.alert('Acesso bloqueado', `Muitas tentativas. Tente novamente em ${fmtMs(remaining)}.`);
      return;
    }
    try {
      setSubmitting(true);
      await login(em, pw);
      await resetAttempts();
      setLockMs(0);
    } catch (err) {
      const blockedFor = await registerFailedAttempt();
      if (blockedFor > 0) {
        setLockMs(blockedFor);
        Alert.alert('Acesso bloqueado', `Muitas tentativas inválidas. Aguarde ${fmtMs(blockedFor)}.`);
      } else {
        Alert.alert('Erro de login', (err as Error)?.message || 'Email ou senha incorretos.');
      }
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, [login]);

  const handleLogin = useCallback(async () => {
    const em = email.trim().toLowerCase();
    if (!em || !password) {
      Alert.alert('Campos obrigatórios', 'Preencha o email e a senha.');
      return;
    }
    try {
      await doLogin(em, password);
      await offerEnableBiometric(em, password);
    } catch { /* erro já tratado em doLogin */ }
  }, [email, password, doLogin, offerEnableBiometric]);

  const handleBiometricLogin = useCallback(async () => {
    const remaining = await getRemainingLockMs();
    if (remaining > 0) {
      setLockMs(remaining);
      Alert.alert('Acesso bloqueado', `Aguarde ${fmtMs(remaining)} antes de tentar novamente.`);
      return;
    }
    if (!(await isBiometricEnabled())) {
      Alert.alert(
        'Biometria não configurada',
        'Faça login com email e senha uma vez e ative a biometria para usá-la nas próximas vezes.',
      );
      return;
    }
    const creds = await getCredentialsWithBiometric('Entrar com biometria');
    if (!creds) return; // cancelado ou falhou
    try {
      await doLogin(creds.email, creds.password);
    } catch { /* erro já tratado */ }
  }, [doLogin]);

  const locked = lockMs > 0;

  return (
    <ImageBackground
      source={require('../icon/fundo.png')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar barStyle="light-content" />
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <AppLogo size="lg" />
            <Text style={styles.heroSub}>Organizar sua família ficou mais fácil e divertido! 💛</Text>
          </View>

          {/* PAINEL GLASSMORPHIC */}
          <View style={styles.panel}>

          <Text style={styles.welcome}>Bem-vindo de volta! 👋</Text>
          <Text style={styles.panelSub}>Faça login para continuar</Text>

          {/* Email */}
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>✉️</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="seu@email.com"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="next"
              editable={!submitting}
            />
          </View>

          {/* Senha */}
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!submitting}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Esqueceu senha */}
          <TouchableOpacity style={styles.forgotRow}>
            <Text style={styles.forgotText}>Esqueceu sua senha?</Text>
          </TouchableOpacity>

          {/* Aviso de bloqueio */}
          {locked && (
            <View style={styles.lockBanner}>
              <Text style={styles.lockText}>🔒 Acesso bloqueado por segurança. Aguarde {fmtMs(lockMs)}.</Text>
            </View>
          )}

          {/* Botão entrar */}
          <PrimaryButton
            label="Entrar"
            onPress={handleLogin}
            loading={submitting}
            disabled={locked}
            style={styles.loginBtn}
          />

          {/* Biometria (apenas se suportada) */}
          {bioSupported && (
            <>
              <View style={styles.separator}>
                <View style={styles.sepLine} />
                <Text style={styles.sepText}>ou</Text>
                <View style={styles.sepLine} />
              </View>

              <TouchableOpacity
                style={[styles.bioBtn, (locked || submitting) && styles.bioBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleBiometricLogin}
                disabled={locked || submitting}
              >
                <Text style={styles.bioIcon}>🔐</Text>
                <Text style={styles.bioBtnText}>
                  {bioEnabled ? `Entrar com ${bioLabel}` : `Ativar ${bioLabel} após login`}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Nova família */}
          <View style={styles.newFamilyWrap}>
            <Text style={styles.newFamilyHint}>Ainda não tem uma família?</Text>
            <TouchableOpacity
              style={styles.newFamilyBtn}
              onPress={() => router.push('/register')}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <Text style={styles.newFamilyText}>+ Nova Família</Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1 },
  root: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 24, marginTop: 20, gap: 12 },
  heroSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Panel
  panel: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    marginHorizontal: 20,
    ...Shadow.lg,
  },
  welcome: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  panelSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },

  // Inputs
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
    gap: 10,
  },
  inputIcon: { fontSize: 18 },
  input: { flex: 1, fontSize: FontSize.base, color: Colors.text },
  eyeIcon: { fontSize: 18 },

  forgotRow: { alignItems: 'flex-end', marginBottom: 20, marginTop: -4 },
  forgotText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },

  loginBtn: { marginBottom: 20 },

  lockBanner: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: Radii.md, padding: 12, marginBottom: 16,
  },
  lockText: { color: '#B91C1C', fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center' },

  // Separator
  separator: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sepLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  sepText: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Biometria
  bioBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.full,
    paddingVertical: 14, marginBottom: 24, backgroundColor: Colors.surface,
  },
  bioBtnDisabled: { opacity: 0.5 },
  bioIcon: { fontSize: 20 },
  bioBtnText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text },

  // Nova família
  newFamilyWrap: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 20,
    gap: 10,
  },
  newFamilyHint: { fontSize: FontSize.sm, color: Colors.textMuted },
  newFamilyBtn: {
    borderWidth: 2, borderColor: Colors.primary, borderRadius: Radii.full,
    paddingVertical: 14, paddingHorizontal: 28, width: '100%', alignItems: 'center',
  },
  newFamilyText: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '800' },
});
