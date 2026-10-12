import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ScrollView, StatusBar, ImageBackground, Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../src/theme';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { AppLogo } from '../src/components/ui/AppLogo';
import { normalizeFamilyCode } from '../src/lib/familyIdentity';
import {
  isBiometricSupported,
  isBiometricEnabled,
  getBiometricLabel,
  getCredentialsWithBiometric,
  enableBiometricLogin,
  disableBiometricLogin,
  biometricMatchesIdentity,
} from '../src/lib/biometrics';
import { canRememberDeviceLogin, deviceLogin } from '../src/lib/deviceLogin';
import { loginIdentity } from '../src/lib/rememberedLogin';
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
  const [familyMode, setFamilyMode] = useState(false);
  const [familyCode, setFamilyCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const signingIn = useRef(false);
  const edited = useRef(false);
  const [remember, setRemember] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [deviceError, setDeviceError] = useState('');

  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLabel, setBioLabel] = useState('Biometria');

  const [lockMs, setLockMs] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    deviceLogin.read().then(identity => {
      if (!active || edited.current || !identity) return;
      setFamilyMode(identity.mode === 'family');
      if (identity.mode === 'family') { setFamilyCode(identity.familyCode); setUsername(identity.username); }
      else setEmail(identity.email);
      setRemember(true); setSavedHint(true);
    }).catch(() => { /* Login still works without local storage. */ });
    return () => { active = false; };
  }, []);

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
      if (!edited.current) setBioEnabled(enabled);
      setBioLabel(label);
      setLockMs(remaining);
      // Biometric login is user-initiated so another account can be selected.
    })();
    return () => { mounted = false; };
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

  const offerEnableBiometric = useCallback(async (em: string, pw: string, code?: string) => {
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
              try {
                await enableBiometricLogin({ email: em, password: pw, ...(code ? { familyCode: code } : {}) });
                setBioEnabled(await isBiometricEnabled());
              } catch { Alert.alert('Biometria', 'O login foi concluído, mas não foi possível ativar a biometria. Você pode continuar usando sua senha.'); }
            },
          },
        ],
      );
    } catch { /* noop */ }
  }, []);

  const doLogin = useCallback(async (em: string, pw: string, code?: string, biometric = false) => {
    if (signingIn.current || forgetting) return false;
    signingIn.current = true;
    setSubmitting(true);
    try {
      const remaining = await getRemainingLockMs();
      if (remaining > 0) {
        setLockMs(remaining);
        Alert.alert('Acesso bloqueado', `Muitas tentativas. Tente novamente em ${fmtMs(remaining)}.`);
        return false;
      }
      await login(em, pw, code);
      const identity = loginIdentity(em, code);
      if (!biometric && identity && !(await biometricMatchesIdentity(identity))) {
        try { await disableBiometricLogin(); }
        catch { Alert.alert('Dados do aparelho', 'O login foi realizado, mas não foi possível apagar a biometria anterior. Use “Esquecer dados deste aparelho” no perfil antes de compartilhar o celular.'); }
        setBioEnabled(false);
      }
      // Save only successful logins; storage errors must not invalidate login.
      try {
        if (remember && identity) await deviceLogin.save(identity);
        else await deviceLogin.clear();
      } catch {
        try { await deviceLogin.clear(); } catch { /* Report the storage problem separately. */ }
        Alert.alert('Acesso realizado', 'Não foi possível lembrar os dados neste aparelho. No próximo acesso, digite-os novamente.');
      }
      try { await resetAttempts(); } catch { /* A completed authentication stays valid. */ }
      setLockMs(0);
      return true;
    } catch (err) {
      const invalidCredentials=(err as Error & { code?: string })?.code==='invalid_credentials';
      const blockedFor = invalidCredentials ? await registerFailedAttempt() : 0;
      if (blockedFor > 0) {
        setLockMs(blockedFor);
        Alert.alert('Acesso bloqueado', `Muitas tentativas inválidas. Aguarde ${fmtMs(blockedFor)}.`);
      } else {
        Alert.alert('Erro de login', (err as Error)?.message || 'Email ou senha incorretos.');
      }
      throw err;
    } finally {
      setSubmitting(false);
      signingIn.current = false;
    }
  }, [login, remember, forgetting]);

  const forgetDevice = useCallback(async () => {
    edited.current = true;
    setForgetting(true); setDeviceError('');
    setEmail(''); setFamilyCode(''); setUsername(''); setPassword(''); setShowPass(false);
    setSavedHint(false); setRemember(false); setBioEnabled(false);
    try { await deviceLogin.clear(); await disableBiometricLogin(); }
    catch { setDeviceError('Não foi possível apagar os dados salvos. Tente novamente antes de compartilhar o aparelho.'); }
    finally { setForgetting(false); }
  }, []);

  const handleLogin = useCallback(async () => {
    edited.current = true;
    const em = (familyMode ? username : email).trim().toLowerCase();
    const code = familyMode ? normalizeFamilyCode(familyCode) : undefined;
    if (familyMode && !code) { Alert.alert('Código da família', 'Informe o código recebido do responsável.'); return; }
    if (!em || !password) {
      Alert.alert('Campos obrigatórios', familyMode ? 'Preencha o usuário e a senha.' : 'Preencha o e-mail e a senha.');
      return;
    }
    try {
      if(await doLogin(em, password, code)) await offerEnableBiometric(em, password, code);
    } catch { /* erro já tratado em doLogin */ }
  }, [email, username, familyMode, familyCode, password, doLogin, offerEnableBiometric]);

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
    const typedLogin = familyMode ? username.trim() : email.trim();
    if (typedLogin || (familyMode && familyCode.trim())) {
      const current = loginIdentity(typedLogin, familyMode ? familyCode : undefined);
      const saved = loginIdentity(creds.email, creds.familyCode);
      if (!current || JSON.stringify(current) !== JSON.stringify(saved)) {
        Alert.alert('Outra conta selecionada', 'A biometria pertence ao acesso anterior. Use a senha desta conta ou escolha “Esquecer dados e usar outra conta”.');
        return;
      }
    }
    try {
      await doLogin(creds.email, creds.password, creds.familyCode, true);
    } catch (error) {
      if ((error as Error & { code?: string })?.code === 'invalid_credentials') {
        await disableBiometricLogin(); setBioEnabled(false);
      }
    }
  }, [doLogin, familyMode, familyCode, username, email]);

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
        <StatusBar barStyle="dark-content" />
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

          <View style={{flexDirection:'row',gap:8,marginBottom:16}}>
            {[false,true].map(mode => <TouchableOpacity key={String(mode)} accessibilityRole="tab" accessibilityState={{selected:familyMode===mode}} disabled={submitting || forgetting} onPress={()=>{edited.current=true;setFamilyMode(mode);setEmail('');setFamilyCode('');setUsername('');setPassword('');setSavedHint(false);}} style={{flex:1,padding:12,borderRadius:12,backgroundColor:familyMode===mode?Colors.primaryLighter:Colors.bg,borderWidth:1,borderColor:familyMode===mode?Colors.primary:Colors.border}}><Text style={{textAlign:'center',fontWeight:'700',color:Colors.text}}>{mode?'Código da família':'E-mail'}</Text></TouchableOpacity>)}
          </View>
          {familyMode && <><Text style={{color:Colors.textSecondary,marginBottom:10}}>Use o código da família, seu usuário e sua senha.</Text><View style={styles.inputWrap}><Text style={styles.inputIcon}>🏡</Text><TextInput style={styles.input} value={familyCode} onChangeText={value=>{edited.current=true;setFamilyCode(value);setPassword('');}} accessibilityLabel="Código da família" autoComplete="off" importantForAutofill="no" autoCapitalize="characters" autoCorrect={false} maxLength={20} placeholder="FAM-ABCD-EFGH" placeholderTextColor={Colors.textMuted} editable={!submitting && !forgetting}/></View></>}

          {/* Email */}
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>✉️</Text>
            <TextInput
              style={styles.input}
              value={familyMode ? username : email}
              onChangeText={value=>{edited.current=true;(familyMode?setUsername:setEmail)(value);setPassword('');}}
              keyboardType={familyMode ? 'default' : 'email-address'}
              accessibilityLabel={familyMode ? 'Usuário de acesso' : 'E-mail de acesso'}
              autoComplete={familyMode ? 'off' : 'email'}
              importantForAutofill={familyMode ? 'no' : 'auto'}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={familyMode ? 'Ex: ana' : 'seu@email.com'}
              placeholderTextColor={Colors.textMuted}
              returnKeyType="next"
              editable={!submitting && !forgetting}
            />
          </View>

          {/* Senha */}
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={value=>{edited.current=true;setPassword(value);}}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={familyMode ? 'off' : 'current-password'}
              importantForAutofill={familyMode ? 'no' : 'auto'}
              textContentType={familyMode ? 'none' : 'password'}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!submitting && !forgetting}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {canRememberDeviceLogin && <View style={styles.rememberBox}>
            <View style={styles.rememberRow}>
              <View style={{flex:1}}>
                <Text style={styles.rememberTitle}>Lembrar neste aparelho</Text>
                <Text style={styles.rememberHelp}>Guarda família e usuário ou e-mail, sem senha. Ative apenas no seu aparelho pessoal.</Text>
              </View>
              <Switch accessibilityLabel="Lembrar dados de acesso neste aparelho" value={remember} disabled={submitting || forgetting}
                onValueChange={async value=>{
                  edited.current=true;setRemember(value);setDeviceError('');
                  if (!value) {
                    try {await deviceLogin.clear();setSavedHint(false);}
                    catch {setDeviceError('Não foi possível apagar a sugestão salva. Use “Esquecer dados e usar outra conta”.');}
                  }
                }}/>
            </View>
            {savedHint && <Text style={styles.rememberHelp}>Último acesso confirmado neste aparelho. Informe sua senha para entrar.</Text>}
          </View>}
          <TouchableOpacity accessibilityRole="button" style={styles.forgetDevice} disabled={submitting || forgetting} onPress={forgetDevice}>
            <Text style={styles.forgotText}>{forgetting?'Apagando dados…':'Esquecer dados e usar outra conta'}</Text>
          </TouchableOpacity>
          {!!deviceError && <Text accessibilityRole="alert" style={styles.lockText}>{deviceError}</Text>}

          {/* Esqueceu senha */}
          <TouchableOpacity style={styles.forgotRow} onPress={() => Alert.alert('Recuperar acesso', 'Peça ao gestor da família para redefinir sua senha na administração.')}>
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
            disabled={locked || forgetting}
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
                disabled={locked || submitting || forgetting}
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
  rememberBox: {gap:8,marginBottom:10},
  rememberRow: {flexDirection:'row',alignItems:'center',gap:12},
  rememberTitle: {color:Colors.text,fontWeight:'700',fontSize:FontSize.sm},
  rememberHelp: {color:Colors.textSecondary,fontSize:FontSize.xs,lineHeight:18,marginTop:3},
  forgetDevice: {alignItems:'center',paddingVertical:12,marginBottom:10},

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
