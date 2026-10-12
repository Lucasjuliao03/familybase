import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { supabase } from '../../src/lib/supabase';
import api from '../../src/services/api';
import { Colors } from '../../src/theme';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import { FamilyMemberAdminForm } from '../../src/components/admin/FamilyMemberAdminForm';
import { FamilyAccessMessage } from '../../src/components/auth/FamilyAccessMessage';

const START_OPTIONS=[
  {id:'tasks',title:'Criar a primeira tarefa',detail:'Defina uma rotina e acompanhe as conclusões.',icon:'✅',route:'/parent/tasks'},
  {id:'calendar',title:'Organizar o calendário',detail:'Adicione os próximos compromissos da família.',icon:'📅',route:'/parent/calendar'},
  {id:'store',title:'Cadastrar uma recompensa',detail:'Escolha um prêmio e defina os pontos necessários.',icon:'🎁',route:'/parent/store'},
] as const;
const STEP_TITLES=['Quem faz parte da família?','Por onde vamos começar?','Tudo pronto para começar'];

export default function ParentOnboardingScreen() {
  const {mode}=useLocalSearchParams<{mode?:string}>();
  const router=useRouter();
  const {user,family,refreshProfile,isGestor}=useAuth();
  const [step,setStep]=useState(0);
  const [children,setChildren]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [currentFamily,setCurrentFamily]=useState<any>(family);
  const [memberRole,setMemberRole]=useState<'child'|'parent'|null>(null);
  const [destination,setDestination]=useState<(typeof START_OPTIONS)[number]['id']>('tasks');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const mounted=useRef(true);
  const finishing=useRef(false);
  const reload=useCallback(async()=>{
    try {
      setError('');setLoading(true);
      const [familyResult,memberResult]=await Promise.all([api.get('/families'),api.get('/families/members')]);
      if(!mounted.current)return;
      if(!familyResult.data.family?.family_code || !Array.isArray(memberResult.data))throw new Error('Não foi possível carregar os dados de acesso da família. Tente novamente.');
      setCurrentFamily(familyResult.data.family);setChildren(familyResult.data.children||[]);setMembers(memberResult.data.filter((member:any)=>member.role==='parent'));
    } catch(e) {if(mounted.current)setError((e as Error).message||'Não foi possível carregar a família.');}
    finally {if(mounted.current)setLoading(false);}
  },[]);
  useEffect(()=>{mounted.current=true;void reload();return()=>{mounted.current=false;};},[reload]);
  const finish=async()=>{
    if(finishing.current || !user?.id || !currentFamily?.family_code)return;
    finishing.current=true;setSaving(true);setError('');
    try {
      const result=await supabase.from('users').update({has_onboarded:true}).eq('id',user.id).select('id').single();
      if(result.error || !result.data)throw new Error('Não foi possível concluir a configuração. Tente novamente.');
      await refreshProfile();
      const next=START_OPTIONS.find(option=>option.id===destination)!;
      router.replace((mode==='review'?'/parent':next.route) as any);
    } catch(e) {if(mounted.current)setError((e as Error).message);}
    finally {finishing.current=false;if(mounted.current)setSaving(false);}
  };
  return <View style={s.root}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.eyebrow}>{mode==='review'?'REVISAR CONFIGURAÇÃO':'PRIMEIROS PASSOS'}</Text>
    <Text accessibilityRole="header" style={s.title}>{STEP_TITLES[step]}</Text>
    <Text style={s.hint}>Passo {step+1} de 3 · você pode ajustar os dados depois na administração.</Text>
    <ProgressBar progress={((step+1)/3)*100}/>
    <View style={s.codeCard}><Text style={s.label}>{currentFamily?.name || 'Minha família'}</Text><Text selectable style={s.code}>{currentFamily?.family_code || 'Carregando código…'}</Text><Text style={s.hint}>Cada pessoa usa este código, seu próprio usuário e sua senha.</Text></View>
    {loading ? <ActivityIndicator color={Colors.primary} accessibilityLabel="Carregando família"/> : <>
      {step===0 && <>
        <Text style={s.body}>Adicione os filhos para organizar tarefas, saúde e recompensas. Outro responsável é opcional.</Text>
        {children.map(child=><View key={child.id} style={s.member}><UserAvatar avatarPreset={child.avatar_preset} name={child.name} size={48}/><View style={{flex:1}}><Text style={s.label}>{child.name}</Text><Text style={s.hint}>{child.username?`Usuário: ${child.username}`:'Perfil sem acesso próprio'}</Text></View><Text style={s.saved}>✓ Salvo</Text></View>)}
        {!children.length && <Text style={s.empty}>Nenhum filho adicionado. Você pode cadastrar agora ou continuar e fazer isso depois.</Text>}
        {isGestor && <><PrimaryButton label="Adicionar filho(a)" onPress={()=>setMemberRole('child')}/><PrimaryButton label="Adicionar outro responsável" variant="ghost" onPress={()=>setMemberRole('parent')}/></>}
        {members.filter(member=>member.id!==user?.id).map(member=><View key={member.id} style={s.member}><UserAvatar avatarPreset={member.avatar_preset} name={member.name} size={40}/><View style={{flex:1}}><Text style={s.label}>{member.name}</Text><Text style={s.hint}>{member.access_profile==='gestor'?'Gestor autorizado':'Responsável auxiliar'}</Text></View><Text style={s.saved}>✓ Salvo</Text></View>)}
      </>}
      {step===1 && <><Text style={s.body}>Escolha a primeira função que deseja usar. As outras continuam disponíveis no menu.</Text>{START_OPTIONS.map(option=><TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityState={{selected:destination===option.id}} onPress={()=>setDestination(option.id)} style={[s.option,destination===option.id&&s.selected]}><Text style={s.icon}>{option.icon}</Text><View style={{flex:1}}><Text style={s.label}>{option.title}</Text><Text style={s.hint}>{option.detail}</Text></View><Text style={s.saved}>{destination===option.id?'●':'○'}</Text></TouchableOpacity>)}</>}
      {step===2 && <><Text style={s.body}>{children.length} filho(s) e {members.length} responsável(is) cadastrados. Os dados já estão salvos.</Text><Text style={s.hint}>Tarefas organizam a rotina; recompensas incentivam as conquistas. Cadastre compromissos e medicamentos quando precisar.</Text>{!!user?.username && !!currentFamily?.family_code && <FamilyAccessMessage data={{name:String(user.name||''),username:String(user.username),familyName:currentFamily.name,familyCode:currentFamily.family_code}}/>}</>}
    </>}
    {!!error && <View style={s.errorCard}><Text accessibilityRole="alert" style={s.error}>{error}</Text><PrimaryButton label="Tentar novamente" variant="ghost" onPress={()=>{void reload();}}/></View>}
    <View style={s.navigation}>{step>0 && <PrimaryButton label="Voltar" variant="ghost" disabled={saving} onPress={()=>setStep(p=>p-1)}/>}<View style={{flex:1}}><PrimaryButton label={step===2?'Começar a usar':'Continuar'} disabled={loading||saving||!!error||!currentFamily?.family_code} loading={saving} onPress={()=>step===2?void finish():setStep(p=>p+1)}/></View></View>
  </ScrollView>{memberRole && <FamilyMemberAdminForm role={memberRole} childrenList={children} adultMembers={members} familyPrimary={currentFamily?.primary_color} familySecondary={currentFamily?.secondary_color} onClose={()=>setMemberRole(null)} onSaved={()=>{setMemberRole(null);void reload();}}/>}</View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:Colors.bg},content:{padding:22,gap:18,paddingBottom:48,maxWidth:680,width:'100%',alignSelf:'center'},eyebrow:{fontSize:12,fontWeight:'800',letterSpacing:1.5,color:Colors.primary},title:{fontSize:29,fontWeight:'800',color:Colors.text},hint:{fontSize:14,color:Colors.textSecondary,lineHeight:21},body:{fontSize:16,color:Colors.text,lineHeight:24},codeCard:{padding:18,backgroundColor:Colors.surface,borderRadius:18,gap:8,borderWidth:1,borderColor:Colors.border},code:{fontSize:24,fontWeight:'800',letterSpacing:1,color:Colors.primary},label:{fontSize:16,fontWeight:'700',color:Colors.text},member:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:16,backgroundColor:Colors.surface},saved:{fontWeight:'700',color:Colors.primary},empty:{padding:16,lineHeight:21,color:Colors.textSecondary,backgroundColor:Colors.surface,borderRadius:16},option:{flexDirection:'row',gap:14,padding:18,alignItems:'center',backgroundColor:Colors.surface,borderRadius:18,borderWidth:1,borderColor:Colors.border},selected:{borderColor:Colors.primary,backgroundColor:Colors.primaryLighter},icon:{fontSize:28},navigation:{flexDirection:'row',gap:12,alignItems:'center',marginTop:12},errorCard:{padding:14,borderRadius:14,backgroundColor:Colors.surface},error:{color:Colors.danger,lineHeight:21}});
