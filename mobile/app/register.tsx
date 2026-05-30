import { useState, ComponentProps } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ScrollView, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../src/theme';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { AppLogo } from '../src/components/ui/AppLogo';
import {
  isBiometricSupported,
  getBiometricLabel,
  enableBiometricLogin,
  runBiometricPrompt,
} from '../src/lib/biometrics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AvatarPick {
  uri: string;
  base64: string;
  ext: string;
}

/** Converte "DD/MM/AAAA" → "AAAA-MM-DD" (ou null se inválida). */
function toISODate(masked: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function yearsSince(iso: string): number {
  const dob = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Máscara progressiva de data DD/MM/AAAA. */
function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 4);
  const p3 = digits.slice(4, 8);
  let out = p1;
  if (p2) out += '/' + p2;
  if (p3) out += '/' + p3;
  return out;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [familyName, setFamilyName] = useState('');
  const [profileType, setProfileType] = useState<'pai' | 'mae'>('pai');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [birth, setBirth] = useState('');
  const [avatar, setAvatar] = useState<AvatarPick | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para escolher um avatar.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        Alert.alert('Erro', 'Não foi possível processar a imagem. Tente outra.');
        return;
      }
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().includes('png') ? 'png' : 'jpg';
      setAvatar({ uri: asset.uri, base64: asset.base64, ext });
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  }

  function validate(): string | null {
    if (!familyName.trim()) return 'Informe o nome da família.';
    if (!name.trim()) return 'Informe o nome do responsável.';
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return 'Informe um email válido.';
    if (password.length < 6) return 'A senha deve ter no mínimo 6 caracteres.';
    if (password !== confirm) return 'As senhas não coincidem.';
    if (!birth.trim()) return 'Informe a data de nascimento do responsável.';
    const iso = toISODate(birth);
    if (!iso) return 'Data de nascimento inválida (use DD/MM/AAAA).';
    if (yearsSince(iso) < 18) return 'O responsável principal deve ter pelo menos 18 anos.';
    if (!accepted) return 'É necessário aceitar os termos e a política de privacidade.';
    return null;
  }

  async function offerBiometric(em: string, pw: string) {
    try {
      const supported = await isBiometricSupported();
      if (!supported) return;
      const label = await getBiometricLabel();
      Alert.alert(
        `Ativar ${label}?`,
        `Use o ${label} para entrar mais rápido e com segurança nas próximas vezes.`,
        [
          { text: 'Agora não', style: 'cancel' },
          {
            text: 'Ativar',
            onPress: async () => {
              const ok = await runBiometricPrompt(`Ativar ${label}`);
              if (ok) {
                await enableBiometricLogin({ email: em, password: pw });
                Alert.alert('Pronto!', `${label} ativado para este aparelho.`);
              }
            },
          },
        ],
      );
    } catch { /* noop */ }
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert('Verifique o cadastro', err);
      return;
    }
    const em = email.trim().toLowerCase();
    const iso = toISODate(birth)!;
    try {
      setSubmitting(true);
      await register({
        familyName: familyName.trim(),
        name: name.trim(),
        email: em,
        password,
        profileType,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        dateOfBirth: iso,
        avatarBase64: avatar?.base64 || null,
        avatarExt: avatar?.ext,
      });
      // Conta criada e sessão iniciada. Oferecer biometria (best-effort).
      await offerBiometric(em, password);
      // A navegação para /parent é tratada automaticamente pelo layout raiz.
    } catch (e) {
      Alert.alert('Erro no cadastro', (e as Error)?.message || 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Hero */}
        <LinearGradient
          colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <AppLogo size={100} containerStyle={{ marginBottom: 8 }} />
          <Text style={styles.heroTitle}>Nova Família</Text>
          <Text style={styles.heroSub}>Crie a conta do responsável e ganhe 7 dias grátis 🎁</Text>
        </LinearGradient>

        {/* Painel */}
        <View style={styles.panel}>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarPick} onPress={pickAvatar} activeOpacity={0.85}>
            {avatar ? (
              <Image source={{ uri: avatar.uri }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={{ fontSize: 30 }}>📷</Text>
              </View>
            )}
            <Text style={styles.avatarHint}>{avatar ? 'Trocar foto' : 'Adicionar foto (opcional)'}</Text>
          </TouchableOpacity>

          <Label text="Nome da família *" />
          <Field icon="👪" value={familyName} onChangeText={setFamilyName} placeholder="Ex: Família Silva" editable={!submitting} />

          {/* Perfil do responsável */}
          <Label text="Você é *" />
          <View style={styles.segment}>
            {([['pai', '👨 Pai'], ['mae', '👩 Mãe']] as const).map(([val, lbl]) => (
              <TouchableOpacity
                key={val}
                style={[styles.segmentBtn, profileType === val && styles.segmentBtnActive]}
                onPress={() => setProfileType(val)}
                disabled={submitting}
              >
                <Text style={[styles.segmentText, profileType === val && styles.segmentTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helper}>O responsável principal é o gestor da família (financeiro e administração).</Text>

          <Label text="Nome do responsável *" />
          <Field icon="🙂" value={name} onChangeText={setName} placeholder="Seu nome completo" editable={!submitting} />

          <Label text="Email *" />
          <Field
            icon="✉️" value={email} onChangeText={setEmail} placeholder="seu@email.com"
            keyboardType="email-address" autoCapitalize="none" editable={!submitting}
          />

          <Label text="Senha *" />
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={Colors.textMuted}
              editable={!submitting}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <Label text="Confirmar senha *" />
          <Field
            icon="🔒" value={confirm} onChangeText={setConfirm} placeholder="Repita a senha"
            secureTextEntry={!showPass} editable={!submitting}
          />

          <Label text="Telefone (opcional)" />
          <Field
            icon="📞" value={phone} onChangeText={setPhone} placeholder="(00) 00000-0000"
            keyboardType="phone-pad" editable={!submitting}
          />

          <Label text="Endereço (opcional)" />
          <Field icon="📍" value={address} onChangeText={setAddress} placeholder="Rua, número, cidade" editable={!submitting} />

          <Label text="Data de nascimento *" />
          <Field
            icon="🎂" value={birth} onChangeText={(t) => setBirth(maskDate(t))} placeholder="DD/MM/AAAA"
            keyboardType="number-pad" editable={!submitting}
          />

          {/* Termos */}
          <TouchableOpacity style={styles.termsRow} onPress={() => setAccepted((v) => !v)} activeOpacity={0.8}>
            <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
              {accepted && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              Li e aceito os <Text style={styles.termsLink}>Termos de Uso</Text> e a{' '}
              <Text style={styles.termsLink}>Política de Privacidade</Text>.
            </Text>
          </TouchableOpacity>

          <View style={styles.trialCallout}>
            <Text style={styles.trialTitle}>🎁 Teste grátis de 7 dias</Text>
            <Text style={styles.trialText}>
              A família inteira usa o mesmo plano. As contas das crianças são criadas depois, pelo gestor, no painel da família.
            </Text>
          </View>

          <PrimaryButton
            label="Criar família"
            onPress={handleSubmit}
            loading={submitting}
            style={{ marginTop: 8 }}
          />

          <TouchableOpacity style={styles.loginLink} onPress={() => router.replace('/login')} disabled={submitting}>
            <Text style={styles.loginLinkText}>Já tem conta? <Text style={styles.loginLinkStrong}>Entrar</Text></Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function Field(props: ComponentProps<typeof TextInput> & { icon: string }) {
  const { icon, style, ...rest } = props;
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputIcon}>{icon}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={Colors.textMuted}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  hero: {
    paddingTop: 56,
    paddingBottom: 40,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtn: {
    position: 'absolute', top: 52, left: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  backBtnText: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: -4 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '900', color: '#fff' },
  heroSub: {
    fontSize: FontSize.sm, color: 'rgba(255,255,255,0.9)',
    textAlign: 'center', marginTop: 6, paddingHorizontal: 24,
  },

  panel: {
    marginTop: -20,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 44,
    ...Shadow.lg,
    shadowOffset: { width: 0, height: -4 },
  },

  avatarPick: { alignItems: 'center', marginBottom: 12 },
  avatarImg: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: Colors.primaryLighter },
  avatarPlaceholder: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: Colors.bg, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarHint: { marginTop: 6, fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },

  label: { fontSize: FontSize.xs + 1, fontWeight: '800', color: Colors.text, marginTop: 14, marginBottom: 6 },
  helper: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 6 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bg, borderRadius: Radii.md,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 6,
    gap: 10,
  },
  inputIcon: { fontSize: 17 },
  input: { flex: 1, fontSize: FontSize.base, color: Colors.text },
  eyeIcon: { fontSize: 18 },

  segment: { flexDirection: 'row', gap: 10 },
  segmentBtn: {
    flex: 1, paddingVertical: 13, borderRadius: Radii.md,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg,
    alignItems: 'center',
  },
  segmentBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  segmentText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textSecondary },
  segmentTextActive: { color: Colors.primary, fontWeight: '900' },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '900' },
  termsText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  termsLink: { color: Colors.primary, fontWeight: '700' },

  trialCallout: {
    backgroundColor: Colors.tealLight, borderRadius: Radii.md,
    borderWidth: 1, borderColor: Colors.tealMid, padding: 14, marginTop: 18, marginBottom: 4,
  },
  trialTitle: { fontSize: FontSize.sm, fontWeight: '800', color: '#0D9488' },
  trialText: { fontSize: FontSize.xs, color: '#0F766E', marginTop: 4, lineHeight: 17 },

  loginLink: { alignItems: 'center', paddingVertical: 16 },
  loginLinkText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  loginLinkStrong: { color: Colors.primary, fontWeight: '800' },
});
