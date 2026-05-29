import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import api from '../../src/services/api';

const NOTICE_TYPES = [
  { id: 'notice', label: '📢 Aviso' },
  { id: 'reminder', label: '⏰ Lembrete' },
  { id: 'memo', label: '🗒️ Memo' },
  { id: 'alert', label: '🚨 Alerta' },
  { id: 'quick_task', label: '⚡ Tarefa Rápida' },
];

const PRIORITIES = [
  { id: 'low', label: 'Baixa 🟢' },
  { id: 'normal', label: 'Normal 🔵' },
  { id: 'high', label: 'Alta 🟡' },
  { id: 'urgent', label: 'Urgente 🔴' },
];

const AUDIENCES = [
  { id: 'all', label: 'Todos' },
  { id: 'parents', label: 'Pais' },
  { id: 'child', label: 'Filhos' },
  { id: 'relative', label: 'Parentes' },
  { id: 'selected', label: 'Selecionar...' },
];

export default function ParentMuralScreen() {
  const router = useRouter();
  const { family, user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [notices, setNotices] = useState<any[]>([]);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterType, setFilterType] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');

  // Dados da Família (para audiência selecionada)
  const [familyData, setFamilyData] = useState<any>(null);

  // Modal
  const [showModal, setShowModal] = useState<boolean>(false);
  const [form, setForm] = useState<any>({
    id: null,
    title: '',
    description: '',
    type: 'notice',
    priority: 'normal',
    target_type: 'all',
    target_user_ids: [],
    target_child_ids: [],
    start_datetime: '',
    due_datetime: '',
    is_recurring: false,
    recurrence_rule: '',
    is_pinned: false,
    requires_read_confirmation: false,
    status: 'active',
  });

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const params: any = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.type = filterType;
      if (filterPriority) params.priority = filterPriority;

      const [rNotices, rFamily] = await Promise.all([
        api.get('/mural/notices', { params }),
        api.get('/families').catch(() => ({ data: null })),
      ]);

      const sorted = [...(rNotices?.data || [])].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      setNotices(sorted);
      setFamilyData(rFamily?.data || null);
    } catch (err) {
      console.error('[ParentMural] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterStatus, filterType, filterPriority]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Salvar aviso
  const handleSaveNotice = async () => {
    if (!form.title.trim()) {
      Alert.alert('Erro', 'Informe o título do recado.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        title: form.title,
        description: form.description || null,
        type: form.type,
        priority: form.priority,
        target_type: form.target_type,
        target_user_ids: form.target_user_ids || [],
        target_child_ids: form.target_child_ids || [],
        start_datetime: form.start_datetime || null,
        due_datetime: form.due_datetime || null,
        is_recurring: !!form.is_recurring,
        recurrence_rule: form.recurrence_rule || null,
        is_pinned: !!form.is_pinned,
        requires_read_confirmation: !!form.requires_read_confirmation,
        status: form.status || 'active',
      };

      if (form.id) {
        await api.put(`/mural/notices/${form.id}`, payload);
        Alert.alert('Sucesso', 'Recado atualizado com sucesso!');
      } else {
        await api.post('/mural/notices', payload);
        Alert.alert('Sucesso', 'Comunicado publicado no mural!');
      }

      setShowModal(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o comunicado.');
    } finally {
      setLoading(false);
    }
  };

  // Arquivar aviso
  const handleArchive = async (id: string) => {
    Alert.alert('Arquivar Recado', 'Deseja arquivar este aviso do mural?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Arquivar',
        onPress: async () => {
          try {
            setLoading(true);
            await api.post(`/mural/notices/${id}/archive`);
            Alert.alert('Sucesso', 'Recado arquivado.');
            loadData(true);
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Erro ao arquivar.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // Deletar aviso
  const handleDelete = async (id: string) => {
    Alert.alert('Excluir Recado', 'Tem certeza que deseja excluir permanentemente este aviso?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await api.delete(`/mural/notices/${id}`);
            Alert.alert('Sucesso', 'Recado excluído do mural.');
            loadData(true);
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Erro ao excluir.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // Listagem de Membros
  const members = familyData?.members || [];
  const childrenList = familyData?.children || [];

  const toggleChildTarget = (cid: string) => {
    setForm((f: any) => {
      const set = new Set(f.target_child_ids || []);
      if (set.has(cid)) set.delete(cid);
      else set.add(cid);
      return { ...f, target_child_ids: [...set] };
    });
  };

  const toggleUserTarget = (uid: string) => {
    setForm((f: any) => {
      const set = new Set(f.target_user_ids || []);
      if (set.has(uid)) set.delete(uid);
      else set.add(uid);
      return { ...f, target_user_ids: [...set] };
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header padronizado */}
      <ModuleHeader
        title="Gestão do Mural"
        emoji="📌"
        subtitle="Gerencie comunicados e recados familiares"
        onBack={() => router.back()}
        right={(
          <TouchableOpacity
            style={styles.btnAdd}
            onPress={() => {
              setForm({
                id: null,
                title: '',
                description: '',
                type: 'notice',
                priority: 'normal',
                target_type: 'all',
                target_user_ids: [],
                target_child_ids: [],
                start_datetime: '',
                due_datetime: '',
                is_recurring: false,
                recurrence_rule: '',
                is_pinned: false,
                requires_read_confirmation: false,
                status: 'active',
              });
              setShowModal(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.btnAddText}>+ Recado</Text>
          </TouchableOpacity>
        )}
      />

      {/* Filtros */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {/* Status */}
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'active' && styles.filterChipActive]}
            onPress={() => setFilterStatus('active')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'active' && styles.filterChipTextActive]}>Ativos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'completed' && styles.filterChipActive]}
            onPress={() => setFilterStatus('completed')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'completed' && styles.filterChipTextActive]}>Concluídos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'archived' && styles.filterChipActive]}
            onPress={() => setFilterStatus('archived')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'archived' && styles.filterChipTextActive]}>Arquivados</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Tipos */}
          <TouchableOpacity
            style={[styles.filterChip, filterType === '' && styles.filterChipActive]}
            onPress={() => setFilterType('')}
          >
            <Text style={[styles.filterChipText, filterType === '' && styles.filterChipTextActive]}>Todos Tipos</Text>
          </TouchableOpacity>
          {NOTICE_TYPES.map((nt) => (
            <TouchableOpacity
              key={nt.id}
              style={[styles.filterChip, filterType === nt.id && styles.filterChipActive]}
              onPress={() => setFilterType(nt.id)}
            >
              <Text style={[styles.filterChipText, filterType === nt.id && styles.filterChipTextActive]}>{nt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>Carregando mural de recados...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F59E0B']} />
          }
        >
          {notices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTextTitle}>Nenhum recado encontrado</Text>
              <Text style={styles.emptyTextSub}>Publique novos comunicados clicando em "+ Recado" no topo.</Text>
            </View>
          ) : (
            notices.map((n) => {
              const isUrgent = n.priority === 'urgent';
              const isHigh = n.priority === 'high';
              const cardBorderColor = isUrgent ? '#E17055' : isHigh ? '#FDCB6E' : Colors.border;

              return (
                <Card key={n.id} style={[styles.muralCard, { borderLeftColor: cardBorderColor }]}>
                  <View style={styles.flexRowBetween}>
                    <View style={styles.badgeRow}>
                      {n.is_pinned ? <Badge label="Fixado 📌" variant="warning" /> : null}
                      <Badge label={NOTICE_TYPES.find(t => t.id === n.type)?.label || n.type} variant="primary" />
                      <Badge label={n.priority === 'urgent' ? 'Urgente' : n.priority === 'high' ? 'Alta' : 'Normal'} variant="ghost" />
                    </View>
                    <Text style={styles.cardMetaText}>
                      {n.due_datetime ? `Vence: ${new Date(n.due_datetime).toLocaleDateString('pt-BR')}` : ''}
                    </Text>
                  </View>

                  <Text style={styles.cardTitle}>{n.title}</Text>
                  {n.description ? <Text style={styles.cardDesc}>{n.description}</Text> : null}
                  <Text style={styles.cardAuthor}>✍️ Autor: {n.author_name || 'Pais'}</Text>

                  {n.requires_read_confirmation && (
                    <View style={styles.readConfirmationSummary}>
                      <Text style={styles.readText}>📣 Confirmação Exigida</Text>
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.btnAction}
                      onPress={() => {
                        setForm({
                          id: n.id,
                          title: n.title,
                          description: n.description || '',
                          type: n.type,
                          priority: n.priority,
                          target_type: n.target_type,
                          target_user_ids: n.target_user_ids || [],
                          target_child_ids: n.target_child_ids || [],
                          start_datetime: n.start_datetime ? n.start_datetime.split('T')[0] : '',
                          due_datetime: n.due_datetime ? n.due_datetime.split('T')[0] : '',
                          is_recurring: !!n.is_recurring,
                          recurrence_rule: n.recurrence_rule || '',
                          is_pinned: !!n.is_pinned,
                          requires_read_confirmation: !!n.requires_read_confirmation,
                          status: n.status || 'active',
                        });
                        setShowModal(true);
                      }}
                    >
                      <Text style={styles.btnActionText}>✏️ Editar</Text>
                    </TouchableOpacity>
                    {n.status === 'active' && (
                      <TouchableOpacity style={styles.btnAction} onPress={() => handleArchive(n.id)}>
                        <Text style={styles.btnActionText}>📥 Arquivar</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.btnAction, { borderColor: Colors.danger + '33' }]} onPress={() => handleDelete(n.id)}>
                      <Text style={[styles.btnActionText, { color: Colors.danger }]}>🗑️ Excluir</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* MODAL: NOVO/EDITAR AVISO */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.id ? '✏️ Editar Recado' : '📢 Publicar no Mural'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Título do Comunicado *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Hora de dormir mais cedo hoje"
                value={form.title}
                onChangeText={(text) => setForm((p: any) => ({ ...p, title: text }))}
              />

              <Text style={styles.formLabel}>Descrição do Aviso</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Amanhã teremos que sair às 7h."
                value={form.description}
                onChangeText={(text) => setForm((p: any) => ({ ...p, description: text }))}
                multiline
              />

              <Text style={styles.formLabel}>Tipo *</Text>
              <View style={styles.chipsRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {NOTICE_TYPES.map((nt) => {
                    const active = form.type === nt.id;
                    return (
                      <TouchableOpacity
                        key={nt.id}
                        style={[styles.selectorChip, active && styles.selectorChipActive]}
                        onPress={() => setForm((p: any) => ({ ...p, type: nt.id }))}
                      >
                        <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>{nt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.formLabel}>Prioridade *</Text>
              <View style={styles.buttonGroup}>
                {PRIORITIES.map((pr) => {
                  const active = form.priority === pr.id;
                  return (
                    <TouchableOpacity
                      key={pr.id}
                      style={[styles.groupButton, active && styles.groupButtonActive]}
                      onPress={() => setForm((p: any) => ({ ...p, priority: pr.id }))}
                    >
                      <Text style={[styles.groupButtonText, active && styles.groupButtonTextActive]}>{pr.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Destinatários (Audiência) *</Text>
              <View style={styles.chipsRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {AUDIENCES.map((aud) => {
                    const active = form.target_type === aud.id;
                    return (
                      <TouchableOpacity
                        key={aud.id}
                        style={[styles.selectorChip, active && styles.selectorChipActive]}
                        onPress={() => setForm((p: any) => ({ ...p, target_type: aud.id }))}
                      >
                        <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>{aud.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Destinatários Individuais Selecionados */}
              {form.target_type === 'selected' && (
                <View style={styles.selectionBlock}>
                  <Text style={styles.selectionSubLabel}>Filhos:</Text>
                  <View style={styles.targetGrid}>
                    {childrenList.map((c: any) => {
                      const active = (form.target_child_ids || []).includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.selectorChip, active && styles.selectorChipActive]}
                          onPress={() => toggleChildTarget(c.id)}
                        >
                          <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>👦 {c.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.selectionSubLabel, { marginTop: 8 }]}>Outros Usuários:</Text>
                  <View style={styles.targetGrid}>
                    {members.filter((m: any) => m.id !== user?.id).map((m: any) => {
                      const active = (form.target_user_ids || []).includes(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.selectorChip, active && styles.selectorChipActive]}
                          onPress={() => toggleUserTarget(m.id)}
                        >
                          <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>👤 {m.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Validade / Limite Data</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 2026-06-30"
                    value={form.due_datetime}
                    onChangeText={(text) => setForm((p: any) => ({ ...p, due_datetime: text }))}
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Fixar no Topo do Mural? 📌</Text>
                <Switch
                  value={!!form.is_pinned}
                  onValueChange={(val) => setForm((p: any) => ({ ...p, is_pinned: val }))}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Exigir Confirmação de Leitura? 📣</Text>
                <Switch
                  value={!!form.requires_read_confirmation}
                  onValueChange={(val) => setForm((p: any) => ({ ...p, requires_read_confirmation: val }))}
                />
              </View>

              <TouchableOpacity style={styles.btnSubmit} onPress={handleSaveNotice}>
                <Text style={styles.btnSubmitText}>Publicar Comunicado 🚀</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: Colors.bg },
  btnAdd:    { backgroundColor: '#F59E0B', borderRadius: Radii.full, paddingVertical: 8, paddingHorizontal: 14, ...Shadow.sm },
  btnAddText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800' },

  filterBar: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border },
  filterChip: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.full, paddingVertical: 6, paddingHorizontal: 12, justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#F59E0B12', borderColor: '#F59E0B' },
  filterChipText:   { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: '#D97706', fontWeight: '800' },
  divider:   { width: 1, backgroundColor: Colors.border, marginHorizontal: 4 },

  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 110 },
  centerContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },

  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  emptyState: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  emptyTextTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  emptyTextSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },

  // Notice Cards
  muralCard: { padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: Colors.border },
  flexRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700' },
  cardTitle: { fontSize: FontSize.base - 1, fontWeight: '900', color: Colors.text, marginBottom: 6 },
  cardDesc:  { fontSize: FontSize.xs + 1, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  cardAuthor: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 10 },
  readConfirmationSummary: { backgroundColor: '#f3f4f6', borderRadius: Radii.sm, paddingVertical: 4, paddingHorizontal: 8, alignSelf: 'flex-start', marginBottom: 8 },
  readText: { fontSize: 9, fontWeight: '800', color: Colors.textSecondary },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  btnAction: { flex: 1, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  btnActionText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  // Modais
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:   { fontSize: FontSize.base, fontWeight: '900', color: Colors.text },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLighter, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { fontSize: 14, color: Colors.primary, fontWeight: 'bold' },
  modalBody:    { paddingTop: 12 },
  formLabel:    { fontSize: FontSize.xs, fontWeight: '800', color: Colors.text, marginBottom: 6, marginTop: 8 },
  selectorChip: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.full, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 4 },
  selectorChipActive: { backgroundColor: '#F59E0B12', borderColor: '#F59E0B' },
  selectorChipText:   { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },
  selectorChipTextActive: { color: '#D97706', fontWeight: '800' },
  chipsRow: { flexDirection: 'row', marginBottom: 6 },

  buttonGroup: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  groupButton: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.md, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.bg },
  groupButtonActive: { borderColor: '#F59E0B', backgroundColor: '#F59E0B12' },
  groupButtonText: { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },
  groupButtonTextActive: { color: '#D97706', fontWeight: '800' },

  selectionBlock: { backgroundColor: '#f9fafb', borderRadius: Radii.md, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: Colors.border },
  selectionSubLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.md, padding: 10, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.bg, marginBottom: 8 },
  textarea: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.md, padding: 10, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.bg, marginBottom: 8, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 10 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  switchLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },

  btnSubmit: { backgroundColor: '#F59E0B', borderRadius: Radii.full, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', ...Shadow.btn, marginTop: 16, marginBottom: 30 },
  btnSubmitText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
});
