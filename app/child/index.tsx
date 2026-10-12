import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import api from '../../src/services/api';
import { enrichOccurrencesStatus } from '../../src/shared/lib/taskStatus';
import { taskIcon } from '../../src/lib/tasksHelpers';
import { moduleAllowed, anyModuleAllowed } from '../../src/shared/lib/familyModules';
import { formatDateBR, formatLocalYMD } from '../../src/shared/lib/familyCalendarRange';
import { HomeSceneHeader } from '../../src/components/child/HomeSceneHeader';
import { indexMedicationLogs, isMedicationActive, localDate, medicationDoses } from '../../src/lib/medicationSchedule';
import { useMedicationClock } from '../../src/lib/useMedicationClock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const cofrinhoImg = require('../../icon/cofrinho.png');

function formatCurrency(val: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val ?? 0);
}

export default function ChildHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, family, childProfile, logout, refreshProfile, modules } = useAuth();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const sceneWidth = Math.min(viewportWidth, 650);
  const sceneHeight = Math.min(sceneWidth * 0.94, 530);
  const piggyWidth = Math.min(viewportWidth - 28, 580);
  const piggySize = Math.min(sceneWidth * 0.28, 136);
  const piggyLift = Math.round(piggySize * 0.4);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [medLogs, setMedLogs] = useState<any[]>([]);
  const [allowanceBalance, setAllowanceBalance] = useState<{ balance: number; symbol?: string; currency?: string } | null>(null);
  const [allowanceCycle, setAllowanceCycle] = useState<any>(null);

  const hasLoadedOnce = useRef(false);
  const loadInflight = useRef(false);
  const modulesRef = useRef(modules);
  const childProfileRef = useRef(childProfile);
  const familyRef = useRef(family);
  const refreshProfileRef = useRef(refreshProfile);

  modulesRef.current = modules;
  childProfileRef.current = childProfile;
  familyRef.current = family;
  refreshProfileRef.current = refreshProfile;

  const now = useMedicationClock();
  const todayStr = localDate(now);
  const doseSaveRef = useRef(false);
  const [savingDose, setSavingDose] = useState(false);

  const firstName = childProfile?.name?.split(' ')[0] ?? user?.name?.split(' ')[0] ?? 'Criança';

  const loadData = useCallback(async (options: { silent?: boolean; syncProfile?: boolean } = {}) => {
    const { silent = false, syncProfile = false } = options;
    if (loadInflight.current) return;

    const mods = modulesRef.current;
    const cp = childProfileRef.current;

    loadInflight.current = true;
    try {
      if (!silent && !hasLoadedOnce.current) setLoading(true);

      if (syncProfile) {
        await refreshProfileRef.current();
      }

      const d = new Date();
      const dayStr = formatLocalYMD(d);
      const future = new Date(d);
      future.setDate(future.getDate() + 14);
      const futureEnd = formatLocalYMD(future);

      const hasTasks = moduleAllowed(mods, 'tasks');
      const hasCalendar = moduleAllowed(mods, 'calendar');
      const hasHealth = moduleAllowed(mods, 'health');
      const hasAllowance = anyModuleAllowed(mods, ['allowance', 'piggy_bank', 'goals']);

      const promises: Promise<any>[] = [
        hasTasks
          ? api.get('/tasks/occurrences', { params: { date: dayStr } })
          : Promise.resolve({ data: [] }),
        hasCalendar
          ? api.get('/calendar', { params: { from: dayStr, to: futureEnd } })
          : Promise.resolve({ data: [] }),
      ];

      if (hasHealth && cp?.id) {
        promises.push(
          api.get('/health/medications', { params: { child_id: cp.id } }),
          api.get('/health/medication-logs', { params: { child_id: cp.id, from: dayStr, to: dayStr } }),
        );
      }

      if (hasAllowance && cp?.id) {
        promises.push(
          api.get('/allowance/estimated-balance', { params: { child_id: cp.id } }),
          api.post('/allowance/cycles/current', { child_id: cp.id }).catch(() => ({ data: null })),
        );
      }

      const results = await Promise.all(promises);
      let idx = 0;
      const occRes = results[idx++];
      const calRes = results[idx++];

      setOccurrences(occRes?.data || []);

      const sortedEvents = (calRes?.data || [])
        .filter((e: any) => e?.date >= dayStr)
        .sort((a: any, b: any) => {
          const dc = a.date.localeCompare(b.date);
          if (dc !== 0) return dc;
          if (!a.time && !b.time) return 0;
          if (!a.time) return 1;
          if (!b.time) return -1;
          return String(a.time).localeCompare(String(b.time));
        });
      setUpcomingEvents(sortedEvents.slice(0, 4));

      if (hasHealth && cp?.id) {
        setMedications(results[idx++]?.data || []);
        setMedLogs(results[idx++]?.data || []);
      } else {
        setMedications([]);
        setMedLogs([]);
      }

      if (hasAllowance && cp?.id) {
        setAllowanceBalance(results[idx++]?.data ?? null);
        setAllowanceCycle(results[idx++]?.data ?? null);
      } else {
        setAllowanceBalance(null);
        setAllowanceCycle(null);
      }

      hasLoadedOnce.current = true;
    } catch (err) {
      console.error('[ChildHome] Erro ao carregar dados do painel:', err);
    } finally {
      loadInflight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!familyRef.current?.id) return;
      if (!childProfileRef.current?.id && !hasLoadedOnce.current) return;
      loadData({ silent: hasLoadedOnce.current });
    }, [loadData]),
  );

  useEffect(() => {
    if (!family?.id || !childProfile?.id || hasLoadedOnce.current) return;
    loadData({ silent: false });
  }, [family?.id, childProfile?.id, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData({ silent: true, syncProfile: true });
  }, [loadData]);

  useEffect(() => { if (hasLoadedOnce.current) void loadData({ silent: true }); }, [todayStr, loadData]);

  const tasksStats = useMemo(() => {
    if (!occurrences.length) return { total: 0, completed: 0, percentage: 100 };
    const total = occurrences.length;
    const completed = occurrences.filter((o) =>
      ['approved', 'completed', 'waiting_approval'].includes(o.status),
    ).length;
    return { total, completed, percentage: Math.round((completed / total) * 100) };
  }, [occurrences]);

  const quickTasks = useMemo(() => {
    const enriched = enrichOccurrencesStatus(occurrences);
    return enriched
      .filter((o: any) => ['pending', 'in_progress', 'delayed'].includes(o.status))
      .slice(0, 4);
  }, [occurrences]);

  const todayMeds = useMemo(
    () => medications.filter((m) => isMedicationActive(m, todayStr)),
    [medications, todayStr],
  );

  const todayDoses = useMemo(() => {
    const index = indexMedicationLogs(medLogs);
    return todayMeds.flatMap((med) => medicationDoses(med, index.get(med.id) || [], todayStr, now).map((dose: any) => ({ ...dose, med })));
  }, [todayMeds, medLogs, todayStr, now]);
  const pendingDoses = todayDoses.filter((dose) => !dose.log);

  const handleLogDose = (medId: string, medName: string, dose: any) => {
    if (doseSaveRef.current) return;
    Alert.alert('Confirmar dose', `Já tomou "${medName}"?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, já tomei!',
        onPress: async () => {
          if (doseSaveRef.current) return;
          doseSaveRef.current = true;
          setSavingDose(true);
          try {
            const now = new Date();
            await api.post('/health/medication-logs', {
              medication_id: medId,
              child_id: childProfile?.id,
              taken_at: now.toISOString(),
              scheduled_date: dose.time ? dose.date : null,
              scheduled_time: dose.time || null,
              status: 'taken',
              notes: 'Registrado na home',
            });
            await loadData({ silent: true });
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Não foi possível registrar a dose.');
          } finally {
            doseSaveRef.current = false;
            setSavingDose(false);
          }
        },
      },
    ]);
  };

  const showAllowanceCard = anyModuleAllowed(modules, ['allowance', 'piggy_bank', 'goals']);
  const allowanceCurrency = allowanceBalance?.currency || 'BRL';
  const cycleBonus = Number(allowanceCycle?.total_bonus ?? 0);
  const cycleManual = Number(allowanceCycle?.manual_adjustments ?? 0);
  const cycleDiscount = Number(allowanceCycle?.total_discount ?? 0);
  const bonusTotal = cycleBonus + (cycleManual > 0 ? cycleManual : 0);
  const discountTotal = cycleDiscount + (cycleManual < 0 ? Math.abs(cycleManual) : 0);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {loading && !hasLoadedOnce.current ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loaderText}>Carregando teu painel...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
        >
          <HomeSceneHeader
            sceneWidth={sceneWidth}
            avatarId={childProfile?.avatar_preset}
            mascotId={childProfile?.mascot_id}
            onChooseAvatar={() => router.push('/child/avatar' as any)}
            onChooseMascot={() => router.push('/child/mascot' as any)}
            style={[styles.headerScene, { width: sceneWidth, height: sceneHeight }]}
          >
            <View style={[styles.headerRow, { paddingTop: Math.max(insets.top + 10, 17) }]}>
              <View style={styles.headerIdentity}>
                <Text style={[styles.greeting, viewportWidth < 360 && styles.greetingCompact]} numberOfLines={1}>Olá, {firstName}!</Text>
                <Text style={[styles.familyName, viewportWidth < 360 && styles.familyNameCompact]} numberOfLines={1}>{family?.name ?? 'Minha Família'}</Text>
              </View>
              <View style={styles.headerKpis}>
                <View style={[styles.headerKpi, viewportWidth < 360 && styles.headerKpiCompact]} accessible accessibilityLabel={`Estrelas: ${childProfile?.coins ?? 0}`}>
                  <Ionicons name="star" size={14} color="#EBAA18" />
                  <Text style={styles.headerKpiValue}>{childProfile?.coins ?? 0}</Text>
                </View>
                <View style={[styles.headerKpi, viewportWidth < 360 && styles.headerKpiCompact]} accessible accessibilityLabel={`XP: ${childProfile?.points ?? 0}`}>
                  <Ionicons name="flash" size={14} color={Colors.primary} />
                  <Text style={styles.headerKpiValue}>{childProfile?.points ?? 0}</Text>
                </View>
                <View style={[styles.headerKpi, viewportWidth < 360 && styles.headerKpiCompact]} accessible accessibilityLabel={`Nível: ${childProfile?.level ?? 1}`}>
                  <Ionicons name="trophy" size={14} color="#399B88" />
                  <Text style={styles.headerKpiValue}>{childProfile?.level ?? 1}</Text>
                </View>
              </View>
            </View>
          </HomeSceneHeader>

          {showAllowanceCard && (
            <View style={[styles.piggyTouchable, { width: piggyWidth }]}>
              <TouchableOpacity
                style={[styles.piggyCard, { paddingTop: Math.max(32, piggySize - piggyLift - 24) }]}
                onPress={() => router.push('/child/allowance')}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`Meu Cofrinho. Saldo ${formatCurrency(Number(allowanceBalance?.balance ?? 0), allowanceCurrency)}`}
              >
                <Image
                  source={cofrinhoImg}
                  resizeMode="contain"
                  style={[styles.piggyImage, {
                    width: piggySize,
                    height: piggySize,
                    top: -piggyLift,
                    left: (piggyWidth - piggySize) / 2,
                  }]}
                  accessibilityIgnoresInvertColors
                />
                <View style={styles.piggyTitleRow}>
                  <Text style={styles.piggyLabel}>Meu Cofrinho</Text>
                  <Text style={styles.piggyChevron}>›</Text>
                </View>
                <View style={styles.piggyKpis}>
                  <View style={styles.piggyKpi}>
                    <Text style={styles.piggyKpiLabel}>Saldo</Text>
                    <Text style={styles.piggyKpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatCurrency(Number(allowanceBalance?.balance ?? 0), allowanceCurrency)}
                    </Text>
                  </View>
                  <View style={styles.piggyKpi}>
                    <Text style={styles.piggyKpiLabel}>Bônus</Text>
                    <Text style={[styles.piggyKpiValue, { color: Colors.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      + {formatCurrency(bonusTotal, allowanceCurrency)}
                    </Text>
                  </View>
                  <View style={styles.piggyKpi}>
                    <Text style={styles.piggyKpiLabel}>Descontos</Text>
                    <Text style={[styles.piggyKpiValue, { color: Colors.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      − {formatCurrency(discountTotal, allowanceCurrency)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Tarefas do dia */}
          {moduleAllowed(modules, 'tasks') && (
            <Card style={styles.summaryCard} shadow="sm">
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>Tarefas de hoje</Text>
                <TouchableOpacity onPress={() => router.push('/child/tasks')}>
                  <Text style={styles.seeAll}>Ver todas ›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.progressRow}>
                <ProgressBar
                  progress={tasksStats.percentage}
                  color={Colors.primary}
                  bg={Colors.primaryLighter}
                  height={8}
                  showLabel
                  style={{ flex: 1 }}
                />
                <Badge
                  label={`${tasksStats.completed}/${tasksStats.total}`}
                  variant={tasksStats.percentage === 100 && tasksStats.total > 0 ? 'success' : 'primary'}
                />
              </View>

              {quickTasks.length === 0 ? (
                <Text style={styles.emptyLine}>
                  {occurrences.length > 0
                    ? 'Todas as tarefas de hoje foram concluídas!'
                    : 'Nenhuma tarefa programada para hoje.'}
                </Text>
              ) : (
                quickTasks.map((t: any) => {
                  const icon = taskIcon(t.title, t.type);
                  const isDelayed = t.status === 'delayed' || t.isDelayed;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.compactRow}
                      onPress={() => router.push('/child/tasks')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rowIcon}>{icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
                        {isDelayed && <Text style={styles.delayedLabel}>Atrasada</Text>}
                      </View>
                      <Text style={styles.rowMeta}>⭐ {t.points}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </Card>
          )}

          {/* Agenda / calendário */}
          {moduleAllowed(modules, 'calendar') && (
            <Card style={styles.summaryCard} shadow="sm">
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>Próximos compromissos</Text>
                <TouchableOpacity onPress={() => router.push('/child/calendar')}>
                  <Text style={styles.seeAll}>Calendário ›</Text>
                </TouchableOpacity>
              </View>

              {upcomingEvents.length === 0 ? (
                <Text style={styles.emptyLine}>Nada agendado nos próximos dias.</Text>
              ) : (
                upcomingEvents.map((ev: any) => (
                  <TouchableOpacity
                    key={ev.id}
                    style={styles.compactRow}
                    onPress={() => router.push('/child/calendar')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rowIcon}>📅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{ev.title}</Text>
                      <Text style={styles.rowSub}>
                        {formatDateBR(ev.date)}
                        {ev.time ? ` · ${ev.time.slice(0, 5)}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </Card>
          )}

          {/* Remédios de hoje */}
          {moduleAllowed(modules, 'health') && todayMeds.length > 0 && (
            <Card style={styles.summaryCard} shadow="sm">
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>Remédios de hoje</Text>
                <TouchableOpacity onPress={() => router.push('/child/health')}>
                  <Text style={styles.seeAll}>Saúde ›</Text>
                </TouchableOpacity>
              </View>

              {pendingDoses.length === 0 ? (
                <Text style={styles.emptyLine}>Todos os remédios de hoje já foram tomados!</Text>
              ) : (
                pendingDoses.map((dose) => (
                  <View key={`${dose.med.id}:${dose.time}`} style={styles.compactRow}>
                    <Text style={styles.rowIcon}>💊</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{dose.med.name}</Text>
                      <Text style={[styles.rowSub, dose.state === 'overdue' && { color: Colors.danger }]}>
                        {dose.time || 'Conforme orientação'} · {dose.state === 'overdue' ? 'Atrasado' : 'Pendente'}
                        {dose.med.dosage ? ` · ${dose.med.dosage}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.doseBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Registrar dose de ${dose.med.name} ${dose.time}`}
                      onPress={() => handleLogDose(dose.med.id, dose.med.name, dose)}
                      disabled={savingDose}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.doseBtnText}>Tomei</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {todayDoses.length > pendingDoses.length && (
                <Text style={styles.takenHint}>
                  {todayDoses.length - pendingDoses.length} dose(s) já registrada(s) hoje
                </Text>
              )}
            </Card>
          )}

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Sair da conta</Text>
          </TouchableOpacity>

          <View style={{ height: 88 }} />
        </ScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, overflow: 'visible' },

  headerScene: {
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 17,
    gap: 8,
  },
  headerIdentity: {
    flexShrink: 1,
    maxWidth: 230,
    minWidth: 0,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  greeting: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  greetingCompact: { fontSize: 15 },
  familyName: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  familyNameCompact: { fontSize: 9 },
  headerKpis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerKpi: {
    minWidth: 48,
    height: 42,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerKpiCompact: { minWidth: 44, height: 40, paddingHorizontal: 4 },
  headerKpiValue: { fontSize: 11, fontWeight: '900', color: Colors.text, marginTop: 1 },

  scroll: { flex: 1 },
  content: { padding: 14, paddingTop: 0, gap: 12, paddingBottom: 110 },

  piggyTouchable: {
    alignSelf: 'center',
    zIndex: 5,
    overflow: 'visible',
    marginTop: -42,
  },
  piggyCard: {
    position: 'relative',
    overflow: 'visible',
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  piggyImage: {
    position: 'absolute',
    zIndex: 2,
  },
  piggyTitleRow: {
    minHeight: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  piggyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  piggyChevron: {
    position: 'absolute',
    right: 2,
    fontSize: 20,
    color: Colors.primary,
    fontWeight: '700',
    lineHeight: 22,
  },
  piggyKpis: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  piggyKpi: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#EEE9F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  piggyKpiLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  piggyKpiValue: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.text,
    marginTop: 3,
  },

  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loaderText: {
    marginTop: 12,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  summaryCard: { padding: 12 },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  seeAll: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },

  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  rowIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  rowTitle: { fontSize: FontSize.xs + 1, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  rowMeta: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  delayedLabel: { fontSize: 9, color: Colors.danger, fontWeight: '700', marginTop: 1 },

  emptyLine: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 4,
  },

  doseBtn: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  doseBtnText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  takenHint: {
    fontSize: 10,
    color: Colors.success,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },

  logoutBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  logoutText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '700' },
});
