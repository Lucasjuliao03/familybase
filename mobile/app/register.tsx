import { useState, ComponentProps, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../src/contexts/AuthContext";
import { Colors, Radii, Shadow, FontSize } from "../src/theme";
import { PrimaryButton } from "../src/components/ui/PrimaryButton";
import { AppLogo } from "../src/components/ui/AppLogo";
/* import {
  isBiometricSupported,
  getBiometricLabel,
  enableBiometricLogin,
  runBiometricPrompt,
} from "../src/lib/biometrics"; */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AvatarPick {
  uri: string;
  base64: string;
  ext: string;
}

type IonName = ComponentProps<typeof Ionicons>["name"];

function toISODate(masked: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd),
    mo = Number(mm),
    y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  )
    return null;
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

function maskDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 4);
  const p3 = digits.slice(4, 8);
  let out = p1;
  if (p2) out += "/" + p2;
  if (p3) out += "/" + p3;
  return out;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [familyName, setFamilyName] = useState("");
  const [profileType, setProfileType] = useState<"pai" | "mae">("pai");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [birth, setBirth] = useState("");
  const [avatar, setAvatar] = useState<AvatarPick | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permissão necessária",
          "Autorize o acesso às fotos para escolher um avatar.",
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        Alert.alert(
          "Erro",
          "Não foi possível processar a imagem. Tente outra.",
        );
        return;
      }
      const ext = (asset.uri.split(".").pop() || "jpg")
        .toLowerCase()
        .includes("png")
        ? "png"
        : "jpg";
      setAvatar({ uri: asset.uri, base64: asset.base64, ext });
    } catch {
      Alert.alert("Erro", "Não foi possível abrir a galeria.");
    }
  }

  function validate(): string | null {
    if (!familyName.trim()) return "Informe o nome da família.";
    if (!name.trim()) return "Informe o nome do responsável.";
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return "Informe um email válido.";
    if (password.length < 6) return "A senha deve ter no mínimo 6 caracteres.";
    if (password !== confirm) return "As senhas não coincidem.";
    if (!birth.trim()) return "Informe a data de nascimento do responsável.";
    const iso = toISODate(birth);
    if (!iso) return "Data de nascimento inválida (use DD/MM/AAAA).";
    if (yearsSince(iso) < 18)
      return "O responsável principal deve ter pelo menos 18 anos.";
    if (!accepted)
      return "É necessário aceitar os termos e a política de privacidade.";
    return null;
  }
  /** DESATIVA A OFERTA DE BIOMETRIA NO CADASTRO DEVIDO A EXIGÊNCIA DE VERIFICAÇÃO DO EMAIL ANTES */
  // async function offerBiometric(em: string, pw: string) {
  //   try {
  //     const supported = await isBiometricSupported();
  //     if (!supported) return;
  //     const label = await getBiometricLabel();
  //     Alert.alert(
  //       `Ativar ${label}?`,
  //       `Use o ${label} para entrar mais rápido e com segurança nas próximas vezes.`,
  //       [
  //         { text: "Agora não", style: "cancel" },
  //         {
  //           text: "Ativar",
  //           onPress: async () => {
  //             const ok = await runBiometricPrompt(`Ativar ${label}`);
  //             if (ok) {
  //               await enableBiometricLogin({ email: em, password: pw });
  //               Alert.alert("Pronto", `${label} ativado para este aparelho.`);
  //             }
  //           },
  //         },
  //       ],
  //     );
  //   } catch {
  //     /* noop */
  //   }
  // }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert("Verifique o cadastro", err);
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
      Alert.alert(
        "Cadastro realizado",
        "Foi enviado um email de confirmação para o endereço informado. Por favor, confirme o email antes de fazer login.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/login"),
          },
        ],
      );
      // await offerBiometric(em, password);
    } catch (e) {
      Alert.alert(
        "Erro no cadastro",
        (e as Error)?.message || "Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <AppLogo size={92} containerStyle={{ marginBottom: 8 }} />
          <Text style={styles.heroTitle}>Nova família</Text>
          <Text style={styles.heroSub}>
            Cadastro do responsável principal · 7 dias grátis
          </Text>
        </LinearGradient>

        <View style={styles.panel}>
          <TouchableOpacity
            style={styles.avatarPick}
            onPress={pickAvatar}
            activeOpacity={0.85}
          >
            {avatar ? (
              <Image source={{ uri: avatar.uri }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons
                  name="camera-outline"
                  size={28}
                  color={Colors.primary}
                />
              </View>
            )}
            <Text style={styles.avatarHint}>
              {avatar ? "Alterar foto" : "Adicionar foto (opcional)"}
            </Text>
          </TouchableOpacity>

          <Label text="Nome da família" required />
          <Field
            icon="people-outline"
            value={familyName}
            onChangeText={setFamilyName}
            placeholder="Ex: Família Silva"
            editable={!submitting}
          />

          <Label text="Perfil do responsável" required />
          <View style={styles.segment}>
            {(
              [
                ["pai", "Pai", "man-outline"],
                ["mae", "Mãe", "woman-outline"],
              ] as const
            ).map(([val, lbl, icon]) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.segmentBtn,
                  profileType === val && styles.segmentBtnActive,
                ]}
                onPress={() => setProfileType(val)}
                disabled={submitting}
              >
                <Ionicons
                  name={icon}
                  size={18}
                  color={
                    profileType === val ? Colors.primary : Colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.segmentText,
                    profileType === val && styles.segmentTextActive,
                  ]}
                >
                  {lbl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helper}>
            O responsável principal é o gestor da família (financeiro e
            administração).
          </Text>

          <Label text="Nome do responsável" required />
          <Field
            icon="person-outline"
            value={name}
            onChangeText={setName}
            placeholder="Seu nome completo"
            editable={!submitting}
          />

          <Label text="Email" required />
          <Field
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!submitting}
          />

          <Label text="Senha" required />
          <Field
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry={!showPass}
            editable={!submitting}
            trailing={
              <TouchableOpacity
                onPress={() => setShowPass(!showPass)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            }
          />

          <Label text="Confirmar senha" required />
          <Field
            icon="lock-closed-outline"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repita a senha"
            secureTextEntry={!showPass}
            editable={!submitting}
          />

          <Label text="Telefone" optional />
          <Field
            icon="call-outline"
            value={phone}
            onChangeText={setPhone}
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
            editable={!submitting}
          />

          {/* <Label text="Endereço" optional />
          <Field
            icon="location-outline"
            value={address}
            onChangeText={setAddress}
            placeholder="Rua, número, cidade"
            editable={!submitting}
          /> */}

          <Label text="Data de nascimento" required />
          <Field
            icon="calendar-outline"
            value={birth}
            onChangeText={(t) => setBirth(maskDate(t))}
            placeholder="DD/MM/AAAA"
            keyboardType="number-pad"
            editable={!submitting}
          />

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAccepted((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
              {accepted && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.termsText}>
              Li e aceito os <Text style={styles.termsLink}>Termos de Uso</Text>{" "}
              e a <Text style={styles.termsLink}>Política de Privacidade</Text>.
            </Text>
          </TouchableOpacity>

          <View style={styles.trialCallout}>
            <View style={styles.trialIconWrap}>
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trialTitle}>Teste grátis de 7 dias</Text>
              <Text style={styles.trialText}>
                Toda a família usa o mesmo plano. Contas de crianças são criadas
                depois pelo gestor no painel.
              </Text>
            </View>
          </View>

          <PrimaryButton
            label="Criar família"
            onPress={handleSubmit}
            loading={submitting}
            style={{ marginTop: 8 }}
          />

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.replace("/login")}
            disabled={submitting}
          >
            <Text style={styles.loginLinkText}>
              Já tem conta? <Text style={styles.loginLinkStrong}>Entrar</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({
  text,
  required,
  optional,
}: {
  text: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <Text style={styles.label}>
      {text}
      {required ? " *" : ""}
      {optional ? <Text style={styles.labelOptional}> (opcional)</Text> : null}
    </Text>
  );
}

function Field(
  props: ComponentProps<typeof TextInput> & {
    icon: IonName;
    trailing?: ReactNode;
  },
) {
  const { icon, trailing, style, ...rest } = props;
  return (
    <View style={styles.inputWrap}>
      <Ionicons name={icon} size={18} color={Colors.textMuted} />
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={Colors.textMuted}
        {...rest}
      />
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  hero: {
    paddingTop: 56,
    paddingBottom: 36,
    alignItems: "center",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtn: {
    position: "absolute",
    top: 52,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 28,
  },

  panel: {
    marginTop: -18,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 44,
    ...Shadow.lg,
    shadowOffset: { width: 0, height: -4 },
  },

  avatarPick: { alignItems: "center", marginBottom: 12 },
  avatarImg: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: Colors.primaryLighter,
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarHint: {
    marginTop: 6,
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: "700",
  },

  label: {
    fontSize: FontSize.xs + 1,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  labelOptional: { fontWeight: "600", color: Colors.textMuted },
  helper: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 8,
    gap: 10,
  },
  input: { flex: 1, fontSize: FontSize.base, color: Colors.text },

  segment: { flexDirection: "row", gap: 10 },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  segmentBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  segmentText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  segmentTextActive: { color: Colors.primary, fontWeight: "900" },

  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  termsText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  termsLink: { color: Colors.primary, fontWeight: "700" },

  trialCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F5F3FF",
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    padding: 14,
    marginTop: 18,
    marginBottom: 4,
  },
  trialIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  trialTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.primary,
  },
  trialText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },

  loginLink: { alignItems: "center", paddingVertical: 16 },
  loginLinkText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  loginLinkStrong: { color: Colors.primary, fontWeight: "800" },
});
