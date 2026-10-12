import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserAvatar } from '../src/components/profile/UserAvatar';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { AppLogo } from '../src/components/ui/AppLogo';
import { Colors } from '../src/theme';

const STEPS=[
  ['🏡','Crie sua família','O responsável confirma o e-mail e configura os acessos.'],
  ['👨‍👩‍👧','Adicione as pessoas','Cada filho entra com código da família, usuário e senha.'],
  ['✅','Organize a rotina','Use tarefas, calendário, saúde e recompensas no seu ritmo.'],
];
export default function OnboardingScreen() {
  const router=useRouter();const insets=useSafeAreaInsets();
  return <ScrollView style={s.root} contentContainerStyle={[s.content,{paddingTop:Math.max(insets.top,20)+18,paddingBottom:Math.max(insets.bottom,20)+18}]}>
    <AppLogo size={74} containerStyle={{alignItems:'center'}}/><Text accessibilityRole="header" style={s.title}>Tudo de Família</Text><Text style={s.subtitle}>Uma rotina mais organizada, com cada pessoa no seu próprio perfil.</Text>
    <View style={s.avatars}>{['nina','caio','bia'].map((id,index)=><UserAvatar key={id} avatarPreset={id} name={['Nina','Caio','Bia'][index]} size={76}/>)}</View>
    {STEPS.map(([icon,title,detail])=><View key={title} style={s.card}><Text style={s.icon}>{icon}</Text><View style={{flex:1}}><Text style={s.label}>{title}</Text><Text style={s.hint}>{detail}</Text></View></View>)}
    <PrimaryButton label="Cadastrar minha família" onPress={()=>router.replace('/register')}/><PrimaryButton label="Já tenho acesso · Entrar" variant="ghost" onPress={()=>router.replace('/login')}/>
  </ScrollView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:Colors.bg},content:{padding:24,gap:18,maxWidth:600,width:'100%',alignSelf:'center',alignItems:'stretch'},title:{fontSize:32,fontWeight:'800',textAlign:'center',color:Colors.text},subtitle:{textAlign:'center',color:Colors.textSecondary,fontSize:16,lineHeight:24},avatars:{flexDirection:'row',justifyContent:'center',gap:14,marginVertical:8},card:{flexDirection:'row',alignItems:'center',gap:14,padding:18,borderRadius:18,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border},icon:{fontSize:28},label:{fontSize:17,fontWeight:'700',color:Colors.text},hint:{fontSize:14,lineHeight:21,color:Colors.textSecondary,marginTop:5}});
