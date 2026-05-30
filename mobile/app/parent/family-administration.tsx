import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Switch,
  RefreshControl,
  TextInput,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, FontSize, Shadow } from '../../src/theme';
import { AvatarPicker } from '../../src/components/profile/AvatarPicker';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import { FamilyModuleRow, MODULE_ICONS, MODULE_LABELS } from '../../src/lib/moduleCatalog';
import {
  ADMIN_TABS,
  AdminTabId,
  COLOR_PRESETS,
  PROFILE_INFO,
  RESET_KEPT,
  RESET_PHRASE,
  RESET_REMOVED,
  SECURITY_ITEMS,
} from '../../src/lib/adminConstants';
import {
  ChildAdminModal,
  GuardianModal,
  MedalAdminModal,
  PasswordResetModal,
  RelativeAdminModal,
  dedupeDisplayMedals,
  openMedalFromTemplate,
} from '../../src/components/admin/AdminModals';
import { publicAssetUrl } from '../../src/lib/api';
import { supabase } from '../../src/lib/supabase';
import api from '../../src/services/api';
import { AppLogo } from '../../src/components/ui/AppLogo';

export default function FamilyAdministrationScreen() {
  const router = useRouter();
  const { user, isGestor, loading: authLoading, refreshProfile } = useAuth();

  const [tab, setTab] = useState<AdminTabId>('family');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const [familyForm, setFamilyForm] = useState<any>({});
  const [moduleSettings, setModuleSettings] = useState<{ modules: FamilyModuleRow[] } | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [relatives, setRelatives] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [medals, setMedals] = useState<any[]>([]);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const [userModal, setUserModal] = useState<any>(null);
  const [childModal, setChildModal] = useState<any>(null);
  const [relModal, setRelModal] = useState<any>(null);
  const [medalModal, setMedalModal] = useState<any>(null);
  const [pwModal, setPwModal] = useState<any>(null);
  const [resetPhrase, setResetPhrase] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !isGestor) router.replace('/parent/profile');
  }, [authLoading, isGestor, router]);

  const parentsList = useMemo(() => members.filter((m) => m.role === 'parent'), [members]);
  const adultMembers = useMemo(() => [...parentsList, ...relatives], [parentsList, relatives]);
  const displayMedals = useMemo(() => dedupeDisplayMedals(medals), [medals]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [famRes, memRes, relRes, medRes, modsRes] = await Promise.all([
        api.get('/families'),
        api.get('/families/members'),
        api.get('/families/relatives'),
        api.get('/gamification/medals'),
        api.get('/families/modules'),
      ]);
      const fam = famRes.data?.family || {};
      setFamilyForm(fam);
      setChildren(famRes.data?.children || []);
      setMembers(memRes.data || []);
      setRelatives(relRes.data || []);
      setMedals(medRes.data || []);
      setModuleSettings(modsRes.data ?? null);
    } catch {
      if (!silent) Alert.alert('Erro', 'Não foi possível carregar a administração.');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (isGestor) loadAll(); }, [isGestor, loadAll]);

  const saveFamily = async () => {
    setSavingFamily(true);
    try {
      await api.put('/families', {
        name: familyForm.name,
        language: familyForm.language,
        contact_email: familyForm.contact_email,
        contact_phone: familyForm.contact_phone,
        emoji: familyForm.emoji,
        primary_color: familyForm.primary_color,
        secondary_color: familyForm.secondary_color,
        status: familyForm.status,
      });
      await refreshProfile();
      await loadAll(true);
      Alert.alert('Salvo', 'Dados da família atualizados.');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao salvar.');
    } finally {
      setSavingFamily(false);
    }
  };

  const uploadLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permissão', 'Precisamos de acesso à galeria.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setLogoUploading(true);
    try {
      const asset = result.assets[0];
      const fd = new FormData();
      fd.append('logo', { uri: asset.uri, name: asset.fileName || 'logo.png', type: asset.mimeType || 'image/png' } as unknown as Blob);
      const { data } = await api.put('/families/logo', fd);
      setFamilyForm((p: any) => ({ ...p, logo_url: data.logo_url }));
      await refreshProfile();
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha no upload do logo.');
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = async () => {
    try {
      await api.delete('/families/logo');
      setFamilyForm((p: any) => ({ ...p, logo_url: null }));
      await loadAll(true);
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao remover logo.');
    }
  };

  const patchModule = async (key: string, nextEnabled: boolean) => {
    if (!nextEnabled) {
      Alert.alert('Desativar módulo', 'O módulo ficará oculto para todos. Continuar?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desativar', style: 'destructive', onPress: () => doPatchModule(key, nextEnabled) },
      ]);
      return;
    }
    await doPatchModule(key, nextEnabled);
  };

  const doPatchModule = async (key: string, nextEnabled: boolean) => {
    setSavingModule(key);
    try {
      await api.put('/families/modules', { modules: { [key]: nextEnabled } });
      await refreshProfile();
      const { data: fresh } = await api.get('/families/modules');
      setModuleSettings(fresh ?? null);
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao atualizar módulo.');
    } finally {
      setSavingModule(null);
    }
  };

  const deleteMedal = (id: string) => {
    Alert.alert('Excluir medalha', 'Confirma exclusão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try { await api.delete(`/gamification/medals/${id}`); loadAll(true); }
        catch (err: any) { Alert.alert('Erro', err?.message || 'Falha ao excluir.'); }
      }},
    ]);
  };

  const executeReset = async () => {
    if (resetPhrase.trim().toUpperCase() !== RESET_PHRASE) return Alert.alert('Confirmação', `Digite exatamente: ${RESET_PHRASE}`);
    setResetLoading(true);
    try {
      const { error } = await supabase.rpc('reset_family_data', { p_family_id: user?.family_id ?? null });
      if (error) throw error;
      setResetPhrase('');
      await loadAll(true);
      await refreshProfile();
      Alert.alert('Concluído', 'Dados operacionais da família foram limpos.');
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao limpar dados.');
    } finally {
      setResetLoading(false);
    }
  };

  const deleteMember = (id: string, name: string) => {
    Alert.alert(
      'Excluir Responsável',
      `Tem certeza que deseja excluir ${name}? Esta ação não pode ser desfeita e removerá o acesso dele ao aplicativo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/families/members/${id}`);
              await loadAll(true);
              Alert.alert('Excluído', 'Responsável excluído com sucesso.');
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Falha ao excluir responsável.');
            }
          },
        },
      ]
    );
  };

  const deleteRelative = (id: string, name: string) => {
    Alert.alert(
      'Excluir Parente',
      `Tem certeza que deseja excluir ${name}? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/families/relatives/${id}`);
              await loadAll(true);
              Alert.alert('Excluído', 'Parente excluído com sucesso.');
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Falha ao excluir parente.');
            }
          },
        },
      ]
    );
  };

  const deleteChild = (id: string, name: string) => {
    Alert.alert(
      'Excluir Filho(a)',
      `ATENÇÃO: Deseja realmente excluir ${name}? Esta ação é permanente e apagará todas as tarefas, mesadas e histórico associados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/families/children/${id}`);
              await loadAll(true);
              Alert.alert('Excluído', 'Filho(a) excluído(a) com sucesso.');
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Falha ao excluir filho(a).');
            }
          },
        },
      ]
    );
  };

  const canEditMemberAvatar = (memberId: string) => {
    if (!user?.id) return false;
    if (String(user.id) === String(memberId)) return true;
    return isGestor;
  };

  if (authLoading || (!isGestor && !authLoading)) {
    return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const logoSrc = familyForm.logo_url ? publicAssetUrl(familyForm.logo_url) : '';

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Text style={s.backBtnText}>‹</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Administração da família</Text>
          <TouchableOpacity onPress={() => router.push('/parent/billing')}><Text style={s.billingLink}>Assinatura / billing</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabRow}>
        {ADMIN_TABS.map((t) => (
          <TouchableOpacity key={t.id} style={[s.tabBtn, tab === t.id && s.tabBtnActive, (t as any).risk && s.tabBtnRisk]} onPress={() => setTab(t.id)}>
            <Text style={[s.tabText, tab === t.id && s.tabTextActive, (t as any).risk && s.tabTextRisk]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(true); }} />}>
          {tab === 'family' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Dados da família</Text>
              <FormField label="Nome" value={familyForm.name || ''} onChangeText={(v) => setFamilyForm((p: any) => ({ ...p, name: v }))} />
              <FormField label="E-mail de contacto" value={familyForm.contact_email || ''} onChangeText={(v) => setFamilyForm((p: any) => ({ ...p, contact_email: v }))} keyboardType="email-address" />
              <FormField label="Telefone" value={familyForm.contact_phone || ''} onChangeText={(v) => setFamilyForm((p: any) => ({ ...p, contact_phone: v }))} />
              <Text style={s.fieldLabel}>Idioma</Text>
              <View style={s.chipRow}>
                {(['pt', 'en'] as const).map((lang) => (
                  <TouchableOpacity key={lang} style={[s.chip, familyForm.language === lang && s.chipActive]} onPress={() => setFamilyForm((p: any) => ({ ...p, language: lang }))}>
                    <Text style={[s.chipText, familyForm.language === lang && s.chipTextActive]}>{lang === 'pt' ? 'Português' : 'English'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FormField label="Emoji" value={familyForm.emoji || ''} onChangeText={(v) => setFamilyForm((p: any) => ({ ...p, emoji: v }))} />
              <Text style={s.fieldLabel}>Logo</Text>
              <View style={s.logoRow}>
                <View style={s.logoBox}>
                  {logoSrc ? (
                    <Image source={{ uri: logoSrc }} style={s.logoImg} />
                  ) : (
                    <AppLogo size="sm" />
                  )}
                </View>
                <TouchableOpacity style={s.secondaryBtn} onPress={uploadLogo} disabled={logoUploading}><Text style={s.secondaryBtnText}>{logoUploading ? '…' : 'Enviar logo'}</Text></TouchableOpacity>
                {familyForm.logo_url ? <TouchableOpacity onPress={removeLogo}><Text style={s.linkDanger}>Remover</Text></TouchableOpacity> : null}
              </View>
              <PrimaryButton label="Salvar família" loading={savingFamily} onPress={saveFamily} />
            </View>
          )}

          {tab === 'users' && (
            <>
              <View style={s.actionRow}>
                <TouchableOpacity style={s.secondaryBtn} onPress={() => setRelModal({})}><Text style={s.secondaryBtnText}>+ Parente</Text></TouchableOpacity>
                <TouchableOpacity style={s.secondaryBtn} onPress={() => setUserModal({ kind: 'parent' })}><Text style={s.secondaryBtnText}>+ Responsável</Text></TouchableOpacity>
                <TouchableOpacity style={s.primaryBtnSmall} onPress={() => setChildModal({})}><Text style={s.primaryBtnSmallText}>+ Filho(a)</Text></TouchableOpacity>
              </View>
              <SectionTitle title="Responsáveis" />
              {parentsList.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  canEditAvatar={canEditMemberAvatar(m.id)}
                  onRefresh={() => loadAll(true)}
                  onEdit={() => setUserModal({ ...m, kind: 'parent' })}
                  onPassword={() => setPwModal({ id: m.id, name: m.name, isChildUser: false })}
                  onDelete={m.id !== familyForm.gestor_user_id ? () => deleteMember(m.id, m.name) : undefined}
                  subtitle={m.access_profile === 'auxiliar' ? 'Auxiliar' : 'Gestor'}
                />
              ))}
              <SectionTitle title="Parentes" />
              {relatives.map((r) => (
                <MemberRow
                  key={r.id}
                  member={r}
                  canEditAvatar={canEditMemberAvatar(r.id)}
                  onRefresh={() => loadAll(true)}
                  onEdit={() => setRelModal({ ...r, linked_child_ids: r.linked_child_ids || [] })}
                  onPassword={() => setPwModal({ id: r.id, name: r.name, isChildUser: false })}
                  onDelete={r.id !== familyForm.gestor_user_id ? () => deleteRelative(r.id, r.name) : undefined}
                  subtitle={r.relationship || 'Parente'}
                />
              ))}
              <SectionTitle title="Filhos" />
              {children.map((c) => (
                <View key={c.id} style={[s.memberCard, { borderTopColor: c.color || Colors.primary, borderTopWidth: 4 }]}>
                  <AvatarPicker currentAvatarUrl={c.avatar_url} currentPreset={c.avatar_preset} name={c.name} endpoint={`/auth/avatar/child/${c.id}`} size={56} onSave={() => loadAll(true)} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</Text>
                    <Text style={s.memberMeta}>{c.user_email || 'Sem login'} · Nível {c.level ?? 1}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => setChildModal(c)}><Text style={s.link}>Editar</Text></TouchableOpacity>
                    <TouchableOpacity disabled={!c.user_id} onPress={() => setPwModal({ id: c.user_id, childId: c.id, name: c.name, isChildUser: true })}><Text style={[s.link, !c.user_id && { opacity: 0.4 }]}>Senha</Text></TouchableOpacity>
                    {c.user_id !== familyForm.gestor_user_id && (
                      <TouchableOpacity onPress={() => deleteChild(c.id, c.name)}><Text style={s.linkDanger}>Excluir</Text></TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'profiles' && PROFILE_INFO.map((p) => (
            <View key={p.key} style={s.card}><Text style={s.cardTitle}>{p.title}</Text><Text style={s.bodyText}>{p.body}</Text></View>
          ))}

          {tab === 'appearance' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Aparência</Text>
              <Text style={s.bodyText}>Cores principais usadas no app e calendário.</Text>
              <ColorPickerRow label="Cor primária" value={familyForm.primary_color} onChange={(c) => setFamilyForm((p: any) => ({ ...p, primary_color: c }))} />
              <ColorPickerRow label="Cor secundária" value={familyForm.secondary_color} onChange={(c) => setFamilyForm((p: any) => ({ ...p, secondary_color: c }))} />
              <View style={[s.preview, { backgroundColor: `${familyForm.primary_color || '#6C5CE7'}22` }]}>
                <Text style={s.previewText}>{familyForm.emoji || '🏠'} {familyForm.name}</Text>
              </View>
              <PrimaryButton label="Salvar aparência" loading={savingFamily} onPress={saveFamily} />
            </View>
          )}

          {tab === 'medals' && (
            <>
              <TouchableOpacity style={s.primaryBtnSmall} onPress={() => setMedalModal({ icon: '🏅', is_active: true, requirement_type: 'task_count', requirement_value: 5, medal_group: 'routine' })}>
                <Text style={s.primaryBtnSmallText}>+ Nova medalha</Text>
              </TouchableOpacity>
              {displayMedals.map((m) => (
                <View key={m.id} style={[s.card, { borderTopColor: m.color || Colors.primary, borderTopWidth: 4 }]}>
                  <Text style={{ fontSize: 32, textAlign: 'center' }}>{m.icon || '🏅'}</Text>
                  <Text style={[s.cardTitle, { textAlign: 'center' }]}>{m.name}</Text>
                  {!!m.description && <Text style={[s.bodyText, { textAlign: 'center' }]}>{m.description}</Text>}
                  {m.family_id ? (
                    <View style={s.actionRow}>
                      <TouchableOpacity onPress={() => setMedalModal({ ...m, is_active: m.is_active !== 0 && m.is_active !== false })}><Text style={s.link}>Editar</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMedal(m.id)}><Text style={s.linkDanger}>Excluir</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={s.secondaryBtn} onPress={() => setMedalModal(openMedalFromTemplate(m))}><Text style={s.secondaryBtnText}>Copiar para família</Text></TouchableOpacity>
                  )}
                </View>
              ))}
            </>
          )}

          {tab === 'modules' && (
            <>
              <Text style={s.bodyText}>Ative ou desative funcionalidades para toda a família.</Text>
              {(moduleSettings?.modules ?? []).map((mod) => {
                const meta = MODULE_LABELS[mod.module_key] ?? { title: mod.module_key, desc: '' };
                const busy = savingModule === mod.module_key;
                return (
                  <View key={mod.module_key} style={[s.card, mod.is_enabled && s.cardOn]}>
                    <View style={s.moduleHead}>
                      <Text style={{ fontSize: 24 }}>{MODULE_ICONS[mod.module_key] || '📦'}</Text>
                      <View style={{ flex: 1 }}><Text style={s.cardTitle}>{meta.title}</Text><Text style={s.memberMeta}>{mod.is_premium ? 'Premium' : 'Gratuito'}</Text></View>
                      {busy ? <ActivityIndicator color={Colors.primary} /> : <Switch value={mod.is_enabled} onValueChange={(v) => patchModule(mod.module_key, v)} />}
                    </View>
                    <Text style={s.bodyText}>{meta.desc}</Text>
                  </View>
                );
              })}
            </>
          )}

          {tab === 'security' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Segurança</Text>
              {SECURITY_ITEMS.map((item) => (<Text key={item} style={s.listItem}>• {item}</Text>))}
            </View>
          )}

          {tab === 'reset_data' && (
            <View style={[s.card, s.cardRisk]}>
              <Text style={[s.cardTitle, { color: Colors.danger }]}>Limpar dados operacionais</Text>
              <Text style={s.bodyText}>Remove tarefas, mesada, calendário, saúde, etc. Mantém utilizadores e assinatura.</Text>
              <Text style={s.fieldLabel}>Será removido</Text>
              {RESET_REMOVED.map((x) => <Text key={x} style={s.listItem}>• {x}</Text>)}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Será mantido</Text>
              {RESET_KEPT.map((x) => <Text key={x} style={s.listItem}>• {x}</Text>)}
              <FormField label={`Digite ${RESET_PHRASE}`} value={resetPhrase} onChangeText={setResetPhrase} />
              <TouchableOpacity style={s.dangerBtn} onPress={executeReset} disabled={resetLoading}>
                {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.dangerBtnText}>Limpar dados da família</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      <PasswordResetModal visible={!!pwModal} target={pwModal} onClose={() => setPwModal(null)} onSaved={() => loadAll(true)} />
      <GuardianModal visible={!!userModal} initial={userModal || {}} onClose={() => setUserModal(null)} onSaved={() => { loadAll(true); refreshProfile(); }} familyPrimary={familyForm.primary_color} familySecondary={familyForm.secondary_color} adultMembers={adultMembers} />
      <ChildAdminModal visible={!!childModal} initial={childModal || {}} onClose={() => setChildModal(null)} onSaved={() => loadAll(true)} />
      <RelativeAdminModal visible={!!relModal} initial={relModal || {}} childrenList={children} onClose={() => setRelModal(null)} onSaved={() => loadAll(true)} familyPrimary={familyForm.primary_color} familySecondary={familyForm.secondary_color} adultMembers={adultMembers} />
      <MedalAdminModal visible={!!medalModal} initial={medalModal || {}} onClose={() => setMedalModal(null)} onSaved={() => loadAll(true)} />

    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

function MemberRow({ member, canEditAvatar, onRefresh, onEdit, onPassword, onDelete, subtitle }: any) {
  return (
    <View style={s.memberCard}>
      {canEditAvatar ? (
        <AvatarPicker currentAvatarUrl={member.avatar_url} currentPreset={member.avatar_preset} name={member.name} endpoint={`/families/members/${member.id}/avatar`} size={48} onSave={onRefresh} />
      ) : (
        <UserAvatar avatarUrl={member.avatar_url} avatarPreset={member.avatar_preset} name={member.name} size={48} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.memberName}>{member.name}</Text>
        <Text style={s.memberMeta}>{member.email || '—'} · {subtitle}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TouchableOpacity onPress={onEdit}><Text style={s.link}>Editar</Text></TouchableOpacity>
        <TouchableOpacity onPress={onPassword}><Text style={s.link}>Senha</Text></TouchableOpacity>
        {onDelete && <TouchableOpacity onPress={onDelete}><Text style={s.linkDanger}>Excluir</Text></TouchableOpacity>}
      </View>
    </View>
  );
}

function FormField({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: 'default' | 'email-address' }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} />
    </View>
  );
}

function ColorPickerRow({ label, value, onChange }: { label: string; value?: string; onChange: (c: string) => void }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.chipRow}>
        {COLOR_PRESETS.map((c) => (
          <TouchableOpacity key={c} onPress={() => onChange(c)} style={[s.colorDot, { backgroundColor: c, borderWidth: value === c ? 3 : 0, borderColor: Colors.text }]} />
        ))}
      </View>
      <TextInput style={s.input} value={value || ''} onChangeText={onChange} />
    </View>
  );
}

function PrimaryButton({ label, loading, onPress }: { label: string; loading?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.primaryBtn} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 8, gap: 8 },
  backBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  backBtnText: { fontSize: 24, color: Colors.primary, fontWeight: 'bold', marginTop: -4 },
  title: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  billingLink: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', marginTop: 4 },
  tabScroll: { maxHeight: 48 },
  tabRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive: { backgroundColor: Colors.primaryLighter, borderColor: Colors.primary },
  tabBtnRisk: { borderColor: Colors.danger },
  tabText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primaryDark },
  tabTextRisk: { color: Colors.danger },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 110, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardOn: { borderColor: Colors.primary },
  cardRisk: { borderColor: Colors.danger },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  bodyText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginTop: 4, marginBottom: 4 },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.bg, fontSize: FontSize.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  chipText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.primaryDark },
  colorDot: { width: 32, height: 32, borderRadius: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  logoBox: { width: 72, height: 72, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: Colors.bg },
  logoImg: { width: 72, height: 72 },
  preview: { borderRadius: Radii.md, padding: 16, marginVertical: 8 },
  previewText: { fontWeight: '800', color: Colors.text },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 12, borderWidth: 1, borderColor: Colors.border },
  memberName: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  memberMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  link: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.xs },
  linkDanger: { color: Colors.danger, fontWeight: '700', fontSize: FontSize.xs },
  listItem: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: Colors.white, fontWeight: '800' },
  primaryBtnSmall: { alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: Radii.md, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  primaryBtnSmallText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
  secondaryBtn: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.md, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryBtnText: { color: Colors.text, fontWeight: '700', fontSize: FontSize.xs },
  dangerBtn: { backgroundColor: Colors.danger, borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  dangerBtnText: { color: Colors.white, fontWeight: '800' },
  moduleHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
