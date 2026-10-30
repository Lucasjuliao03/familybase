import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import CatalogAvatarChoice from './CatalogAvatarChoice';
import UserDisplayColorPicker from '../UserDisplayColorPicker';
import { pickFirstAvailableUserDisplayColor } from '../../lib/userDisplayColors';
import { ADULT_AVATAR_IDS, CHILD_AVATAR_IDS, MASCOT_IDS, birthAge, localToday, maskPhone, newRequestId, normalizePhone, normalizeUsername, suggestUsername } from '../../lib/familyIdentity';
import '../../pages/auth/family-auth.css';
import FamilyAccessMessage from './FamilyAccessMessage';

export default function FamilyMemberForm({ role, initial: incoming = {}, childrenList = [], onClose, onSaved, toast, familyPrimary, familySecondary, adultMembers }) {
  const initial=incoming || {};
  const isEdit = !!initial.id;
  const {user,family}=useAuth();
  const fixedAccess=isEdit && (initial.id===user?.id || initial.id===family?.gestor_user_id);
  const child = role === 'child';
  const hasLogin = child ? !!initial.user_id : isEdit;
  const ids = child ? CHILD_AVATAR_IDS : ADULT_AVATAR_IDS;
  const [form, setForm] = useState({ name: initial.name || '', nickname: initial.nickname || '', username: initial.username || '',
    email: initial.email || initial.user_email || '', password: '', birthday: initial.birthday || initial.date_of_birth || '',
    avatar_preset: ids.includes(initial.avatar_preset) ? initial.avatar_preset : '', mascot_id: initial.mascot_id || '',
    phone: maskPhone(initial.phone || ''), relationship: initial.relationship || '', access_profile: isEdit ? initial.access_profile || 'auxiliar' : 'auxiliar',
    color: initial.color || '#6C5CE7', display_color: initial.display_color || pickFirstAvailableUserDisplayColor({ primary: familyPrimary,secondary: familySecondary,adultMembers }), emoji: initial.emoji || '', notes: initial.notes || '',
    linked_child_ids: Array.isArray(initial.linked_child_ids) ? initial.linked_child_ids : String(initial.linked_child_ids || '').split(',').filter(Boolean), must_change_password: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savedAccess,setSavedAccess]=useState(null);
  const pending = useRef(false);
  const requestId = useRef(newRequestId());
  const [usernameEdited,setUsernameEdited]=useState(!!initial.username);
  const change = (key,value) => {if(key==='username')setUsernameEdited(true);setForm(p => ({ ...p, [key]: value, ...(key === 'name' && !usernameEdited ? { username: suggestUsername(value) } : {}) }));setError('');};
  const submit = async e => {
    e.preventDefault(); if (pending.current) return;
    if (!form.name.trim() || ((!isEdit || !hasLogin) && !normalizeUsername(form.username))) return setError('Informe o nome e um usuário válido (3 a 32 caracteres).');
    if ((!isEdit || !hasLogin) && form.password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.');
    if (!form.avatar_preset) return setError('Escolha um avatar.');
    if (form.birthday && birthAge(form.birthday) === null) return setError('Data de nascimento inválida.');
    if (!isEdit && role === 'parent' && (birthAge(form.birthday) === null || birthAge(form.birthday) < 18)) return setError('O responsável deve ter pelo menos 18 anos.');
    if (form.phone && !normalizePhone(form.phone)) return setError('Telefone brasileiro inválido.');
    pending.current = true; setBusy(true);
    const route = role === 'child' ? '/families/children' : role === 'relative' ? '/families/relatives' : '/families/members';
    try {
      const payload = { ...form, username: normalizeUsername(form.username), phone: form.phone ? normalizePhone(form.phone) : '', request_id: requestId.current };
      if(fixedAccess) delete payload.access_profile;
      const result = isEdit ? await api.put(route+'/'+initial.id,payload) : await api.post(route,payload);
      toast.success('Membro salvo com sucesso.');
      if (!isEdit || !hasLogin) {
        setSavedAccess({name:result.data.name,familyName:result.data.family_name || family?.name,familyCode:result.data.family_code,username:result.data.username});
        setForm(p=>({...p,password:''}));
      } else onSaved();
    } catch(e) { setError(e.message || 'Não foi possível salvar. Tente novamente.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const field = (key,label,props={}) => <div className="form-group"><label className="form-label" htmlFor={'member-'+key}>{label}</label><input id={'member-'+key} className="form-input" value={form[key]} onChange={e=>change(key,e.target.value)} {...props} /></div>;
  return <div className="modal-overlay"><div key={savedAccess?'access':'form'} className="modal fam-admin-modal">
    <div className="modal-header"><h2 className="modal-title">{savedAccess?'Acesso cadastrado':`${isEdit?'Editar':'Adicionar'} ${child?'filho(a)':role==='parent'?'responsável':'parente'}`}</h2><button className="modal-close" type="button" disabled={busy} onClick={savedAccess?onSaved:onClose}>×</button></div>
    {savedAccess ? <><FamilyAccessMessage data={savedAccess}/><div className="modal-footer"><button type="button" className="btn btn-primary" onClick={onSaved}>Concluir</button></div></> : <form onSubmit={submit} noValidate><fieldset disabled={busy} style={{ border:0,padding:0,margin:0,minWidth:0 }}>
      {field('name','Nome *',{ autoComplete:'name' })}
      {field('username','Usuário de acesso *',{ autoComplete:'off',readOnly:hasLogin,placeholder:'Ex: ana' })}
      <p className="family-auth-hint">O usuário precisa ser exclusivo somente nesta família. Acesso com código da família + usuário + senha.</p>
      {!child && field('email','E-mail pessoal (opcional)',{ type:'email',readOnly:hasLogin,placeholder:'Permite também entrar por e-mail' })}
      {child && hasLogin && initial.user_email && <p className="family-auth-hint">O login antigo {initial.user_email} também continua válido.</p>}
      {(!isEdit || !hasLogin) && <>
        {field('password','Senha inicial *',{ type:showPassword?'text':'password', autoComplete:'new-password',placeholder:'Pelo menos 6 caracteres' })}
        <button type="button" className="family-password-toggle" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Ocultar senha':'Mostrar senha'}</button>
        <label className="register-terms"><input type="checkbox" checked={form.must_change_password} onChange={e=>change('must_change_password',e.target.checked)} />Exigir troca no próximo login</label>
      </>}
      {field('birthday','Data de nascimento'+(!isEdit && role==='parent'?' *':''),{ type:'date',min:'1900-01-01',max:localToday() })}
      <span className="form-label">Avatar *</span><CatalogAvatarChoice kind={child?'child':'adult'} value={form.avatar_preset} onChange={id=>change('avatar_preset',id)} />
      {child ? <>
        <div className="form-group"><label className="form-label" htmlFor="member-mascot">Mascote</label><select id="member-mascot" className="form-select" value={form.mascot_id} onChange={e=>change('mascot_id',e.target.value)}><option value="">Escolher depois</option>{MASCOT_IDS.map(id=><option key={id} value={id}>{id[0].toUpperCase()+id.slice(1)}</option>)}</select></div>
        {field('nickname','Apelido')}{field('color','Cor do perfil',{ type:'color' })}
      </> : <>
        {field('phone','Telefone (opcional)',{ type:'tel',onChange:e=>change('phone',maskPhone(e.target.value)) })}
        <UserDisplayColorPicker value={form.display_color} onChange={v=>change('display_color',v)} primaryColor={familyPrimary} secondaryColor={familySecondary} excludeUserId={initial.id} adultMembers={adultMembers} />
        {role==='parent' && !fixedAccess && <div className="form-group"><label htmlFor="member-access" className="form-label">Permissões</label><select id="member-access" className="form-select" value={form.access_profile} onChange={e=>change('access_profile',e.target.value)}><option value="auxiliar">Responsável auxiliar</option><option value="gestor">Gestor autorizado</option></select></div>}
        {role==='relative' && <>{field('relationship','Parentesco')}<span className="form-label">Filhos autorizados</span>{childrenList.map(c=><label key={c.id} className="register-terms"><input type="checkbox" checked={form.linked_child_ids.includes(c.id)} onChange={e=>change('linked_child_ids',e.target.checked?[...form.linked_child_ids,c.id]:form.linked_child_ids.filter(id=>id!==c.id))} />{c.name}</label>)}</>}
      </>}
      {field('emoji','Emoji (opcional)')}
      {error && <p role="alert" className="family-field-error">{error}</p>}
      <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" type="submit">{busy?'Salvando…':'Salvar'}</button></div>
    </fieldset></form>}
  </div></div>;
}
