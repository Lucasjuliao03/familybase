import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, RefreshControl, Modal, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAppSettings, AppSettings } from '../../src/contexts/AppSettingsContext';
import { adminRequest } from '../../src/lib/adminApi';

type Family = { id: string; name: string; status: string; plan: string };
type Member = { id: string; name: string; email: string; role: string; status: string; family_id: string };
type Snapshot = {
 stats: { totalFamilies: number; activeFamilies: number; totalUsers: number; activeUsers: number };
 families: Family[]; users: Member[]; settings: AppSettings;
 modules: { family_id: string; module_key: string; is_enabled: boolean }[];
 audit: { id: string; actor_id: string; action: string; target_id: string; created_at: string }[];
};
const modules: Record<string,string> = { tasks:'Tarefas', routines:'Rotinas', calendar:'Calendário', allowance:'Mesada', family_shop:'Loja da família', medals:'Medalhas', grades:'Notas escolares', piggy_bank:'Cofrinho', goals:'Metas', reports:'Relatórios', notifications:'Notificações', shopping:'Compras', health:'Saúde', mural:'Mural', location:'Localização' };
const tabs = { overview:'Visão geral', families:'Famílias', users:'Usuários', settings:'Configurações', audit:'Histórico' };
const actions: Record<string,string> = { family_status:'Estado da família', user_status:'Estado do usuário', family_modules:'Módulos da família', settings:'Configurações gerais' };
export default function MasterHomeScreen() {
 const { user, logout } = useAuth();
 const { refresh: refreshSettings } = useAppSettings();
 const insets = useSafeAreaInsets();
 const [tab,setTab] = useState<keyof typeof tabs>('overview');
 const [data,setData] = useState<Snapshot|null>(null);
 const [draft,setDraft] = useState<AppSettings>({ announcement:'',support_email:'',privacy_url:'',terms_url:'' });
 const [search,setSearch] = useState('');
 const [loading,setLoading] = useState(true);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const [notice,setNotice] = useState('');
 const [selected,setSelected] = useState<Family|null>(null);
 const [moduleDraft,setModuleDraft] = useState<Record<string,boolean>>({});
 const [confirm,setConfirm] = useState<{ action:string; payload:Record<string,unknown>; label:string }|null>(null);
 const load = useCallback(async () => {
  setLoading(true); setError('');
  try { const next = await adminRequest() as Snapshot; setData(next); setDraft(next.settings); }
  catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.'); }
  finally { setLoading(false); }
 },[]);
 useEffect(()=>{ void load(); },[load]);
 const mutate = async (action:string,payload:Record<string,unknown>) => {
  setBusy(true); setError(''); setNotice('');
  try { await adminRequest(action,payload); setConfirm(null); setSelected(null); await load(); await refreshSettings(); setNotice('Alteração salva e registrada no histórico.'); }
  catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
  finally { setBusy(false); }
 };
 const families = useMemo(()=> (data?.families || []).filter(f=>(f.name||'').toLocaleLowerCase().includes(search.toLocaleLowerCase())),[data?.families,search]);
 const members = useMemo(()=> (data?.users || []).filter(u=>((u.name||'')+' '+u.email).toLocaleLowerCase().includes(search.toLocaleLowerCase())),[data?.users,search]);
 const openModules = (family:Family) => {
  const values:Record<string,boolean>={};
  Object.keys(modules).forEach(key=>{ values[key]=data?.modules.find(m=>m.family_id===family.id && m.module_key===key)?.is_enabled ?? true; });
  setModuleDraft(values);setSelected(family);
 };
 const button = (label:string,onPress:()=>void,secondary=false) => <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} style={[s.button,secondary&&s.secondary,busy&&{opacity:.45}]}><Text style={[s.buttonText,secondary&&{color:'#344273'}]}>{label}</Text></TouchableOpacity>;
 const askStatus = (action:string,id:string,status:string,name:string) => setConfirm({action,payload:{id,status:status==='inactive'?'active':'inactive'},label:(status==='inactive'?'Reativar':'Suspender')+' o acesso de '+name+'?'});
 return <View style={s.page}>
  <ScrollView contentContainerStyle={[s.content,{paddingTop:Math.max(insets.top,20)+12}]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>
   <Text style={s.eyebrow}>TUDO DE FAMÍLIA · ADMINISTRAÇÃO</Text>
   <Text style={s.title}>Controle do aplicativo</Text>
   <Text style={s.muted}>Olá, {user?.name || 'Administrador'}. Gerencie famílias, acessos e configurações.</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
    {Object.entries(tabs).map(([key,label])=><TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>{setTab(key as keyof typeof tabs);setSearch('');}} style={[s.tab,tab===key&&s.tabActive]}><Text style={[s.tabText,tab===key&&{color:'white'}]}>{label}</Text></TouchableOpacity>)}
   </ScrollView>
   {!!error&&<View style={s.error}><Text accessibilityRole="alert" style={{color:'#9f1239'}}>{error}</Text>{button('Tentar novamente',()=>{void load();},true)}</View>}
   {!!notice&&<Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
   {loading&&!data?<ActivityIndicator size="large" color="#4f46e5"/>:null}
   {data&&tab==='overview'&&<>
    <View style={s.stats}>{[['Famílias',data.stats.totalFamilies,data.stats.activeFamilies+' ativas'],['Usuários',data.stats.totalUsers,data.stats.activeUsers+' ativos']].map(([label,value,detail])=><View key={String(label)} style={s.stat}><Text style={s.number}>{value}</Text><Text style={s.heading}>{label}</Text><Text style={s.muted}>{detail}</Text></View>)}</View>
    <View style={s.card}><Text style={s.heading}>Operação atual</Text><Text style={s.body}>Acesso liberado. Cobrança desativada nesta fase.</Text><Text style={s.body}>Famílias e usuários são administrados sem apagar seus dados. Alterações ficam registradas no histórico.</Text>{button('Configurar aplicativo',()=>setTab('settings'))}</View>
    <View style={s.card}><Text style={s.heading}>Google Play</Text><Text style={s.body}>Assinaturas em planejamento. Esta versão não efetua compras nem libera planos com base em pagamentos.</Text></View>
   </>}
   {(tab==='families'||tab==='users')&&<TextInput accessibilityLabel="Buscar no painel" placeholder={tab==='families'?'Buscar família pelo nome':'Buscar usuário por nome ou e-mail'} placeholderTextColor="#64748b" value={search} onChangeText={setSearch} style={s.input}/>}
   {data&&tab==='families'&&<>
    <Text style={s.muted}>{families.length} famílias nesta lista</Text>
    {families.map(f=><View key={f.id} style={s.card}><Text style={s.heading}>{f.name}</Text><Text style={s.muted}>Estado: {f.status} · Plano: {f.plan}</Text><View style={s.row}>{button('Configurar módulos',()=>openModules(f),true)}{button(f.status==='inactive'?'Reativar':'Suspender',()=>askStatus('family_status',f.id,f.status,f.name),true)}</View></View>)}
    {!families.length&&<Text style={s.body}>Nenhuma família encontrada para essa busca.</Text>}
   </>}
   {data&&tab==='users'&&<>
    <Text style={s.muted}>{members.length} usuários nesta lista</Text>
    {members.map(u=><View key={u.id} style={s.card}><Text style={s.heading}>{u.name||'Usuário'}</Text><Text style={s.body}>{u.email}</Text><Text style={s.muted}>{u.role} · {u.status} · {data.families.find(f=>f.id===u.family_id)?.name||'Administração'}</Text>{u.role!=='master'&&button(u.status==='inactive'?'Reativar acesso':'Suspender acesso',()=>askStatus('user_status',u.id,u.status,u.name||u.email),true)}</View>)}
    {!members.length&&<Text style={s.body}>Nenhum usuário encontrado para essa busca.</Text>}
   </>}
   {data&&tab==='settings'&&<View style={s.card}>
    <Text style={s.heading}>Comunicação e ajuda</Text>
    <Text style={s.body}>O aviso aparece no aplicativo. Os links e o contato ficam no perfil dos membros. Deixe em branco para ocultar.</Text>
    {([['announcement','Aviso geral (até 300 caracteres)'],['support_email','E-mail de suporte'],['privacy_url','Política de privacidade (HTTPS)'],['terms_url','Termos de uso (HTTPS)']] as const).map(([key,label])=><View key={key}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={draft[key]} onChangeText={value=>setDraft(prev=>({...prev,[key]:value}))} multiline={key==='announcement'} maxLength={key==='announcement'?300:2048} autoCapitalize={key==='announcement'?'sentences':'none'} keyboardType={key==='support_email'?'email-address':'default'} style={s.input}/></View>)}
    {button(busy?'Salvando…':'Salvar configurações',()=>{void mutate('settings',draft);})}
   </View>}
   {data&&tab==='audit'&&<>
    <Text style={s.muted}>Últimas 50 alterações administrativas</Text>
    {data.audit.map(a=><View key={a.id} style={s.card}><Text style={s.heading}>{actions[a.action]||a.action}</Text><Text style={s.body}>{data.families.find(f=>f.id===a.target_id)?.name||data.users.find(u=>u.id===a.target_id)?.name||'Aplicativo'}</Text><Text style={s.muted}>{new Date(a.created_at).toLocaleString('pt-BR')} · {data.users.find(u=>u.id===a.actor_id)?.name||'Administrador'}</Text></View>)}
    {!data.audit.length&&<Text style={s.body}>Nenhuma alteração administrativa registrada ainda.</Text>}
   </>}
   {button('Atualizar painel',()=>{void load();},true)}
   {button('Sair da conta',()=>{void logout();},true)}
  </ScrollView>
  <Modal visible={!!selected} transparent animationType="slide" onRequestClose={()=>{if(!busy)setSelected(null);}}>
   <View style={s.overlay}><View style={[s.sheet,{paddingBottom:Math.max(insets.bottom,16)+16}]}>
    <Text style={s.heading}>Módulos · {selected?.name}</Text>
    {!!error&&<Text style={{color:'#9f1239'}}>{error}</Text>}
    <ScrollView>{Object.entries(modules).map(([key,label])=><View style={s.moduleRow} key={key}><Text style={s.body}>{label}</Text><Switch accessibilityLabel={label} disabled={busy} value={moduleDraft[key]??true} onValueChange={value=>setModuleDraft(prev=>({...prev,[key]:value}))}/></View>)}</ScrollView>
    {button(busy?'Salvando…':'Salvar módulos',()=>{if(selected)void mutate('family_modules',{id:selected.id,modules:moduleDraft});})}
    {button('Cancelar',()=>setSelected(null),true)}
   </View></View>
  </Modal>
  <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={()=>{if(!busy)setConfirm(null);}}>
   <View style={s.overlay}><View style={[s.sheet,{paddingBottom:Math.max(insets.bottom,16)+16}]}>
    <Text style={s.heading}>{confirm?.label}</Text>
    <Text style={s.body}>A alteração afeta o acesso e será registrada. Nenhum dado será apagado.</Text>
    {!!error&&<Text style={{color:'#9f1239'}}>{error}</Text>}
    {button(busy?'Salvando…':'Confirmar alteração',()=>{if(confirm)void mutate(confirm.action,confirm.payload);})}
    {button('Cancelar',()=>setConfirm(null),true)}
   </View></View>
  </Modal>
 </View>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#f4f6fb'},content:{padding:20,paddingBottom:36,gap:12},
 eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.2,color:'#526291'},title:{fontSize:28,fontWeight:'800',color:'#18274c'},muted:{fontSize:12,lineHeight:19,color:'#60708b'},
 body:{fontSize:14,lineHeight:22,color:'#374866'},heading:{fontSize:17,fontWeight:'700',color:'#213458'},
 tabs:{gap:8,paddingVertical:10},tab:{paddingHorizontal:16,paddingVertical:12,borderRadius:24,backgroundColor:'#e5eaf5'},tabActive:{backgroundColor:'#4f46e5'},tabText:{fontWeight:'700',color:'#455679'},
 card:{backgroundColor:'white',padding:18,borderRadius:18,gap:10,borderWidth:1,borderColor:'#e3e8f2'},stats:{flexDirection:'row',gap:12},stat:{flex:1,padding:20,backgroundColor:'white',borderRadius:18,gap:4},number:{fontSize:34,fontWeight:'800',color:'#4f46e5'},
 row:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{backgroundColor:'#4f46e5',paddingHorizontal:16,paddingVertical:13,borderRadius:12,alignItems:'center',marginTop:4},buttonText:{color:'white',fontWeight:'700',fontSize:13},secondary:{backgroundColor:'#eaf0fa'},
 input:{borderWidth:1,borderColor:'#cbd5e1',backgroundColor:'white',borderRadius:12,padding:13,fontSize:14,color:'#1e293b'},label:{fontSize:13,fontWeight:'600',color:'#334155',marginVertical:8},
 error:{backgroundColor:'#fff1f2',padding:14,borderRadius:12,gap:8},notice:{backgroundColor:'#dcfce7',color:'#166534',padding:14,borderRadius:12},
 overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(15,23,42,.45)'},sheet:{backgroundColor:'white',padding:22,borderTopLeftRadius:24,borderTopRightRadius:24,maxHeight:'85%',gap:10},moduleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8}
});
