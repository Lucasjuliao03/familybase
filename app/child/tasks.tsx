import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import api from '../../src/services/api';
import { enrichOccurrencesStatus, minutesToDeadline } from '../../src/shared/lib/taskStatus';
import { taskIcon } from '../../src/lib/tasksHelpers';
// taskHistoryStatus not needed here — closure logic is handled by isAutoRejected()


const { width: SCREEN_W } = Dimensions.get('window');

// ─── Tab types ────────────────────────────────────────────────────────────────
type FilterTab = 'pending' | 'waiting' | 'done' | 'not_completed';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toLocalYMD(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDeadline(mins: number | null): string {
  if (mins === null) return '';
  if (mins < 0) return `${Math.abs(mins)} min atrás`;
  if (mins < 60) return `${mins} min restantes`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min restantes`;
}

// Detecta se uma ocorrência rejeitada foi auto-rejeitada (não concluída) vs reprovada pelo pai
function isAutoRejected(occ: any): boolean {
  const reason = (occ.rejection_reason || '').toLowerCase();
  return (
    reason.includes('prazo') ||
    reason.includes('não concluída') ||
    reason.includes('nao concluida') ||
    reason.includes('reprovação automática') ||
    reason.includes('reprovacao automatica') ||
    occ.status === 'not_completed'
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function getStatusBadgeProps(occ: any) {
  const s = occ.status;
  if (s === 'not_completed') return { label: '❌ NÃO FEITA', color: '#991B1B', bg: '#FEE2E2' };
  if (s === 'rejected' && isAutoRejected(occ)) return { label: '❌ NÃO FEITA', color: '#991B1B', bg: '#FEE2E2' };
  if (s === 'delayed' || occ.isDelayed) return { label: '⚠️ ATRASADA', color: Colors.danger, bg: '#FEE2E2' };
  if (s === 'waiting_approval') return { label: '⏳ AGUARDANDO', color: '#D97706', bg: '#FEF3C7' };
  if (s === 'approved') return { label: '✅ APROVADA', color: '#059669', bg: '#D1FAE5' };
  if (s === 'completed') return { label: '✅ FEITA', color: Colors.success, bg: '#D1FAE5' };
  if (s === 'rejected') return { label: '✕ REPROVADA', color: Colors.danger, bg: '#FEE2E2' };
  return { label: '⏰ PENDENTE', color: Colors.primary, bg: Colors.primaryLighter };
}

// ─── Tab count badge ─────────────────────────────────────────────────────────
function TabBadge({ count, color }: { count: number; color: string }) {
  if (count === 0) return null;
  return (
    <View style={[tbStyles.badge, { backgroundColor: color }]}>
      <Text style={tbStyles.badgeText}>{count}</Text>
    </View>
  );
}
const tbStyles = StyleSheet.create({
  badge: { borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChildTasksScreen() {
  const router = useRouter();
  const { childProfile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Tarefas de hoje
  const [occurrences, setOccurrences] = useState<any[]>([]);
  // Tarefas dos últimos 7 dias não concluídas (rejected/not_completed de dias anteriores)
  const [pastNotDone, setPastNotDone] = useState<any[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('pending');

  // Modal conclusão
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [selectedOcc, setSelectedOcc] = useState<any>(null);
  const [observationText, setObservationText] = useState('');

  // Modal sugestão
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestDescription, setSuggestDescription] = useState('');
  const [suggestType, setSuggestType] = useState('routine');
  const [suggestDueTime, setSuggestDueTime] = useState('');

  const todayStr = useMemo(() => toLocalYMD(), []);
  const now = useMemo(() => new Date(), []);

  // ─── Carregamento ──────────────────────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      await refreshProfile();

      // Data de 7 dias atrás para buscar histórico
      const past = new Date();
      past.setDate(past.getDate() - 7);
      const fromStr = toLocalYMD(past);
      // Ontem (para não duplicar com "hoje")
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = toLocalYMD(yesterday);

      // Carrega hoje E histórico de não concluídas em paralelo
      // O backend já chama closeExpiredTaskOccurrencesForFamily no GET,
      // então tarefas vencidas de ontem já serão marcadas como rejected automaticamente
      const [todayRes, histRes] = await Promise.all([
        api.get('/tasks/occurrences', { params: { date: todayStr } }),
        api.get('/tasks/occurrences', { params: { from: fromStr, to: yesterdayStr } }),
      ]);

      setOccurrences(todayRes?.data || []);

      // Do histórico, só mostra as que foram rejeitadas/não concluídas
      const hist = (histRes?.data || []).filter(
        (o: any) => o.status === 'rejected' || o.status === 'not_completed'
      );
      setPastNotDone(hist);
    } catch (err: any) {
      console.error('[ChildTasks] Erro:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [todayStr, refreshProfile]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, [loadData]);

  // ─── Enriquecer tarefas de hoje com status calculado ─────────────────────
  const enriched = useMemo(() => {
    return enrichOccurrencesStatus(occurrences, now).map((occ: any) => ({
      ...occ,
      _isToday: true,
    }));
  }, [occurrences, now]);

  // Tarefas de hoje marcadas como não concluídas (rejected + auto-rejected)
  const todayNotDone = useMemo(() =>
    enriched.filter((o: any) =>
      o.status === 'not_completed' ||
      (o.status === 'rejected' && isAutoRejected(o))
    ),
  [enriched]);

  // Todas as não concluídas: hoje + histórico dos últimos 7 dias
  const allNotDone = useMemo(() => {
    // Remover duplicatas pelo id
    const seen = new Set<string>();
    const combined = [...todayNotDone, ...pastNotDone];
    return combined.filter((o: any) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }).sort((a: any, b: any) => {
      // Mais recentes primeiro
      const da = a.occurrence_date || '';
      const db = b.occurrence_date || '';
      return db.localeCompare(da);
    });
  }, [todayNotDone, pastNotDone]);

  // Contagens para badges
  const counts = useMemo(() => ({
    pending: enriched.filter((o: any) => ['pending', 'in_progress', 'delayed'].includes(o.status)).length,
    waiting: enriched.filter((o: any) => o.status === 'waiting_approval').length,
    done: enriched.filter((o: any) => ['completed', 'approved'].includes(o.status)).length,
    not_completed: allNotDone.length,
  }), [enriched, allNotDone]);

  const filteredAndSorted = useMemo(() => {
    let filtered: any[];
    if (filterTab === 'pending') {
      filtered = enriched.filter((o: any) => ['pending', 'in_progress', 'delayed'].includes(o.status));
    } else if (filterTab === 'waiting') {
      filtered = enriched.filter((o: any) => o.status === 'waiting_approval');
    } else if (filterTab === 'done') {
      filtered = enriched.filter((o: any) => ['completed', 'approved'].includes(o.status));
    } else {
      // not_completed: hoje + histórico
      filtered = allNotDone;
    }

    const rank = (o: any) => {
      if (o.status === 'not_completed') return 0;
      if (o.status === 'rejected') return 0;
      if (o.status === 'delayed' || o.isDelayed) return 1;
      if (['pending', 'in_progress'].includes(o.status)) return 2;
      if (o.status === 'waiting_approval') return 3;
      return 4;
    };
    // Na aba não feitas já ordenamos por data desc, nas outras por rank
    if (filterTab === 'not_completed') return filtered;
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [enriched, allNotDone, filterTab]);

  // ─── Ações ────────────────────────────────────────────────────────────────
  const handleStartComplete = (occ: any) => {
    if (Number(occ.is_health_reminder) === 1) return;
    setSelectedOcc(occ);
    const requiresApproval = occ.requires_approval ?? occ.tasks?.requires_approval;
    if (requiresApproval) {
      setObservationText('');
      setCompleteModalVisible(true);
    } else {
      Alert.alert('Concluir Tarefa', `Deseja marcar "${occ.title}" como concluída?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sim, Concluir!', onPress: () => handleConfirmComplete(occ, '') },
      ]);
    }
  };

  const handleConfirmComplete = async (occ: any, observation: string) => {
    try {
      setLoading(true);
      const occId = occ.id;
      if (observation.trim()) {
        await api.put(`/tasks/occurrences/${occId}`, { observation });
      }
      const isDelayed = occ.isDelayed || occ.status === 'delayed';
      const payload = isDelayed ? { completed_late: true } : {};
      const res = await api.put(`/tasks/occurrences/${occId}/complete`, payload);
      Alert.alert(
        'Sucesso! 🎉',
        res.data?.status === 'waiting_approval'
          ? 'Tarefa enviada para aprovação! 📤'
          : 'Tarefa concluída! Parabéns! 🎉',
      );
      setCompleteModalVisible(false);
      setObservationText('');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível concluir a tarefa.');
    } finally {
      setLoading(false);
    }
  };

  const handleHealthReminder = async (occId: string, intake: 'taken' | 'skipped') => {
    try {
      setLoading(true);
      await api.put(`/tasks/occurrences/${occId}/complete`, { health_intake: intake });
      Alert.alert('Registrado!', intake === 'taken' ? 'Medicamento tomado! 💊' : 'Registrado como não tomado.');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível registrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestTask = async () => {
    if (!suggestTitle.trim()) { Alert.alert('Aviso', 'Digite o título da tarefa.'); return; }
    try {
      setLoading(true);
      await api.post('/tasks', {
        title: suggestTitle, description: suggestDescription, type: suggestType,
        child_id: childProfile?.id, frequency: 'once',
        requires_approval: true, is_recurring: false, due_time: suggestDueTime || null,
      });
      Alert.alert('Sucesso!', 'Sugestão enviada para aprovação! 📋');
      setSuggestModalVisible(false);
      setSuggestTitle(''); setSuggestDescription(''); setSuggestType('routine'); setSuggestDueTime('');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível enviar a sugestão.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradStart} />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Minhas Tarefas 🏅</Text>
          <Text style={s.headerSub}>{todayStr.split('-').reverse().join('/')}</Text>
        </View>
        <TouchableOpacity style={s.suggestBtn} onPress={() => setSuggestModalVisible(true)} activeOpacity={0.8}>
          <Text style={s.suggestBtnText}>+ Sugerir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {/* ── KPIs ── */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiVal}>{counts.done}</Text>
            <Text style={s.kpiLabel}>Feitas</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiVal, { color: Colors.warning }]}>{counts.pending}</Text>
            <Text style={s.kpiLabel}>Pendentes</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiVal, { color: Colors.danger }]}>{counts.not_completed}</Text>
            <Text style={s.kpiLabel}>Não Feitas</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiVal, { color: '#7C3AED' }]}>{counts.waiting}</Text>
            <Text style={s.kpiLabel}>Aguardando</Text>
          </View>
        </View>

        {/* ── Barra de progresso ── */}
        <View style={s.progressCard}>
          <View style={s.progressHeader}>
            <Text style={s.progressLabel}>Progresso do Dia</Text>
            <Text style={s.progressPct}>
              {occurrences.length > 0 ? Math.round((counts.done / Math.max(occurrences.length, 1)) * 100) : 0}%
            </Text>
          </View>
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, {
              width: `${occurrences.length > 0 ? Math.round((counts.done / Math.max(occurrences.length, 1)) * 100) : 0}%` as any,
            }]} />
          </View>
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabsRow}>
          {([
            { key: 'pending', label: 'Pendentes', color: Colors.warning },
            { key: 'waiting', label: 'Aguardando', color: '#7C3AED' },
            { key: 'done', label: 'Feitas', color: Colors.success },
            { key: 'not_completed', label: 'Não Feitas', color: Colors.danger },
          ] as const).map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tabBtn, filterTab === tab.key && s.tabBtnActive, filterTab === tab.key && { borderColor: tab.color }]}
              onPress={() => setFilterTab(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabText, filterTab === tab.key && { color: tab.color, fontWeight: '800' }]}>
                {tab.label}
              </Text>
              <TabBadge count={counts[tab.key]} color={tab.color} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Aviso da aba Não Feitas ── */}
        {filterTab === 'not_completed' && counts.not_completed === 0 && !loading && (
          <View style={s.noNotCompleted}>
            <Text style={{ fontSize: 36 }}>🎉</Text>
            <Text style={s.noNotCompletedTitle}>Nenhuma tarefa não concluída!</Text>
            <Text style={s.noNotCompletedSub}>Continue assim — mantenha suas tarefas em dia!</Text>
          </View>
        )}

        {/* ── Desconto Banner (aba não feitas) ── */}
        {filterTab === 'not_completed' && filteredAndSorted.length > 0 && (() => {
          const totalDiscount = filteredAndSorted.reduce((sum: number, o: any) => sum + (Number(o.discount_amount) || 0), 0);
          if (totalDiscount <= 0) return null;
          return (
            <View style={s.discountBanner}>
              <Text style={s.discountIcon}>💸</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.discountTitle}>Impacto na Mesada</Text>
                <Text style={s.discountSub}>
                  Desconto total do dia: <Text style={{ fontWeight: '900' }}>R$ {totalDiscount.toFixed(2)}</Text>
                </Text>
              </View>
            </View>
          );
        })()}

        {/* ── Lista de tarefas ── */}
        {loading && !refreshing ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.loadingText}>Carregando tarefas...</Text>
          </View>
        ) : filteredAndSorted.length === 0 && filterTab !== 'not_completed' ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🎉</Text>
            <Text style={s.emptyTitle}>
              {filterTab === 'pending' ? 'Tudo em dia! Bom trabalho! 🌟' : 'Nenhuma tarefa aqui.'}
            </Text>
          </View>
        ) : (
          filteredAndSorted.map((occ: any) => {
            const isHealth = occ.task?.category === 'health' || Number(occ.is_health_reminder) === 1;
            const badge = getStatusBadgeProps(occ);
            const isOpen = ['pending', 'in_progress', 'delayed'].includes(occ.status) || occ.isDelayed;
            // Não concluída = status salvo OR rejected automático pelo sistema
            const isNotCompleted = occ.status === 'not_completed' || (occ.status === 'rejected' && isAutoRejected(occ));
            const icon = occ.icon || taskIcon(occ.title, occ.type);
            const isDelayed = occ.status === 'delayed' || occ.isDelayed;
            const minsLeft = minutesToDeadline(occ, now);
            const discount = Number(occ.discount_amount) || 0;
            const bonus = Number(occ.bonus_amount) || 0;
            // Data formatada para exibir no card histórico
            const occDate = occ.occurrence_date
              ? String(occ.occurrence_date).slice(0, 10).split('-').reverse().join('/')
              : null;

            return (
              <View
                key={occ.id}
                style={[
                  s.taskCard,
                  !isOpen && !isNotCompleted && s.taskCardDone,
                  isDelayed && s.taskCardDelayed,
                  isNotCompleted && s.taskCardNotCompleted,
                ]}
              >
                <View style={[s.cardStripe, { backgroundColor: badge.color }]} />
                <View style={s.cardContent}>

                  {/* Título + badge */}
                  <View style={s.cardHeader}>
                    <Text style={s.cardIcon}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.taskTitle, (!isOpen && !isNotCompleted) && s.taskTitleDone]} numberOfLines={2}>
                        {occ.title}
                      </Text>
                      {occ.description ? <Text style={s.taskDesc} numberOfLines={1}>{occ.description}</Text> : null}
                      {/* Data da ocorrência para cards históricos (não do dia atual) */}
                      {occDate && filterTab === 'not_completed' && !occ._isToday && (
                        <Text style={[s.taskDesc, { color: '#9CA3AF', marginTop: 2 }]}>📅 {occDate}</Text>
                      )}
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[s.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>

                  {/* Meta chips */}
                  <View style={s.metaRow}>
                    {!isHealth && (
                      <View style={s.metaChip}>
                        <Text style={s.metaChipText}>⭐ {occ.points || 0} XP</Text>
                      </View>
                    )}
                    {bonus > 0 && !isHealth && (
                      <View style={[s.metaChip, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[s.metaChipText, { color: '#B45309' }]}>💰 +R${bonus.toFixed(2)}</Text>
                      </View>
                    )}
                    {discount > 0 && !isHealth && (
                      <View style={[s.metaChip, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={[s.metaChipText, { color: Colors.danger }]}>💸 -R${discount.toFixed(2)}</Text>
                      </View>
                    )}
                    {occ.due_time && (
                      <View style={[s.metaChip, { backgroundColor: isDelayed ? '#FEE2E2' : '#E0F2FE' }]}>
                        <Text style={[s.metaChipText, { color: isDelayed ? Colors.danger : '#0369A1' }]}>
                          ⏰ {occ.due_time.slice(0, 5)}
                        </Text>
                      </View>
                    )}
                    {occ.is_recurring && (
                      <View style={[s.metaChip, { backgroundColor: '#EDE9FE' }]}>
                        <Text style={[s.metaChipText, { color: '#6D28D9' }]}>🔁 Recorrente</Text>
                      </View>
                    )}
                    {isHealth && (
                      <View style={[s.metaChip, { backgroundColor: '#F3F4F6' }]}>
                        <Text style={[s.metaChipText, { color: '#4B5563' }]}>💊 Medicamento</Text>
                      </View>
                    )}
                  </View>

                  {/* Deadline restante (se pendente) */}
                  {isOpen && minsLeft !== null && (
                    <Text style={[s.deadline, minsLeft < 0 && { color: Colors.danger }]}>
                      {minsLeft >= 0 ? `⏳ ${formatDeadline(minsLeft)}` : `⚠️ ${formatDeadline(minsLeft)}`}
                    </Text>
                  )}

                  {/* Não concluída: impacto */}
                  {isNotCompleted && (
                    <View style={s.notCompletedBox}>
                      <Text style={s.notCompletedText}>❌ Tarefa não concluída no prazo.{occDate ? ` (${occDate})` : ''}</Text>
                      {discount > 0 && (
                        <Text style={[s.notCompletedText, { marginTop: 2, color: '#B91C1C' }]}>
                          💸 Desconto aplicado: R$ {discount.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  )}


                  {/* Ações */}
                  {isOpen && !isNotCompleted && (
                    <View style={s.actionArea}>
                      {isHealth ? (
                        <View style={s.healthRow}>
                          <TouchableOpacity style={[s.actionBtn, s.healthBtnTaken]} onPress={() => handleHealthReminder(occ.id, 'taken')} activeOpacity={0.8}>
                            <Text style={s.actionBtnText}>✓ Tomei</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.actionBtn, s.healthBtnSkipped]} onPress={() => handleHealthReminder(occ.id, 'skipped')} activeOpacity={0.8}>
                            <Text style={[s.actionBtnText, { color: Colors.textSecondary }]}>Não tomei</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[s.actionBtn, isDelayed ? s.completeBtnDelayed : s.completeBtn]}
                          onPress={() => handleStartComplete(occ)}
                          activeOpacity={0.8}
                        >
                          <Text style={s.actionBtnText}>✓ Concluir tarefa</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Observação / feedback */}
                  {occ.observation ? (
                    <View style={s.observationBox}>
                      <Text style={s.observationTitle}>Minha nota:</Text>
                      <Text style={s.observationContent}>"{occ.observation}"</Text>
                    </View>
                  ) : null}
                  {occ.rejection_reason && occ.status === 'rejected' ? (
                    <View style={[s.observationBox, { backgroundColor: '#FEF2F2' }]}>
                      <Text style={[s.observationTitle, { color: Colors.danger }]}>Motivo da reprovação:</Text>
                      <Text style={[s.observationContent, { color: '#991B1B' }]}>"{occ.rejection_reason}"</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modal Concluir ── */}
      <Modal visible={completeModalVisible} transparent animationType="slide" onRequestClose={() => setCompleteModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>🎉 Concluir Tarefa</Text>
            {selectedOcc && (
              <>
                <Text style={s.sheetSub}>
                  Concluindo: <Text style={{ fontWeight: '800' }}>{selectedOcc.title}</Text>
                </Text>
                <Text style={s.label}>Recado para os pais (opcional)</Text>
                <TextInput
                  style={s.textarea}
                  placeholder="Ex: Arrumei tudo direitinho!"
                  placeholderTextColor={Colors.textMuted}
                  multiline numberOfLines={4}
                  value={observationText}
                  onChangeText={setObservationText}
                />
                {Number(selectedOcc.bonus_amount) > 0 && (
                  <View style={[s.bonusBanner, { marginBottom: 12 }]}>
                    <Text style={s.bonusBannerText}>💰 Bônus ao concluir: R$ {Number(selectedOcc.bonus_amount).toFixed(2)}</Text>
                  </View>
                )}
                <TouchableOpacity style={s.submitBtn} onPress={() => handleConfirmComplete(selectedOcc, observationText)} activeOpacity={0.8}>
                  <Text style={s.submitBtnText}>Enviar! 🚀</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Sugerir ── */}
      <Modal visible={suggestModalVisible} transparent animationType="slide" onRequestClose={() => setSuggestModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>📋 Sugerir Tarefa</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>O que você quer fazer? *</Text>
              <TextInput style={s.input} placeholder="Ex: Lavar a louça do jantar" placeholderTextColor={Colors.textMuted} value={suggestTitle} onChangeText={setSuggestTitle} />
              <Text style={s.label}>Mais detalhes (opcional)</Text>
              <TextInput style={[s.textarea, { height: 70 }]} placeholder="Vou secar e guardar tudo também!" placeholderTextColor={Colors.textMuted} multiline numberOfLines={3} value={suggestDescription} onChangeText={setSuggestDescription} />
              <Text style={s.label}>Categoria</Text>
              <View style={s.categoryRow}>
                {[['routine', '⏰ Rotina'], ['home', '🏠 Casa'], ['school', '📚 Estudos']].map(([type, label]) => (
                  <TouchableOpacity key={type} style={[s.catBtn, suggestType === type && s.catBtnActive]} onPress={() => setSuggestType(type)}>
                    <Text style={[s.catBtnText, suggestType === type && s.catBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>Horário Limite (opcional)</Text>
              <TextInput style={s.input} placeholder="Ex: 20:00" placeholderTextColor={Colors.textMuted} value={suggestDueTime} onChangeText={setSuggestDueTime} maxLength={5} />
              <TouchableOpacity style={[s.submitBtn, { marginTop: 16 }]} onPress={handleSuggestTask} activeOpacity={0.8}>
                <Text style={s.submitBtnText}>Enviar Sugestão 📤</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 110 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 44, paddingBottom: 12,
    backgroundColor: Colors.gradStart,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 24, color: '#fff', fontWeight: 'bold', marginTop: -3 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  suggestBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radii.full, paddingVertical: 8, paddingHorizontal: 14 },
  suggestBtnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800' },

  // KPI row
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  kpiCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 10, alignItems: 'center', ...Shadow.sm },
  kpiVal: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.primary },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

  // Progress
  progressCard: { backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 12, marginBottom: 12, ...Shadow.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
  progressPct: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.primary },
  progressBarBg: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },

  // Tabs
  tabsScroll: { marginBottom: 12 },
  tabsRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: Radii.full, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.border,
    ...Shadow.sm,
  },
  tabBtnActive: { backgroundColor: Colors.primaryLighter },
  tabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },

  // Not completed
  noNotCompleted: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 32, alignItems: 'center', gap: 8, ...Shadow.sm, marginBottom: 12 },
  noNotCompletedTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  noNotCompletedSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },

  // Discount banner
  discountBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEE2E2', borderRadius: Radii.md, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: '#FECACA',
  },
  discountIcon: { fontSize: 24 },
  discountTitle: { fontSize: FontSize.sm, fontWeight: '800', color: '#991B1B' },
  discountSub: { fontSize: FontSize.xs, color: '#B91C1C', marginTop: 2 },

  // Loading / Empty
  loadingBox: { padding: 40, alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  emptyBox: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 32, alignItems: 'center', ...Shadow.sm },
  emptyTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, textAlign: 'center' },

  // Task card
  taskCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.md, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  taskCardDone: { opacity: 0.85, backgroundColor: '#FAFAFA' },
  taskCardDelayed: { borderColor: Colors.danger + '50' },
  taskCardNotCompleted: { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  cardStripe: { width: 5 },
  cardContent: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcon: { fontSize: 22, marginTop: -1 },
  taskTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, lineHeight: 20 },
  taskTitleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  taskDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3 },
  statusBadge: { borderRadius: Radii.full, paddingVertical: 3, paddingHorizontal: 8 },
  statusBadgeText: { fontSize: 9, fontWeight: '800' },

  // Meta row
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  metaChip: { backgroundColor: Colors.primaryLighter, borderRadius: Radii.xs, paddingVertical: 3, paddingHorizontal: 8 },
  metaChipText: { fontSize: 10, fontWeight: '800', color: Colors.primary },

  deadline: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, marginTop: 6 },

  // Not completed box
  notCompletedBox: {
    marginTop: 10, padding: 10, backgroundColor: '#FEF2F2', borderRadius: Radii.sm,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  notCompletedText: { fontSize: FontSize.xs, fontWeight: '600', color: '#991B1B' },

  // Actions
  actionArea: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  actionBtn: { borderRadius: Radii.md, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  completeBtn: { backgroundColor: Colors.primary },
  completeBtnDelayed: { backgroundColor: Colors.danger },
  actionBtnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800' },
  healthRow: { flexDirection: 'row', gap: 10 },
  healthBtnTaken: { flex: 1.2, backgroundColor: Colors.success },
  healthBtnSkipped: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },

  // Observation
  observationBox: { marginTop: 10, backgroundColor: Colors.primaryLighter, borderRadius: Radii.sm, padding: 10 },
  observationTitle: { fontSize: 10, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  observationContent: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },

  // Close day button
  closeDayBtn: {
    backgroundColor: '#1E0B4B', borderRadius: Radii.lg, paddingVertical: 14, alignItems: 'center',
    marginTop: 8, ...Shadow.btn,
  },
  closeDayText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },

  // Modal / Sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,11,75,0.45)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 24, maxHeight: '90%', ...Shadow.lg,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '900', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  sheetSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 14, textAlign: 'center' },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: Colors.bg, borderRadius: Radii.sm, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.sm, color: Colors.text, marginBottom: 12,
  },
  textarea: {
    backgroundColor: Colors.bg, borderRadius: Radii.sm, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.sm, color: Colors.text,
    height: 100, textAlignVertical: 'top', marginBottom: 12,
  },
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  catBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radii.full, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border },
  catBtnActive: { backgroundColor: Colors.primaryLighter, borderColor: Colors.primary },
  catBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  catBtnTextActive: { color: Colors.primary, fontWeight: '800' },
  bonusBanner: { backgroundColor: '#FEF3C7', borderRadius: Radii.sm, padding: 10, borderWidth: 1, borderColor: '#FDE68A' },
  bonusBannerText: { fontSize: FontSize.xs, fontWeight: '700', color: '#B45309', textAlign: 'center' },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', ...Shadow.btn },
  submitBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
}) as any;
