import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import api from '../../services/api';
import { ADULT_AVATAR_IDS, CHILD_AVATAR_IDS, MASCOT_IDS, birthAge, maskPhone, newRequestId, normalizePhone, normalizeUsername, suggestUsername } from '../../lib/familyIdentity';
import { BirthDatePicker } from '../auth/BirthDatePicker';
import { CatalogAvatarChoice } from '../auth/CatalogAvatarChoice';
import { Colors } from '../../theme';
import { UserDisplayColorPicker } from './UserDisplayColorPicker';
import { pickFirstAvailableUserDisplayColor } from '../../shared/lib/userDisplayColors';
import { FamilyAccessMessage, type AccessMessageData } from '../auth/FamilyAccessMessage';

export function FamilyMemberAdminForm({ role, initial = {}, childrenList = [], onClose, onSaved, familyPrimary, familySecondary, adultMembers }: any) {
  const isEdit = !!initial?.id;
  const {user,family}=useAuth();
  const fixedAccess=isEdit && (initial?.id===user?.id || initial?.id===family?.gestor_user_id);
  const child = role === 'child';
  const hasLogin = child ? !!initial?.user_id : isEdit;
  const ids = child ? CHILD_AVATAR_IDS : ADULT_AVATAR_IDS;
  const [form, setForm] = useState({ name: initial?.name || '', nickname: initial?.nickname || '', username: initial?.username || '', email: initial?.email || initial?.user_email || '', password: '',
    birthday: initial?.birthday || initial?.date_of_birth || '', avatar_preset: ids.includes(initial?.avatar_preset) ? initial.avatar_preset : '', mascot_id: initial?.mascot_id || '',
    phone: maskPhone(initial?.phone || ''), relationship: initial?.relationship || '', access_profile: isEdit ? initial?.access_profile || 'auxiliar' : 'auxiliar',
    color: initial?.color || '#6C5CE7', display_color: initial?.display_color || pickFirstAvailableUserDisplayColor({ primary: familyPrimary, secondary: familySecondary, adultMembers }), emoji: initial?.emoji || '', notes: initial?.notes || '',
    linked_child_ids: (Array.isArray(initial?.linked_child_ids) ? initial.linked_child_ids : String(initial?.linked_child_ids || '').split(',').filter(Boolean)) as string[], must_change_password: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savedAccess,setSavedAccess]=useState<AccessMessageData|null>(null);
  const pending = useRef(false);
  const requestId = useRef(newRequestId());
  const [usernameEdited,setUsernameEdited]=useState(!!initial?.username);
  const finish=()=>{onSaved();onClose();};
  const change = (key: string,value: any) => {if(key==='username')setUsernameEdited(true);setForm(p => ({ ...p, [key]: value, ...(key === 'name' && !usernameEdited ? { username: suggestUsername(value) } : {}) }));setError('');};
  const submit = async () => {
    if (pending.current) return;
    if (!form.name.trim() || ((!isEdit || !hasLogin) && !normalizeUsername(form.username))) return setError('Informe o nome e um usuário válido (3 a 32 caracteres).');
    if ((!isEdit || !hasLogin) && form.password.length < 6) return setError('Use uma senha com pelo menos 6 caracteres.');
    if (!form.avatar_preset) return setError('Escolha um avatar.');
    if (form.birthday && birthAge(form.birthday) === null) return setError('Data de nascimento inválida.');
    const age = birthAge(form.birthday);
    if (!isEdit && role==='parent' && (age === null || age<18)) return setError('O responsável deve ter pelo menos 18 anos.');
    if (form.phone && !normalizePhone(form.phone)) return setError('Telefone brasileiro inválido.');
    pending.current=true; setBusy(true);
    const route = child?'/families/children':role==='relative'?'/families/relatives':'/families/members';
    try {
      const payload={ ...form,username:normalizeUsername(form.username),phone:form.phone?normalizePhone(form.phone):'',request_id:requestId.current };
      if(fixedAccess) delete (payload as any).access_profile;
      const result = isEdit ? await api.put(route+'/'+initial.id,payload) : await api.post(route,payload);
      if (!isEdit || !hasLogin) {
        setSavedAccess({name:result.data.name,familyName:result.data.family_name || String(family?.name || ''),familyCode:result.data.family_code,username:result.data.username});
        setForm(p=>({...p,password:''}));
      } else finish();
    } catch(e) { setError((e as Error).message || 'Não foi possível salvar. Tente novamente.'); }
    finally { pending.current=false; setBusy(false); }
  };
  const field = (key: keyof typeof form,label: string,props: any={}) => <View style={s.group}><Text style={s.label}>{label}</Text><TextInput value={String(form[key] || '')} onChangeText={v=>change(key,v)} editable={!busy} accessibilityLabel={label} style={s.input} {...props} /></View>;
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if(!busy){if(savedAccess)finish();else onClose();} }}><View style={s.backdrop}><View style={s.sheet}>
    <Text style={s.heading}>{savedAccess?'Acesso cadastrado':`${isEdit?'Editar':'Adicionar'} ${child?'filho(a)':role==='parent'?'responsável':'parente'}`}</Text>
    <ScrollView key={savedAccess?'access':'form'} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:20}}>{savedAccess ? <><FamilyAccessMessage data={savedAccess}/><TouchableOpacity accessibilityRole="button" style={[s.chip,s.selected]} onPress={finish}><Text style={{textAlign:'center',fontWeight:'700'}}>Concluir</Text></TouchableOpacity></> : <>
      {field('name','Nome *')}{field('username','Usuário de acesso *',{autoCapitalize:'none',autoCorrect:false,editable:!busy&&!hasLogin,placeholder:'Ex: ana'})}
      <Text style={s.hint}>O usuário precisa ser exclusivo somente nesta família. Acesso com código da família + usuário + senha.</Text>
      {!child && field('email','E-mail pessoal (opcional)',{keyboardType:'email-address',autoCapitalize:'none',editable:!busy&&!hasLogin,placeholder:'Permite também entrar por e-mail'})}
      {child && hasLogin && !!initial?.user_email && <Text style={s.hint}>O login antigo {initial.user_email} também continua válido.</Text>}
      {(!isEdit || !hasLogin) && <>{field('password','Senha inicial *',{secureTextEntry:!showPassword,autoComplete:'new-password',placeholder:'Pelo menos 6 caracteres'})}<TouchableOpacity disabled={busy} onPress={()=>setShowPassword(v=>!v)}><Text style={s.link}>{showPassword?'Ocultar senha':'Mostrar senha'}</Text></TouchableOpacity><View style={s.row}><Switch disabled={busy} value={form.must_change_password} onValueChange={v=>change('must_change_password',v)} /><Text>Exigir troca no próximo login</Text></View></>}
      <Text style={s.label}>Data de nascimento{!isEdit && role==='parent'?' *':''}</Text><BirthDatePicker value={form.birthday} onChange={v=>change('birthday',v)} disabled={busy} />
      <Text style={s.label}>Avatar *</Text><CatalogAvatarChoice kind={child?'child':'adult'} value={form.avatar_preset} onChange={id=>change('avatar_preset',id)} disabled={busy} />
      {child ? <>
        <Text style={s.label}>Mascote</Text><View style={s.row}>{MASCOT_IDS.map((id: string)=><TouchableOpacity key={id} disabled={busy} onPress={()=>change('mascot_id',form.mascot_id===id?'':id)} style={[s.chip,form.mascot_id===id&&s.selected]}><Text style={{textTransform:'capitalize'}}>{id}</Text></TouchableOpacity>)}</View>
        {field('nickname','Apelido (opcional)')}<Text style={s.label}>Cor do perfil</Text><View style={s.row}>{['#6C5CE7','#0984E3','#E84393','#00B894'].map((color,index)=><TouchableOpacity key={color} accessibilityRole="button" accessibilityLabel={`Cor do perfil ${index+1}`} accessibilityState={{selected:form.color===color}} disabled={busy} onPress={()=>change('color',color)} style={{width:36,height:36,borderRadius:18,backgroundColor:color,borderWidth:form.color===color?3:0,borderColor:Colors.text}}/>)}</View>
      </> : <>
        {field('phone','Telefone (opcional)',{keyboardType:'phone-pad',onChangeText:(v: string)=>change('phone',maskPhone(v))})}
        <UserDisplayColorPicker value={form.display_color} onChange={v=>change('display_color',v)} primaryColor={familyPrimary} secondaryColor={familySecondary} excludeUserId={initial?.id} adultMembers={adultMembers} />
        {role==='parent' && !fixedAccess && <><Text style={s.label}>Permissões</Text><View style={s.row}>{['auxiliar','gestor'].map(id=><TouchableOpacity disabled={busy} key={id} style={[s.chip,form.access_profile===id&&s.selected]} onPress={()=>change('access_profile',id)}><Text>{id==='gestor'?'Gestor autorizado':'Responsável auxiliar'}</Text></TouchableOpacity>)}</View></>}
        {role==='relative' && <>{field('relationship','Parentesco')}<Text style={s.label}>Filhos autorizados</Text><View style={s.row}>{childrenList.map((c: any)=><TouchableOpacity disabled={busy} key={c.id} style={[s.chip,form.linked_child_ids.includes(c.id)&&s.selected]} onPress={()=>change('linked_child_ids',form.linked_child_ids.includes(c.id)?form.linked_child_ids.filter(id=>id!==c.id):[...form.linked_child_ids,c.id])}><Text>{c.name}</Text></TouchableOpacity>)}</View></>}
      </>}
      {field('emoji','Emoji (opcional)')}{child && field('notes','Observações')}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <View style={s.row}><TouchableOpacity style={s.chip} disabled={busy} onPress={onClose}><Text>Cancelar</Text></TouchableOpacity><TouchableOpacity style={[s.chip,s.selected]} disabled={busy} onPress={submit}>{busy?<ActivityIndicator color={Colors.primary}/>:<Text>Salvar</Text>}</TouchableOpacity></View>
    </>}</ScrollView>
  </View></View></Modal>;
}
const s=StyleSheet.create({backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.4)'},sheet:{maxHeight:'90%',backgroundColor:Colors.surface,padding:18,borderTopLeftRadius:24,borderTopRightRadius:24},heading:{fontSize:20,fontWeight:'800',color:Colors.text,marginBottom:14},group:{marginVertical:7},label:{fontWeight:'700',color:Colors.text,marginBottom:7,marginTop:10},input:{padding:12,borderWidth:1,borderColor:Colors.border,borderRadius:12,backgroundColor:Colors.bg,color:Colors.text},hint:{fontSize:12,color:Colors.textSecondary,lineHeight:18},link:{color:Colors.primary,marginVertical:8},row:{flexDirection:'row',gap:8,flexWrap:'wrap',alignItems:'center',marginVertical:8},chip:{padding:10,borderWidth:1,borderColor:Colors.border,borderRadius:12},selected:{borderColor:Colors.primary,backgroundColor:Colors.primaryLighter},error:{color:Colors.danger,marginVertical:10}});
