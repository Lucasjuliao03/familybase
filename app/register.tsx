import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLinking from 'expo-linking';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../src/contexts/AuthContext';
import { useAppSettings } from '../src/contexts/AppSettingsContext';
import { supabase } from '../src/lib/supabase';
import { maskPhone, normalizeEmail } from '../src/lib/familyIdentity';
import { resendSignupConfirmation, confirmSignupCode } from '../src/lib/legacyFamilyAuth';
import { EMPTY_REGISTRATION, REGISTRATION_STEPS, registrationFromUser, registrationStepErrors, restoreRegistrationDraft, safeRegistrationDraft, validateSimulationCode } from '../src/lib/familyRegistration';
import { CatalogAvatarChoice } from '../src/components/auth/CatalogAvatarChoice';
import { BirthDatePicker } from '../src/components/auth/BirthDatePicker';
import { AppLogo } from '../src/components/ui/AppLogo';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { Colors } from '../src/theme';

const DRAFT_KEY = 'family-registration-draft-v1';
type Form = typeof EMPTY_REGISTRATION;
export default function RegisterScreen() {
  const router = useRouter();
  const { register, user, refreshProfile } = useAuth();
  const { settings } = useAppSettings();
  const [form, setForm] = useState<Form>(EMPTY_REGISTRATION);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [confirmationCode,setConfirmationCode]=useState('');
  const [pendingEmail,setPendingEmail]=useState('');
  const [verified, setVerified] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [resendUntil, setResendUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [simulation,setSimulation]=useState(false);
  const [simulationDone,setSimulationDone]=useState(false);
  const submitting = useRef(false);
  const restoredUser = useRef<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DRAFT_KEY).then(raw => {
      if (!active) return;
      const draft = restoreRegistrationDraft(raw ? JSON.parse(raw) : null);
      if (draft) { setForm(draft.form); setStep(Math.min(3,draft.step)); }
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (simulation || !ready || !user?.id || user.family_id || restoredUser.current === user.id) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user?.email_confirmed_at) return;
      restoredUser.current = data.user.id;
      const fromUser = registrationFromUser(data.user);
      const pw = !!data.user.user_metadata.registration_password_set || data.user.user_metadata.registration_version === 2 || !!data.user.user_metadata.legacy_registration;
      setForm(p => normalizeEmail(p.email) === fromUser.email ? { ...fromUser,...p,email:fromUser.email } : fromUser);
      setVerified(true); setPasswordSet(pw); setStep(p => Math.max(pw ? 5 : 4,p));
    });
    return () => { active = false; };
  }, [ready,user?.id,user?.family_id,simulation]);
  useEffect(() => {
    if (ready) void AsyncStorage.setItem(DRAFT_KEY,JSON.stringify(safeRegistrationDraft(form,step,verified,passwordSet))).catch(() => {});
  }, [form,step,ready,verified,passwordSet]);
  useEffect(() => {
    if(!pendingEmail || !resendUntil) return;
    const timer=setInterval(() => {const time=Date.now();setNow(time);if(time>=resendUntil) clearInterval(timer);},1000);
    return () => clearInterval(timer);
  },[pendingEmail,resendUntil]);
  useEffect(() => { setErrors({}); scrollRef.current?.scrollTo({ y:0,animated:true }); inputRef.current?.focus(); }, [step]);
  const update = (key: keyof Form,value: string) => { setForm(p => ({ ...p,[key]:value })); if(key==='email'){setVerified(false);setCode('');} setErrors({}); };
  const wait = Math.max(0,Math.ceil((resendUntil-now)/1000));
  const current = REGISTRATION_STEPS[step];
  const run = async (task: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setErrors({});
    try { await task(); }
    catch (error) { setErrors({ submit:(error as Error).message || 'Não foi possível continuar. Tente novamente.' }); }
    finally { submitting.current = false; setBusy(false); }
  };
  const resend = () => run(async () => { await resendSignupConfirmation(supabase,pendingEmail,ExpoLinking.createURL('/auth-confirm')); const time=Date.now();setNow(time);setResendUntil(time+60000); });
  const confirmEmail = () => run(async () => {
    await confirmSignupCode(supabase,pendingEmail,confirmationCode);
    setConfirmationCode('');
    await refreshProfile();
  });
  const next = () => {
    if (busy) return;
    const invalid = registrationStepErrors(form,current.id);
    if (Object.keys(invalid).length) { setErrors(invalid); return; }
    if (current.id==='email') { setStep(verified ? 4:3); return; }
    if (current.id==='verification') { void run(async () => { if (simulation) validateSimulationCode(code); else if(normalizeEmail(code)!==normalizeEmail(form.email)) throw new Error('Os e-mails não coincidem. Digite novamente seu e-mail.'); setVerified(true); setCode(''); setStep(4); }); return; }
    if (current.id==='password') { setPasswordSet(true); setStep(5); return; }
    if (current.id==='terms') {
      if (!accepted) { setErrors({ accepted:'Aceite os Termos de Uso e a Política de Privacidade.' }); return; }
      if (!verified || !passwordSet) { setErrors({ submit:'Confirme seu e-mail e defina a senha antes de concluir.' }); return; }
      void run(async () => {
        if (simulation) setSimulationDone(true);
        else { const result=await register({ ...form,profileType:form.profileType as 'pai' | 'mae',accepted:true }); if(result.status==='confirmation_required'){setPendingEmail(form.email);const time=Date.now();setNow(time);setResendUntil(time+60000);} }
        setForm(p=>({...p,password:'',confirmPassword:''})); await AsyncStorage.removeItem(DRAFT_KEY);
      }); return;
    }
    setStep(s => s+1);
  };
  const field = (key: keyof Form,label: string,props: ComponentProps<typeof TextInput> = {}) => <View style={s.group}><Text style={s.label}>{label}</Text>
    <TextInput ref={key==='confirmPassword' ? undefined:inputRef} accessibilityLabel={label} value={form[key]} onChangeText={v => update(key,v)} editable={!busy} style={[s.input,errors[key] ? s.invalid:null]} placeholderTextColor={Colors.textMuted} returnKeyType="next" onSubmitEditing={next} {...props} />
    {!!errors[key] && <Text style={s.error} accessibilityRole="alert">{errors[key]}</Text>}
  </View>;
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding':undefined}>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom:36 }}>
      <LinearGradient colors={[Colors.gradStart,Colors.gradEnd]} style={s.hero}><AppLogo size={64} /><Text style={s.title}>Vamos criar sua família</Text><Text style={s.subtitle}>Um passo de cada vez · 7 dias grátis</Text></LinearGradient>
      <View style={s.card}>
        {__DEV__ && <PrimaryButton variant="ghost" disabled={busy} label={simulation ? 'Sair da simulação':'Simular cadastro para teste'} onPress={() => { setSimulation(v => !v); setStep(0); setVerified(false); setPasswordSet(false); setSimulationDone(false); setAccepted(false); setCode(''); }} />}
        {simulation && <Text style={[s.hint,{ backgroundColor:Colors.primaryLighter,padding:12,borderRadius:12,marginBottom:16 }]}>Modo de teste · qualquer código numérico · nenhuma conta será gravada</Text>}
        {pendingEmail ? <View style={{gap:16}}><Text style={s.prompt}>Confirme seu cadastro</Text><Text style={s.hint}>Confira a caixa de entrada e o spam de {pendingEmail}. Digite o código recebido para confirmar seu e-mail e concluir a criação da família.</Text><TextInput accessibilityLabel="Código de confirmação" placeholder="Código do e-mail" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} value={confirmationCode} onChangeText={v=>setConfirmationCode(v.replace(/\D/g,''))} editable={!busy} style={s.input} /><PrimaryButton label="Confirmar cadastro" disabled={busy || !/^\d{6,10}$/.test(confirmationCode)} loading={busy} onPress={() => {void confirmEmail();}} /><Text style={s.hint}>Se a mensagem tiver um link, abra-o e depois entre com seu e-mail e senha. Se já possui uma conta, use Entrar.</Text><PrimaryButton variant="ghost" label={wait ? `Reenviar em ${wait}s`:'Reenviar confirmação'} disabled={busy || wait>0} onPress={() => {void resend();}} />{!!errors.submit && <Text style={s.error} accessibilityRole="alert">{errors.submit}</Text>}</View> : simulationDone ? <View style={{ gap:16 }}><Text style={s.prompt}>Simulação concluída!</Text><Text style={s.hint}>{form.familyName} está pronta na prévia do cadastro, com {form.name} como responsável.</Text><Text style={s.hint}>No cadastro real, a confirmação usa o código ou link recebido por e-mail.</Text><PrimaryButton label="Testar novamente" onPress={() => { setSimulationDone(false); setStep(0); setForm(EMPTY_REGISTRATION); setVerified(false); setPasswordSet(false); setAccepted(false); }} /></View> : <><View style={s.track} accessible accessibilityLabel={`Passo ${step+1} de 10`}><View style={[s.progress,{ width:`${(step+1)*10}%` }]} /></View><Text style={s.counter}>Passo {step+1} de 10</Text>
        <View style={s.question}><Text accessibilityRole="header" style={s.prompt}>{current.prompt}</Text><Text style={s.hint}>{current.id==='verification' && !simulation ? 'Repita seu e-mail para evitar erros. Você receberá um código ao concluir o cadastro.':current.hint}</Text></View>
        {current.id==='profileType' && <View style={s.choices}>{(['pai','mae'] as const).map(id => <TouchableOpacity key={id} disabled={busy || !ready} onPress={() => { update('profileType',id); setStep(1); }} accessibilityRole="radio" accessibilityState={{ selected:form.profileType===id }} style={[s.choice,form.profileType===id && s.selected]}><Text style={{ fontSize:44 }}>{id==='pai' ? '👨':'👩'}</Text><Text style={s.choiceText}>{id==='pai' ? 'Pai':'Mãe'}</Text></TouchableOpacity>)}</View>}
        {current.id==='familyName' && field('familyName','Nome da família',{ placeholder:'Ex: Família Silva',autoComplete:'organization',maxLength:80 })}
        {current.id==='name' && field('name','Nome completo',{ placeholder:'Seu nome e sobrenome',autoComplete:'name',maxLength:160 })}
        {current.id==='email' && field('email','E-mail pessoal',{ placeholder:'seu@email.com',keyboardType:'email-address',autoCapitalize:'none',autoComplete:'email',editable:!busy })}
        {current.id==='verification' && <><Text style={s.hint}>{simulation ? 'No teste, use qualquer número para':'Confira'} <Text style={{ fontWeight:'700' }}>{form.email}</Text></Text><Text style={s.label}>{simulation ? 'Código de confirmação':'Confirmar e-mail'}</Text><TextInput ref={inputRef} accessibilityLabel={simulation ? 'Código de confirmação':'Confirmar e-mail'} keyboardType={simulation ? 'number-pad':'email-address'} autoComplete={simulation ? 'one-time-code':'email'} autoCapitalize="none" editable={!busy} maxLength={simulation ? 10:254} value={code} onChangeText={v => setCode(simulation ? v.replace(/\D/g,''):v)} style={simulation ? [s.input,{fontSize:24,textAlign:'center',letterSpacing:4}]:s.input} /></>}
        {current.id==='password' && <>{field('password','Senha',{ placeholder:'Pelo menos 6 caracteres',secureTextEntry:!showPassword,autoCapitalize:'none',autoComplete:'new-password' })}{field('confirmPassword','Confirmar senha',{ placeholder:'Repita sua senha',secureTextEntry:!showPassword,autoCapitalize:'none',autoComplete:'new-password' })}<TouchableOpacity disabled={busy} onPress={() => setShowPassword(v => !v)}><Text style={s.link}>{showPassword ? 'Ocultar senhas':'Mostrar senhas'}</Text></TouchableOpacity></>}
        {current.id==='phone' && field('phone','Telefone com DDD',{ placeholder:'(11) 99999-9999',keyboardType:'phone-pad',autoComplete:'tel',onChangeText:v => update('phone',maskPhone(v)) })}
        {current.id==='dateOfBirth' && <><Text style={s.label}>Data de nascimento</Text><BirthDatePicker value={form.dateOfBirth} onChange={v => update('dateOfBirth',v)} disabled={busy} />{!!errors.dateOfBirth && <Text style={s.error} accessibilityRole="alert">{errors.dateOfBirth}</Text>}</>}
        {current.id==='avatarPreset' && <><CatalogAvatarChoice showcase value={form.avatarPreset} onChange={id => update('avatarPreset',id)} disabled={busy} />{!!errors.avatarPreset && <Text style={s.error} accessibilityRole="alert">{errors.avatarPreset}</Text>}</>}
        {current.id==='terms' && <><View style={s.review}>{[['Família',form.familyName],['Responsável',`${form.name} · ${form.profileType==='pai' ? 'Pai':'Mãe'}`],['E-mail de acesso',form.email],['Telefone',form.phone],['Nascimento',form.dateOfBirth.split('-').reverse().join('/')]].map(([label,value]) => <View key={label}><Text style={s.reviewLabel}>{label}</Text><Text style={s.reviewValue}>{value}</Text></View>)}</View>
          <View style={{ flexDirection:'row',flexWrap:'wrap',gap:16 }}>{[{ label:'Termos de Uso',url:settings.terms_url },{ label:'Política de Privacidade',url:settings.privacy_url }].filter(item => item.url).map(item => <TouchableOpacity key={item.label} accessibilityRole="link" onPress={() => { void Linking.openURL(item.url).catch(() => setErrors({ submit:'Não foi possível abrir o documento. Tente novamente.' })); }}><Text style={s.link}>{item.label}</Text></TouchableOpacity>)}</View>
          <TouchableOpacity disabled={busy} style={s.terms} onPress={() => setAccepted(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked:accepted }}><Text style={s.checkbox}>{accepted ? '☑':'☐'}</Text><Text style={s.hint}>Li e aceito os Termos de Uso e a Política de Privacidade.</Text></TouchableOpacity>{!!errors.accepted && <Text style={s.error} accessibilityRole="alert">{errors.accepted}</Text>}</>}
        {!!errors.submit && <Text style={s.error} accessibilityRole="alert">{errors.submit}</Text>}
        {step>0 && <PrimaryButton label={current.id==='terms' ? 'Criar minha família' : current.id==='verification' ? 'Confirmar e-mail':'Continuar'} onPress={next} loading={busy} disabled={!ready} style={{ marginTop:16 }} />}
        {step>0 && <PrimaryButton variant="ghost" label="← Voltar" disabled={busy} onPress={() => setStep(p => p-1)} />}
        </>}<TouchableOpacity disabled={busy} onPress={() => router.replace('/login')} style={{ padding:16 }}><Text style={s.login}>Já tem conta? Entrar</Text></TouchableOpacity>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  root:{ flex:1,backgroundColor:Colors.bg },hero:{ paddingTop:52,paddingBottom:32,alignItems:'center',gap:10 },title:{ fontSize:25,fontWeight:'800',color:'#fff' },subtitle:{ fontSize:14,color:'#eee4ff' },
  card:{ marginHorizontal:20,marginTop:-12,padding:22,borderRadius:24,backgroundColor:'#fff',maxWidth:490,width:'90%',alignSelf:'center' },track:{ height:6,borderRadius:6,backgroundColor:'#eee7f8',overflow:'hidden' },progress:{ height:6,backgroundColor:Colors.primary },counter:{ fontSize:12,color:Colors.textMuted,textAlign:'right',marginTop:7,marginBottom:16 },
  question:{ borderRadius:18,borderBottomLeftRadius:4,padding:18,backgroundColor:Colors.primaryLighter,marginBottom:22,gap:8 },prompt:{ fontSize:21,fontWeight:'800',color:Colors.text },hint:{ fontSize:14,lineHeight:21,color:Colors.textMuted,flexShrink:1 },
  group:{ gap:7,marginBottom:16 },label:{ fontWeight:'700',color:Colors.text,fontSize:14,marginBottom:6 },input:{ borderWidth:1,borderColor:Colors.border,borderRadius:14,paddingHorizontal:15,paddingVertical:14,fontSize:16,color:Colors.text,backgroundColor:Colors.bg },invalid:{ borderColor:'#b91c1c' },error:{ color:'#b91c1c',fontSize:13,lineHeight:19,marginTop:6 },
  choices:{ flexDirection:'row',gap:12 },choice:{ flex:1,alignItems:'center',padding:24,borderWidth:2,borderColor:Colors.border,borderRadius:18,gap:14 },selected:{ borderColor:Colors.primary,backgroundColor:Colors.primaryLighter },choiceText:{ fontWeight:'800',fontSize:18,color:Colors.primary },link:{ color:Colors.primary,fontSize:13,paddingVertical:8 },
  review:{ backgroundColor:Colors.bg,padding:18,borderRadius:16,gap:12,marginBottom:16 },reviewLabel:{ fontSize:12,fontWeight:'700',color:Colors.textMuted },reviewValue:{ fontSize:14,color:Colors.text,marginTop:3 },terms:{ flexDirection:'row',alignItems:'center',gap:10,marginVertical:16 },checkbox:{ fontSize:25,color:Colors.primary },login:{ color:Colors.textMuted,fontSize:13,textAlign:'center' },
});
