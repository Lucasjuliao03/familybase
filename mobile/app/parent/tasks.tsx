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
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { CategoryFilter } from '../../src/components/ui/CategoryFilter';
import { TaskCard } from '../../src/components/ui/TaskCard';
import { FAB } from '../../src/components/ui/FAB';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import { ModuleTabs } from '../../src/components/ui/ModuleTabs';
import api from '../../src/services/api';

const CATEGORIES = [
  { id: 'all', label: 'Todas', icon: '🗂️' },
  { id: 'Organização', label: 'Organização', icon: '🧹' },
  { id: 'Estudos', label: 'Estudos', icon: '📚' },
  { id: 'Saúde', label: 'Saúde', icon: '❤️' },
  { id: 'Exercícios', label: 'Exercícios', icon: '🏃' },
  { id: 'Outras', label: 'Outras', icon: '🏠' },
];

const WEEKDAYS = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  category: string;
  points: number;
  coins: number;
  frequency: string;
  recurrence_days?: string;
  child_id?: string;
  assignee_user_id?: string;
  status: string;
  requires_approval: boolean;
  affects_allowance: boolean;
  bonus_amount?: number;
  discount_amount?: number;
  due_time?: string;
  icon?: string;
}

interface TaskOccurrence {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  category: string;
  points: number;
  status: string;
  occurrence_date: string;
  child_id: string;
  child_name?: string;
  child_color?: string;
  discount_amount?: number;
  rejection_reason?: string;
  is_recurring?: boolean;
  due_time?: string;
  icon?: string;
}

export default function TasksScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'occurrences' | 'approvals' | 'templates' | 'not_completed'>('occurrences');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedChildId, setSelectedChildId] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [children, setChildren] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<TaskOccurrence[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);

  // Estado do Modal de Criar/Editar
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskTemplate | null>(null);

  // Campos do Formulário
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Organização');
  const [formPoints, setFormPoints] = useState('10');
  const [formRecipient, setFormRecipient] = useState(''); // 'c:child_id' ou 'u:user_id'
  const [formFrequency, setFormFrequency] = useState('daily');
  const [formRecurrenceDays, setFormRecurrenceDays] = useState<number[]>([]);
  const [formRequiresApproval, setFormRequiresApproval] = useState(true);
  const [formAffectsAllowance, setFormAffectsAllowance] = useState(false);
  const [formBonusAmount, setFormBonusAmount] = useState('0');
  const [formDiscountAmount, setFormDiscountAmount] = useState('0');
  const [formDueTime, setFormDueTime] = useState('20:00');
  const [formIcon, setFormIcon] = useState('🧹');

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      // 7 dias atrás para histórico de não concluídas
      const past = new Date();
      past.setDate(past.getDate() - 7);
      const fromStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      const [resChildren, resOccurrences, resHistorical, resTemplates] = await Promise.all([
        api.get('/families/children'),
        api.get('/tasks/occurrences', { params: { date: todayStr } }),
        api.get('/tasks/occurrences', { params: { from: fromStr, to: yesterdayStr } }),
        api.get('/tasks'),
      ]);

      const todayOccs = resOccurrences?.data || [];
      const histOccs = (resHistorical?.data || []).filter(
        (o: any) => o.status === 'rejected' || o.status === 'not_completed'
      );

      // Juntar sem duplicatas (hoje tem prioridade)
      const seen = new Set(todayOccs.map((o: any) => o.id));
      const merged = [...todayOccs, ...histOccs.filter((o: any) => !seen.has(o.id))];

      setChildren(resChildren?.data || []);
      setOccurrences(merged);
      setTemplates(resTemplates?.data || []);
    } catch (err) {
      console.error('[ParentTasks] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [todayStr]);


  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Ações de Aprovação
  const handleApproveOccurrence = async (occId: string, approved: boolean) => {
    try {
      await api.put(`/tasks/occurrences/${occId}/approve`, { approved });
      Alert.alert(approved ? 'Tarefa Aprovada!' : 'Tarefa Rejeitada!');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível processar a aprovação.');
    }
  };

  // Alternar modelo de tarefa ativo/inativo
  const handleToggleTemplate = async (task: TaskTemplate, active: boolean) => {
    try {
      await api.put(`/tasks/${task.id}`, { status: active ? 'active' : 'inactive' });
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível alterar o status da tarefa.');
    }
  };

  // Abrir Modal de Criação
  const openCreateModal = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormCategory('Organização');
    setFormPoints('10');
    setFormRecipient(children.length > 0 ? `c:${children[0].id}` : '');
    setFormFrequency('daily');
    setFormRecurrenceDays([]);
    setFormRequiresApproval(true);
    setFormAffectsAllowance(false);
    setFormBonusAmount('0');
    setFormDiscountAmount('0');
    setFormDueTime('20:00');
    setFormIcon('🧹');
    setModalVisible(true);
  };

  // Abrir Modal de Edição
  const openEditModal = (task: TaskTemplate) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormCategory(task.category);
    setFormPoints(String(task.points));
    
    const rk = task.child_id ? `c:${task.child_id}` : task.assignee_user_id ? `u:${task.assignee_user_id}` : '';
    setFormRecipient(rk);
    setFormFrequency(task.frequency);
    
    const days = task.recurrence_days ? task.recurrence_days.split(',').map(Number) : [];
    setFormRecurrenceDays(days);
    
    setFormRequiresApproval(!!task.requires_approval);
    setFormAffectsAllowance(!!task.affects_allowance);
    setFormBonusAmount(String(task.bonus_amount || '0'));
    setFormDiscountAmount(String(task.discount_amount || '0'));
    setFormDueTime(task.due_time ? task.due_time.slice(0, 5) : '20:00');
    setFormIcon(task.icon || '🧹');
    setModalVisible(true);
  };

  // Alternar dia da semana no formulário
  const toggleWeekday = (day: number) => {
    setFormRecurrenceDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  // Submeter formulário
  const handleSubmitTask = async () => {
    if (!formTitle.trim()) {
      Alert.alert('Erro', 'O título da tarefa é obrigatório.');
      return;
    }

    if (!formIcon) {
      Alert.alert('Erro', 'Selecione um ícone para a tarefa.');
      return;
    }

    if (!formDueTime.trim()) {
      Alert.alert('Erro', 'O horário limite é obrigatório.');
      return;
    }

    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(formDueTime.trim())) {
      Alert.alert('Erro', 'O horário limite deve estar no formato de 24 horas HH:MM (ex: 18:30 ou 20:00).');
      return;
    }

    const m = /^([cu]):(.+)$/i.exec(formRecipient);
    const recipientUuid = m?.[2] || '';
    const recipientKind = m?.[1] || '';

    if (!recipientUuid) {
      Alert.alert('Erro', 'Selecione a criança ou responsável para esta tarefa.');
      return;
    }

    const payload: any = {
      title: formTitle,
      description: formDescription,
      category: formCategory,
      points: Number(formPoints) || 0,
      frequency: formFrequency,
      is_recurring: formFrequency !== 'once',
      recurrence_days: formRecurrenceDays.join(','),
      requires_approval: formRequiresApproval,
      affects_allowance: formAffectsAllowance,
      start_date: todayStr,
      due_time: formDueTime.trim(),
      icon: formIcon,
      allowance_rule: formAffectsAllowance
        ? {
            affects_allowance: true,
            bonus_amount: Number(formBonusAmount) || 0,
            discount_amount: Number(formDiscountAmount) || 0,
          }
        : { affects_allowance: false },
    };

    if (recipientKind === 'c') {
      payload.child_id = recipientUuid;
      payload.assignee_user_id = null;
    } else {
      payload.assignee_user_id = recipientUuid;
      payload.child_id = null;
    }

    try {
      if (editingTask?.id) {
        await api.put(`/tasks/${editingTask.id}`, payload);
        Alert.alert('Sucesso', 'Tarefa atualizada com sucesso!');
      } else {
        await api.post('/tasks', payload);
        Alert.alert('Sucesso', 'Tarefa criada com sucesso!');
      }
      setModalVisible(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Ocorreu um erro ao salvar a tarefa.');
    }
  };

  // Filtros aplicados
  const filteredOccurrences = useMemo(() => {
    return occurrences.filter(occ => {
      const matchCat = selectedCategory === 'all' || occ.category === selectedCategory;
      const matchChild = !selectedChildId || occ.child_id === selectedChildId;
      return matchCat && matchChild;
    });
  }, [occurrences, selectedCategory, selectedChildId]);

  const filteredApprovals = useMemo(() => {
    return occurrences.filter(occ => {
      const isPendingApprove = occ.status === 'waiting_approval';
      const matchCat = selectedCategory === 'all' || occ.category === selectedCategory;
      const matchChild = !selectedChildId || occ.child_id === selectedChildId;
      return isPendingApprove && matchCat && matchChild;
    });
  }, [occurrences, selectedCategory, selectedChildId]);

  const filteredNotCompleted = useMemo(() => {
    return occurrences.filter(occ => {
      const isNC = occ.status === 'not_completed' || occ.status === 'rejected';
      const matchCat = selectedCategory === 'all' || occ.category === selectedCategory;
      const matchChild = !selectedChildId || occ.child_id === selectedChildId;
      return isNC && matchCat && matchChild;
    });
  }, [occurrences, selectedCategory, selectedChildId]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(tpl => {
      const matchCat = selectedCategory === 'all' || tpl.category === selectedCategory;
      const matchChild = !selectedChildId || tpl.child_id === selectedChildId;
      return matchCat && matchChild;
    });
  }, [templates, selectedCategory, selectedChildId]);

  // Total de tarefas pendentes para barra de progresso do dia
  const progressPct = useMemo(() => {
    const total = occurrences.length;
    if (total === 0) return 100;
    const completed = occurrences.filter(o => o.status === 'approved' || o.status === 'completed').length;
    return Math.round((completed / total) * 100);
  }, [occurrences]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Carregando tarefas...</Text>
      </View>
    );
  }

  const approvalsCount = occurrences.filter(o => o.status === 'waiting_approval').length;
  const notCompletedCount = occurrences.filter(o => o.status === 'not_completed' || o.status === 'rejected').length;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header padronizado (igual aos demais módulos) */}
      <ModuleHeader
        title="Gerenciador de Tarefas"
        emoji="📋"
        subtitle="Acompanhe a rotina familiar diariamente"
        onBack={() => router.back()}
      />

      {/* Abas responsivas */}
      <ModuleTabs
        active={viewMode}
        onChange={(k) => setViewMode(k as any)}
        tabs={[
          { key: 'occurrences', label: 'Hoje', emoji: '📅' },
          { key: 'approvals', label: 'Aprovações', emoji: '⏳', count: approvalsCount },
          { key: 'not_completed', label: 'Não Feitas', emoji: '❌', count: notCompletedCount },
          { key: 'templates', label: 'Modelos', emoji: '🗂️' },
        ]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        {/* Barra de Progresso Diário (apenas no modo occurrences) */}
        {viewMode === 'occurrences' && (
          <Card style={styles.progressCard} shadow="sm">
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Progresso Familiar hoje</Text>
              <Badge label={`${progressPct}% Concluído`} variant={progressPct === 100 ? 'success' : 'blue'} />
            </View>
            <ProgressBar progress={progressPct} color={Colors.primary} bg={Colors.primaryLighter} height={8} style={{ marginTop: 12 }} />
          </Card>
        )}

        {/* Filtro por Criança */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Filtrar por Filho:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childFilters}>
            <TouchableOpacity
              style={[styles.childFilterBtn, !selectedChildId && styles.childFilterBtnActive]}
              onPress={() => setSelectedChildId('')}
            >
              <Text style={[styles.childFilterText, !selectedChildId && styles.childFilterTextActive]}>Todos</Text>
            </TouchableOpacity>
            {children.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.childFilterBtn, selectedChildId === c.id && styles.childFilterBtnActive, { borderColor: c.color || Colors.primary }]}
                onPress={() => setSelectedChildId(c.id)}
              >
                <Text style={[styles.childFilterText, selectedChildId === c.id && styles.childFilterTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Categorias */}
        <CategoryFilter categories={CATEGORIES} initialSelected="all" onSelect={(id) => setSelectedCategory(id)} />

        {/* Seção Principal de acordo com a aba ativa */}
        {viewMode === 'occurrences' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tarefas do Dia ({filteredOccurrences.length})</Text>
            {filteredOccurrences.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Sem tarefas listadas para hoje.</Text>
              </View>
            ) : (
              filteredOccurrences.map((occ) => {
                const child = children.find(c => c.id === occ.child_id);
                
                return (
                  <TaskCard
                    key={occ.id}
                    title={occ.title}
                    category={occ.category}
                    points={occ.points}
                    avatarUrl={child?.avatar_url}
                    avatarPreset={child?.avatar_preset}
                    avatarName={child?.name}
                    avatarBg={child?.color ? `${child.color}20` : '#DBEAFE'}
                    done={occ.status === 'approved' || occ.status === 'completed'}
                    categoryIcon={occ.icon || (occ.category === 'Estudos' ? '📚' : occ.category === 'Saúde' ? '❤️' : occ.category === 'Exercícios' ? '🏃' : '📋')}
                    dueTime={occ.due_time}
                    onToggle={() => {
                      if (occ.status === 'waiting_approval') {
                        handleApproveOccurrence(occ.id, true);
                      } else if (occ.status === 'pending' || occ.status === 'in_progress') {
                        // Responsável pode reprovar uma tarefa aberta ou aprová-la direto
                        Alert.alert(
                          'Ações da Tarefa',
                          'Escolha o que deseja fazer com esta ocorrência aberta:',
                          [
                            { text: 'Aprovar (Dar pontos)', onPress: () => handleApproveOccurrence(occ.id, true) },
                            { text: 'Reprovar', onPress: () => handleApproveOccurrence(occ.id, false) },
                            { text: 'Cancelar', style: 'cancel' }
                          ]
                        );
                      }
                    }}
                  />
                );
              })
            )}
          </View>
        )}

        {viewMode === 'approvals' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Aguardam Sua Aprovação ({filteredApprovals.length})</Text>
            {filteredApprovals.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nenhuma tarefa aguardando aprovação.</Text>
              </View>
            ) : (
              filteredApprovals.map((occ) => {
                const child = children.find(c => c.id === occ.child_id);

                return (
                  <View key={occ.id} style={styles.approvalCard}>
                    <View style={styles.approvalHeader}>
                      <Text style={styles.approvalTitle}>{occ.title}</Text>
                      <Text style={styles.approvalPoints}>⭐ {occ.points} pts</Text>
                    </View>
                    <Text style={styles.approvalChild}>Feita por: {occ.child_name || child?.name}</Text>
                    <View style={styles.approvalActions}>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => handleApproveOccurrence(occ.id, false)}>
                        <Text style={styles.rejectText}>Rejeitar ❌</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveOccurrence(occ.id, true)}>
                        <Text style={styles.approveText}>Aprovar ✅</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {viewMode === 'not_completed' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Não Concluídas ({filteredNotCompleted.length})</Text>
            {filteredNotCompleted.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>🎉 Nenhuma tarefa não concluída!</Text>
              </View>
            ) : (
              filteredNotCompleted.map(occ => {
                const child = children.find(c => c.id === occ.child_id);
                const discount = Number(occ.discount_amount) || 0;
                return (
                  <View key={occ.id} style={[styles.approvalCard, { borderColor: '#FECACA' }]}>
                    <View style={styles.approvalHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.approvalTitle}>{occ.title}</Text>
                        <Text style={styles.approvalChild}>
                          {occ.child_name || child?.name} · {occ.occurrence_date?.slice(0, 10)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#991B1B' }}>❌ NÃO FEITA</Text>
                        </View>
                        {discount > 0 && (
                          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>💸 -R${discount.toFixed(2)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {occ.rejection_reason ? (
                      <Text style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 4 }}>
                        {occ.rejection_reason}
                      </Text>
                    ) : null}
                    {occ.is_recurring ? (
                      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#6D28D9' }}>🔁 Recorrente</Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={[styles.approvalActions, { justifyContent: 'flex-start', marginTop: 10 }]}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveOccurrence(occ.id, true)}>
                        <Text style={styles.approveText}>Aprovar Mesmo Assim ✅</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {viewMode === 'templates' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Modelos de Tarefas ({filteredTemplates.length})</Text>
            {filteredTemplates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nenhum modelo cadastrado.</Text>
              </View>
            ) : (
              filteredTemplates.map((tpl) => {
                const child = children.find(c => c.id === tpl.child_id);
                return (
                  <Card key={tpl.id} style={styles.templateCard}>
                    <View style={styles.templateHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateTitle}>{tpl.icon || '📋'} {tpl.title}</Text>
                        <Text style={styles.templateMeta}>
                          {tpl.category} · {tpl.frequency === 'daily' ? 'Diária' : tpl.frequency === 'weekly' ? 'Semanal' : 'Única'}{tpl.due_time ? ` · Limite: ${tpl.due_time.slice(0, 5)}` : ''}
                        </Text>
                        {child && (
                          <Text style={[styles.templateMeta, { color: child.color || Colors.primary, fontWeight: '700' }]}>
                            Destinada a: {child.name}
                          </Text>
                        )}
                      </View>
                      <Switch
                        value={tpl.status === 'active'}
                        onValueChange={(val) => handleToggleTemplate(tpl, val)}
                        trackColor={{ false: '#CBD5E1', true: Colors.primaryLight }}
                        thumbColor={tpl.status === 'active' ? Colors.primary : '#F1F5F9'}
                      />
                    </View>
                    <View style={styles.templateFooter}>
                      <Text style={styles.templatePoints}>⭐ {tpl.points} pts</Text>
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(tpl)}>
                        <Text style={styles.editText}>Editar ✏️</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Criar Nova Tarefa FAB */}
      {viewMode === 'templates' && <FAB icon="+" onPress={openCreateModal} />}

      {/* Menu Inferior */}
      {/* Modal de Criação / Edição */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeaderTitle}>
              {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
            </Text>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* Título */}
              <Text style={styles.modalLabel}>Título</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Lavar a louça do almoço"
                placeholderTextColor="#94A3B8"
                value={formTitle}
                onChangeText={setFormTitle}
              />

              {/* Descrição */}
              <Text style={styles.modalLabel}>Descrição (Opcional)</Text>
              <TextInput
                style={[styles.modalInput, { height: 80 }]}
                placeholder="Explique como fazer..."
                placeholderTextColor="#94A3B8"
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
              />

              {/* Categoria */}
              <Text style={styles.modalLabel}>Categoria</Text>
              <View style={styles.selectRow}>
                {['Organização', 'Estudos', 'Saúde', 'Exercícios', 'Outras'].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.selectBtn, formCategory === cat && styles.selectBtnActive]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Text style={[styles.selectBtnText, formCategory === cat && styles.selectBtnTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Destinatário */}
              <Text style={styles.modalLabel}>Destinado a</Text>
              <View style={styles.selectRow}>
                {children.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectBtn, formRecipient === `c:${c.id}` && styles.selectBtnActive]}
                    onPress={() => setFormRecipient(`c:${c.id}`)}
                  >
                    <Text style={[styles.selectBtnText, formRecipient === `c:${c.id}` && styles.selectBtnTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Pontos */}
              <Text style={styles.modalLabel}>Pontos por Conclusão</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={formPoints}
                onChangeText={setFormPoints}
              />

              {/* Frequência */}
              <Text style={styles.modalLabel}>Frequência</Text>
              <View style={styles.selectRow}>
                {[
                  { label: 'Única', value: 'once' },
                  { label: 'Diária', value: 'daily' },
                  { label: 'Semanal', value: 'weekly' },
                ].map(freq => (
                  <TouchableOpacity
                    key={freq.value}
                    style={[styles.selectBtn, formFrequency === freq.value && styles.selectBtnActive]}
                    onPress={() => setFormFrequency(freq.value)}
                  >
                    <Text style={[styles.selectBtnText, formFrequency === freq.value && styles.selectBtnTextActive]}>
                      {freq.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dias de Recorrência (se Semanal) */}
              {formFrequency === 'weekly' && (
                <View>
                  <Text style={styles.modalLabel}>Dias da Semana</Text>
                  <View style={styles.weekdaysRow}>
                    {WEEKDAYS.map(day => {
                      const isSelected = formRecurrenceDays.includes(day.value);
                      return (
                        <TouchableOpacity
                          key={day.value}
                          style={[styles.weekdayBtn, isSelected && styles.weekdayBtnActive]}
                          onPress={() => toggleWeekday(day.value)}
                        >
                          <Text style={[styles.weekdayBtnText, isSelected && styles.weekdayBtnTextActive]}>
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Configurações Adicionais */}
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Requer Aprovação dos Pais</Text>
                <Switch
                  value={formRequiresApproval}
                  onValueChange={setFormRequiresApproval}
                  trackColor={{ false: '#CBD5E1', true: Colors.primaryLight }}
                  thumbColor={formRequiresApproval ? Colors.primary : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Gera Bônus de Mesada (R$)</Text>
                <Switch
                  value={formAffectsAllowance}
                  onValueChange={setFormAffectsAllowance}
                  trackColor={{ false: '#CBD5E1', true: Colors.primaryLight }}
                  thumbColor={formAffectsAllowance ? Colors.primary : '#F1F5F9'}
                />
              </View>

              {formAffectsAllowance && (
                <View>
                  <Text style={styles.modalLabel}>💰 Bônus ao Concluir (R$)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="decimal-pad"
                    placeholder="Ex: 2.00"
                    placeholderTextColor="#94A3B8"
                    value={formBonusAmount}
                    onChangeText={setFormBonusAmount}
                  />
                  <Text style={styles.modalLabel}>💸 Desconto se Não Concluir (R$)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="decimal-pad"
                    placeholder="Ex: 1.00"
                    placeholderTextColor="#94A3B8"
                    value={formDiscountAmount}
                    onChangeText={setFormDiscountAmount}
                  />
                  <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 4, marginBottom: 8 }}>
                    O desconto é aplicado automaticamente se a tarefa não for concluída no dia.
                  </Text>
                </View>
              )}

              {/* Horário Limite */}
              <Text style={styles.modalLabel}>Horário Limite (HH:MM)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: 20:00"
                placeholderTextColor="#94A3B8"
                value={formDueTime}
                onChangeText={setFormDueTime}
              />

              {/* Seleção de Ícone */}
              <Text style={styles.modalLabel}>Ícone da Tarefa</Text>
              <View style={styles.iconsContainer}>
                {['🧹', '📚', '🏃', '❤️', '🧼', '🐕', '🗑️', '🍽️', '🛏️', '🦷', '🌱', '🎒', '🍎', '🧸', '🚿', '💻'].map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.iconButton, formIcon === emoji && styles.iconButtonActive]}
                    onPress={() => setFormIcon(emoji)}
                  >
                    <Text style={styles.iconButtonText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSubmitTask}>
                <Text style={styles.modalSaveText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    marginTop: 12,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },
  progressCard: {
    padding: 14,
    marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: FontSize.sm + 1,
    fontWeight: '700',
    color: Colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: Colors.surface,
    padding: 10,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterLabel: {
    fontSize: FontSize.xs + 1,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginRight: 8,
  },
  childFilters: {
    gap: 6,
    flexDirection: 'row',
  },
  childFilterBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
  },
  childFilterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  childFilterText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  childFilterTextActive: {
    color: Colors.white,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Cards de aprovação
  approvalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    ...Shadow.sm,
  },
  approvalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  approvalTitle: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  approvalPoints: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
    marginLeft: 8,
  },
  approvalChild: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  approvalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  rejectBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: Radii.xs,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  rejectText: {
    color: Colors.danger,
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
  },
  approveBtn: {
    backgroundColor: Colors.greenLight,
    borderWidth: 1,
    borderColor: Colors.greenMid,
    borderRadius: Radii.xs,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  approveText: {
    color: Colors.green,
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
  },
  // Cards de modelos (templates)
  templateCard: {
    backgroundColor: Colors.surface,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  templateTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  templateMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  templateFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  templatePoints: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.primary,
  },
  editBtn: {
    backgroundColor: Colors.bg,
    borderRadius: Radii.xs,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  // Formulário do Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '85%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    padding: 20,
    ...Shadow.lg,
  },
  modalHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalForm: {
    flex: 1,
  },
  modalLabel: {
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.bg,
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  selectBtn: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  selectBtnTextActive: {
    color: Colors.white,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  weekdayBtn: {
    width: '13%',
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekdayBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  weekdayBtnText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  weekdayBtnTextActive: {
    color: Colors.white,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
    color: Colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    fontWeight: '800',
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
    ...Shadow.btn,
  },
  modalSaveText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontWeight: '800',
  },
  iconsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.sm,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  iconButtonText: {
    fontSize: FontSize.lg,
  },
});
