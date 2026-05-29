import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, Radii, FontSize, Shadow } from '../../theme';
import { UserDisplayColorPicker } from './UserDisplayColorPicker';
import {
  pickFirstAvailableUserDisplayColor,
  normalizeHex,
  isUserDisplaySwatchDisabled,
  USER_DISPLAY_COLOR_PALETTE,
} from '../../shared/lib/userDisplayColors';
import { COLOR_PRESETS, MEDAL_GROUPS, MEDAL_GROUP_LABELS, MEDAL_REQ_TYPES } from '../../lib/adminConstants';
import {
  inferCategoryForApi,
  inferMedalGroup,
  normalizeMedalRequirementTypeForSave,
} from '../../lib/medalHelpers';
import api from '../../services/api';

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={shell.backdrop}>
        <View style={shell.sheet}>
          <View style={shell.header}>
            <Text style={shell.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={shell.close}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={shell.body}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const shell = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg, maxHeight: '90%', ...Shadow.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, flex: 1 },
  close: { fontSize: 20, color: Colors.textSecondary, padding: 4 },
  body: { padding: 16, paddingBottom: 28 },
});

const f = StyleSheet.create({
  group: { marginBottom: 12 },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm, backgroundColor: Colors.bg },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: Radii.md, alignItems: 'center' },
  btnGhost: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  btnPrimary: { backgroundColor: Colors.primary },
  btnText: { fontWeight: '800', color: Colors.white },
  btnGhostText: { fontWeight: '700', color: Colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  chipText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.primaryDark },
  swatch: { width: 28, height: 28, borderRadius: 8 },
});

function Field(props: {
  label: string; value: string; onChangeText: (v: string) => void; multiline?: boolean;
  secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'numeric'; editable?: boolean;
}) {
  const { label, value, onChangeText, multiline, secureTextEntry, keyboardType, editable = true } = props;
  return (
    <View style={f.group}>
      <Text style={f.label}>{label}</Text>
      <TextInput style={[f.input, multiline && f.textarea]} value={value} onChangeText={onChangeText} multiline={multiline} secureTextEntry={secureTextEntry} keyboardType={keyboardType} editable={editable} />
    </View>
  );
}

function Footer({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <View style={f.row}>
      <TouchableOpacity style={[f.btn, f.btnGhost]} onPress={onClose}><Text style={f.btnGhostText}>Cancelar</Text></TouchableOpacity>
      <TouchableOpacity style={[f.btn, f.btnPrimary]} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={f.btnText}>Salvar</Text>}
      </TouchableOpacity>
    </View>
  );
}

export function PasswordResetModal({ visible, target, onClose, onSaved }: {
  visible: boolean; target: { id: string; childId?: string; name?: string; isChildUser?: boolean } | null; onClose: () => void; onSaved: () => void;
}) {
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!visible || !target) return null;

  const submit = async () => {
    if (password.length < 4) return Alert.alert('Senha', 'Mínimo 4 caracteres.');
    setSaving(true);
    try {
      if (target.isChildUser && target.childId) await api.put(`/families/children/${target.childId}/password`, { password, must_change_password: mustChange });
      else await api.put(`/families/members/${target.id}/password`, { password, must_change_password: mustChange });
      setPassword(''); onSaved(); onClose();
    } catch (err: any) { Alert.alert('Erro', err?.message || 'Falha ao alterar senha.'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={shell.backdrop}>
        <View style={[shell.sheet, { maxHeight: '70%' }]}>
          <View style={shell.header}><Text style={shell.title}>Redefinir senha</Text><TouchableOpacity onPress={onClose}><Text style={shell.close}>✕</Text></TouchableOpacity></View>
          <View style={shell.body}>
            <Text style={{ color: Colors.textSecondary, marginBottom: 12 }}>{target.name}</Text>
            <Field label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Switch value={mustChange} onValueChange={setMustChange} />
              <Text style={{ fontSize: FontSize.sm }}>Exigir troca no próximo login</Text>
            </View>
            <Footer saving={saving} onClose={onClose} onSave={submit} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function GuardianModal({ visible, initial, onClose, onSaved, familyPrimary, familySecondary, adultMembers }: any) {
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => {
    let displayColor = initial?.display_color;
    if (!isEdit) displayColor = pickFirstAvailableUserDisplayColor({ primary: familyPrimary, secondary: familySecondary, adultMembers });
    else {
      const n = normalizeHex(displayColor || '');
      if (!USER_DISPLAY_COLOR_PALETTE.some((c) => normalizeHex(c) === n) || isUserDisplaySwatchDisabled(n, { primary: familyPrimary, secondary: familySecondary, excludeUserId: initial.id, adultMembers })) {
        displayColor = pickFirstAvailableUserDisplayColor({ primary: familyPrimary, secondary: familySecondary, excludeUserId: initial.id, adultMembers });
      } else displayColor = n;
    }
    return { name: initial?.name || '', email: initial?.email || '', password: '', access_profile: initial?.access_profile === 'auxiliar' ? 'auxiliar' : 'gestor', phone: initial?.phone || '', emoji: initial?.emoji || '', display_color: displayColor, must_change_password: false };
  });
  if (!visible) return null;

  const submit = async () => {
    setSaving(true);
    try {
      if (isEdit) await api.put(`/families/members/${initial.id}`, { name: form.name, email: form.email, phone: form.phone, emoji: form.emoji || null, display_color: form.display_color, access_profile: form.access_profile });
      else await api.post('/families/members', { name: form.name, email: form.email, password: form.password || '123456', access_profile: form.access_profile, phone: form.phone, emoji: form.emoji, display_color: form.display_color, must_change_password: form.must_change_password });
      onSaved(); onClose();
    } catch (err: any) { Alert.alert('Erro', err?.message || 'Falha ao salvar.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? 'Editar responsável' : 'Adicionar responsável'} onClose={onClose}>
      <Field label="Nome *" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
      <Field label="E-mail *" value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} keyboardType="email-address" />
      {!isEdit && <Field label="Senha inicial" value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} secureTextEntry />}
      <View style={[f.chipRow, { marginBottom: 12 }]}>
        {(['gestor', 'auxiliar'] as const).map((ap) => (
          <TouchableOpacity key={ap} style={[f.chip, form.access_profile === ap && f.chipActive]} onPress={() => setForm((p) => ({ ...p, access_profile: ap }))}>
            <Text style={[f.chipText, form.access_profile === ap && f.chipTextActive]}>{ap === 'gestor' ? 'Gestor' : 'Auxiliar'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field label="Telefone" value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} />
      <Field label="Emoji" value={form.emoji} onChangeText={(v) => setForm((p) => ({ ...p, emoji: v }))} />
      <UserDisplayColorPicker value={form.display_color} onChange={(hex) => setForm((p) => ({ ...p, display_color: hex }))} primaryColor={familyPrimary} secondaryColor={familySecondary} excludeUserId={initial?.id} adultMembers={adultMembers} />
      {!isEdit && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}><Switch value={form.must_change_password} onValueChange={(v) => setForm((p) => ({ ...p, must_change_password: v }))} /><Text style={{ fontSize: FontSize.sm }}>Exigir troca de senha</Text></View>}
      <Footer saving={saving} onClose={onClose} onSave={submit} />
    </ModalShell>
  );
}

export function ChildAdminModal({ visible, initial, onClose, onSaved }: any) {
  const isEdit = !!initial?.id;
  const hasLogin = !!(initial?.user_id || initial?.user_email);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: initial?.name || '', nickname: initial?.nickname || '', age: initial?.age != null ? String(initial.age) : '', email: initial?.user_email || '', password: '', color: initial?.color || '#6C5CE7', emoji: initial?.emoji || '', notes: initial?.notes || '', must_change_password: false });
  if (!visible) return null;

  const submit = async () => {
    const emailTrim = form.email.trim().toLowerCase();
    if ((!isEdit || !hasLogin) && (!emailTrim || form.password.length < 6)) return Alert.alert('Dados incompletos', 'E-mail e senha (mín. 6) são obrigatórios.');
    setSaving(true);
    try {
      const payload = { name: form.name, nickname: form.nickname, age: form.age === '' ? null : Number(form.age), color: form.color, emoji: form.emoji, notes: form.notes };
      if (isEdit) await api.put(`/families/children/${initial.id}`, { ...payload, email: emailTrim || undefined, password: !hasLogin ? form.password : undefined, must_change_password: !hasLogin ? form.must_change_password : undefined });
      else await api.post('/families/children', { ...payload, email: emailTrim, password: form.password, must_change_password: form.must_change_password });
      onSaved(); onClose();
    } catch (err: any) { Alert.alert('Erro', err?.message || 'Falha ao salvar.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? 'Editar filho(a)' : 'Adicionar filho(a)'} onClose={onClose}>
      <Field label="Nome *" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
      <Field label="Apelido" value={form.nickname} onChangeText={(v) => setForm((p) => ({ ...p, nickname: v }))} />
      <Field label="Idade" value={form.age} onChangeText={(v) => setForm((p) => ({ ...p, age: v }))} keyboardType="numeric" />
      <Field label={`E-mail${(!isEdit || !hasLogin) ? ' *' : ''}`} value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} editable={!isEdit || !hasLogin} keyboardType="email-address" />
      {(!isEdit || !hasLogin) && (<><Field label="Senha *" value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} secureTextEntry /><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}><Switch value={form.must_change_password} onValueChange={(v) => setForm((p) => ({ ...p, must_change_password: v }))} /><Text style={{ fontSize: FontSize.sm }}>Exigir troca de senha</Text></View></>)}
      <View style={[f.chipRow, { marginBottom: 12 }]}>{COLOR_PRESETS.map((c) => (<TouchableOpacity key={c} onPress={() => setForm((p) => ({ ...p, color: c }))} style={[f.swatch, { backgroundColor: c, borderWidth: form.color === c ? 3 : 0, borderColor: Colors.text }]} />))}</View>
      <Field label="Emoji" value={form.emoji} onChangeText={(v) => setForm((p) => ({ ...p, emoji: v }))} />
      <Field label="Observações" value={form.notes} onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))} multiline />
      <Footer saving={saving} onClose={onClose} onSave={submit} />
    </ModalShell>
  );
}

export function RelativeAdminModal({ visible, initial, childrenList, onClose, onSaved, familyPrimary, familySecondary, adultMembers }: any) {
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);
  const linkedInit = Array.isArray(initial?.linked_child_ids) ? initial.linked_child_ids : String(initial?.linked_child_ids || '').split(',').filter(Boolean);
  const [form, setForm] = useState({ name: initial?.name || '', email: initial?.email || '', password: '', relationship: initial?.relationship || '', access_profile: initial?.access_profile === 'auxiliar' ? 'auxiliar' : 'parente', phone: initial?.phone || '', emoji: initial?.emoji || '', display_color: initial?.display_color || pickFirstAvailableUserDisplayColor({ primary: familyPrimary, secondary: familySecondary, adultMembers }), linked_child_ids: linkedInit as string[], must_change_password: false });
  if (!visible) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const body = { name: form.name, email: form.email, relationship: form.relationship, access_profile: form.access_profile, phone: form.phone, emoji: form.emoji, display_color: form.display_color, linked_child_ids: form.linked_child_ids };
      if (isEdit) await api.put(`/families/relatives/${initial.id}`, body);
      else await api.post('/families/relatives', { ...body, password: form.password || '123456', must_change_password: form.must_change_password });
      onSaved(); onClose();
    } catch (err: any) { Alert.alert('Erro', err?.message || 'Falha ao salvar.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? 'Editar parente' : 'Adicionar parente'} onClose={onClose}>
      <Field label="Nome *" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
      <Field label="E-mail *" value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} keyboardType="email-address" />
      {!isEdit && <Field label="Senha inicial" value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} secureTextEntry />}
      <Field label="Parentesco" value={form.relationship} onChangeText={(v) => setForm((p) => ({ ...p, relationship: v }))} />
      <UserDisplayColorPicker value={form.display_color} onChange={(hex) => setForm((p) => ({ ...p, display_color: hex }))} primaryColor={familyPrimary} secondaryColor={familySecondary} excludeUserId={initial?.id} adultMembers={adultMembers} />
      <Text style={f.label}>Filhos vinculados</Text>
      <View style={[f.chipRow, { marginBottom: 12 }]}>{childrenList.map((c: any) => (<TouchableOpacity key={c.id} style={[f.chip, form.linked_child_ids.includes(c.id) && f.chipActive]} onPress={() => setForm((p) => ({ ...p, linked_child_ids: p.linked_child_ids.includes(c.id) ? p.linked_child_ids.filter((x) => x !== c.id) : [...p.linked_child_ids, c.id] }))}><Text style={[f.chipText, form.linked_child_ids.includes(c.id) && f.chipTextActive]}>{c.name}</Text></TouchableOpacity>))}</View>
      <Footer saving={saving} onClose={onClose} onSave={submit} />
    </ModalShell>
  );
}

export function MedalAdminModal({ visible, initial, onClose, onSaved }: any) {
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: initial?.name || '', catalog_slug: initial?.catalog_slug || '', icon: initial?.icon || '🏅', color: initial?.color || '#6C5CE7', description: initial?.description || '', rule_description: initial?.rule_description || '', medal_group: initial?.medal_group || inferMedalGroup(initial || {}), requirement_type: normalizeMedalRequirementTypeForSave(initial?.requirement_type || 'task_count'), requirement_value: String(initial?.requirement_value ?? 1), extra_points: String(initial?.extra_points ?? 0), is_active: initial?.is_active !== false && initial?.is_active !== 0 });
  if (!visible) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const body: any = { name: form.name, name_en: form.name, description: form.description, description_en: form.description, icon: form.icon, color: form.color, category: inferCategoryForApi(form), medal_group: form.medal_group, requirement_type: normalizeMedalRequirementTypeForSave(form.requirement_type), requirement_value: Math.max(0, Number(form.requirement_value) || 0), extra_points: Number(form.extra_points) || 0, rule_description: form.rule_description, is_active: form.is_active };
      if (form.catalog_slug.trim()) body.catalog_slug = form.catalog_slug.trim();
      if (isEdit) await api.put(`/gamification/medals/${initial.id}`, body);
      else await api.post('/gamification/medals', body);
      onSaved(); onClose();
    } catch (err: any) { Alert.alert('Erro', err?.message || 'Falha ao salvar medalha.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? 'Editar medalha' : 'Nova medalha'} onClose={onClose}>
      <Field label="Nome *" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
      <Field label="Slug" value={form.catalog_slug} onChangeText={(v) => setForm((p) => ({ ...p, catalog_slug: v }))} />
      <Field label="Ícone" value={form.icon} onChangeText={(v) => setForm((p) => ({ ...p, icon: v }))} />
      <Field label="Cor" value={form.color} onChangeText={(v) => setForm((p) => ({ ...p, color: v }))} />
      <Field label="Descrição" value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} multiline />
      <Field label="Regra" value={form.rule_description} onChangeText={(v) => setForm((p) => ({ ...p, rule_description: v }))} multiline />
      <View style={[f.chipRow, { marginBottom: 12 }]}>{MEDAL_GROUPS.map((g) => (<TouchableOpacity key={g} style={[f.chip, form.medal_group === g && f.chipActive]} onPress={() => setForm((p) => ({ ...p, medal_group: g }))}><Text style={[f.chipText, form.medal_group === g && f.chipTextActive]}>{MEDAL_GROUP_LABELS[g] || g}</Text></TouchableOpacity>))}</View>
      <View style={[f.chipRow, { marginBottom: 12 }]}>{MEDAL_REQ_TYPES.map((r) => (<TouchableOpacity key={r.value} style={[f.chip, form.requirement_type === r.value && f.chipActive]} onPress={() => setForm((p) => ({ ...p, requirement_type: r.value }))}><Text style={[f.chipText, form.requirement_type === r.value && f.chipTextActive]}>{r.label}</Text></TouchableOpacity>))}</View>
      <Field label="Valor" value={form.requirement_value} onChangeText={(v) => setForm((p) => ({ ...p, requirement_value: v }))} keyboardType="numeric" />
      <Field label="Pontos extras" value={form.extra_points} onChangeText={(v) => setForm((p) => ({ ...p, extra_points: v }))} keyboardType="numeric" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}><Switch value={form.is_active} onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))} /><Text style={{ fontSize: FontSize.sm }}>Ativa</Text></View>
      <Footer saving={saving} onClose={onClose} onSave={submit} />
    </ModalShell>
  );
}

export function dedupeDisplayMedals(medals: any[]) {
  const fam = medals.filter((m) => m.family_id);
  const global = medals.filter((m) => !m.family_id);
  const seen = new Set<string>();
  const globDedup = global.filter((m) => { const k = String(m.catalog_slug || m.name || m.id); if (seen.has(k)) return false; seen.add(k); return true; });
  globDedup.sort((a, b) => String(a.catalog_slug || a.name || '').localeCompare(String(b.catalog_slug || b.name || ''), 'pt'));
  return [...fam, ...globDedup];
}

export function openMedalFromTemplate(m: any) {
  return { name: m.name ? `${m.name} (família)` : '', description: m.description || '', icon: m.icon || '🏅', color: m.color || '#6C5CE7', medal_group: inferMedalGroup(m), requirement_type: normalizeMedalRequirementTypeForSave(m.requirement_type), requirement_value: m.requirement_value ?? 1, extra_points: m.extra_points ?? 0, rule_description: m.rule_description || '', is_active: true };
}
