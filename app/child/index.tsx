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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { PiggyPopoutCard } from '../../src/components/allowance/PiggyPopoutCard';
import api from '../../src/services/api';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import { enrichOccurrencesStatus } from '../../src/shared/lib/taskStatus';
import { taskIcon } from '../../src/lib/tasksHelpers';
import { moduleAllowed, anyModuleAllowed } from '../../src/shared/lib/familyModules';
import { formatDateBR, formatLocalYMD, todayLocalYMD } from '../../src/shared/lib/familyCalendarRange';

const cofrinhoImg = require('../../icon/cofrinho.png');

/** Avatar no header: 101px base + 120% → ~222px */
const HEADER_AVATAR_SIZE = Math.round(101 * 2.2);

function formatCurrency(val: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val ?? 0);
}

function parseScheduledTimes(med: any): string[] {
  const raw = med?.scheduled_times ?? med?.scheduled_time;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw.includes(',') ? raw.split(',').map((s) => s.trim()) : [raw.trim()];
    }
  }
  return [];
}

function medTimesLabel(med: any): string {
  const times = parseScheduledTimes(med);
  if (times.length) return times.map((t) => t.slice(0, 5)).join(', ');
  if (med?.frequency) return String(med.frequency);
  return 'Conforme orientação';
}

function isMedActiveToday(med: any, todayStr: string): boolean {
  if (med?.status !== 'active') return false;
  if (med.start_date && med.start_date > todayStr) return false;
  if (med.end_date && med.end_date < todayStr) return false;
  return true;
}

function wasTakenToday(medId: string, logs: any[], todayStr: string): boolean {
  return logs.some(
    (l) => l.medication_id === medId && (l.taken_date === todayStr || String(l.taken_at || '').slice(0, 10) === todayStr),
  );
}

export default function ChildHomeScreen() {
  const { user, family, childProfile, logout, refreshProfile, modules, isChildProxy } = useAuth();
  const router = useRouter();

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

  const todayStr = useMemo(() => todayLocalYMD(), []);

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
    () => medications.filter((m) => isMedActiveToday(m, todayStr)),
    [medications, todayStr],
  );

  const pendingMeds = useMemo(
    () => todayMeds.filter((m) => !wasTakenToday(m.id, medLogs, todayStr)),
    [todayMeds, medLogs, todayStr],
  );

  const handleLogDose = (medId: string, medName: string) => {
    Alert.alert('Confirmar dose', `Já tomou "${medName}"?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, já tomei!',
        onPress: async () => {
          try {
            const now = new Date();
            await api.post('/health/medication-logs', {
              medication_id: medId,
              child_id: childProfile?.id,
              taken_date: now.toISOString().split('T')[0],
              taken_time: now.toTimeString().slice(0, 5),
              status: 'taken',
              notes: 'Registrado na home',
            });
            loadData({ silent: true });
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Não foi possível registrar a dose.');
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
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, isChildProxy && styles.headerWithProxy]}
      >
        <TouchableOpacity
          style={styles.headerAvatar}
          onPress={() => router.push('/child/profile')}
          activeOpacity={0.9}
        >
          <View style={styles.headerAvatarInner}>
            <UserAvatar
              avatarUrl={childProfile?.avatar_url}
              avatarPreset={childProfile?.avatar_preset}
              name={childProfile?.name ?? user?.name}
              size={HEADER_AVATAR_SIZE}
              bordered={false}
              presentation="character"
            />
          </View>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Olá, {firstName}!</Text>
            <Text style={styles.familyName}>{family?.name ?? 'Minha Família'}</Text>
          </View>
        </View>

        <View style={styles.balanceRow}>
          <View style={styles.balanceChip}>
            <Text style={styles.balanceChipLabel}>Estrelas</Text>
            <Text style={styles.balanceChipValue}>{childProfile?.coins ?? 0}</Text>
          </View>
          <View style={styles.balanceChip}>
            <Text style={styles.balanceChipLabel}>XP</Text>
            <Text style={styles.balanceChipValue}>{childProfile?.points ?? 0}</Text>
          </View>
          <View style={styles.balanceChip}>
            <Text style={styles.balanceChipLabel}>Nível</Text>
            <Text style={styles.balanceChipValue}>{childProfile?.level ?? 1}</Text>
          </View>
        </View>

        <LinearGradient
          colors={[
            'rgba(91,33,182,0)',
            'rgba(55,20,120,0.42)',
            'rgba(30,8,70,0.88)',
          ]}
          locations={[0, 0.38, 1]}
          style={styles.headerBaseFade}
          pointerEvents="none"
        />
      </LinearGradient>

      {showAllowanceCard && (hasLoadedOnce.current || !loading) && (
        <View style={styles.piggyTouchable}>
          <TouchableOpacity
            onPress={() => router.push('/child/allowance')}
            activeOpacity={0.9}
          >
            <PiggyPopoutCard imageSource={cofrinhoImg}>
            <View style={styles.piggyInfoRow}>
              <View style={styles.piggyInfo}>
                <Text style={styles.piggyLabel}>Meu Cofrinho</Text>
                <Text style={styles.piggyBalance} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {formatCurrency(Number(allowanceBalance?.balance ?? 0), allowanceCurrency)}
                </Text>
              </View>
              <Text style={styles.piggyChevron}>›</Text>
            </View>

            {(allowanceCycle || allowanceBalance) && (
              <View style={styles.piggyBonusRow}>
                <View style={styles.piggyBonusBox}>
                  <Text style={styles.piggyBonusLabel}>Bônus</Text>
                  <Text style={[styles.piggyBonusVal, { color: Colors.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    + {formatCurrency(bonusTotal, allowanceCurrency)}
                  </Text>
                </View>
                <View style={styles.piggyBonusBox}>
                  <Text style={styles.piggyBonusLabel}>Descontos</Text>
                  <Text style={[styles.piggyBonusVal, { color: Colors.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    − {formatCurrency(discountTotal, allowanceCurrency)}
                  </Text>
                </View>
              </View>
            )}
          </PiggyPopoutCard>
          </TouchableOpacity>
        </View>
      )}

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

              {pendingMeds.length === 0 ? (
                <Text style={styles.emptyLine}>Todos os remédios de hoje já foram tomados!</Text>
              ) : (
                pendingMeds.map((m) => (
                  <View key={m.id} style={styles.compactRow}>
                    <Text style={styles.rowIcon}>💊</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{m.name}</Text>
                      <Text style={styles.rowSub}>
                        {medTimesLabel(m)}
                        {m.dosage ? ` · ${m.dosage}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.doseBtn}
                      onPress={() => handleLogDose(m.id, m.name)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.doseBtnText}>Tomei</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {todayMeds.length > pendingMeds.length && (
                <Text style={styles.takenHint}>
                  {todayMeds.length - pendingMeds.length} remédio(s) já registrado(s) hoje
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

  header: {
    paddingTop: 52,
    paddingBottom: 18,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  headerWithProxy: {
    paddingTop: 10,
    marginTop: -10,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  headerAvatar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  headerAvatarInner: {
    position: 'relative',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  headerBaseFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 1,
    position: 'relative',
    paddingRight: Math.round(HEADER_AVATAR_SIZE * 0.92),
  },
  greeting: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  familyName: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  balanceRow: { flexDirection: 'row', gap: 6, zIndex: 2, position: 'relative' },
  balanceChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  balanceChipLabel: { fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  balanceChipValue: { fontSize: FontSize.sm, fontWeight: '900', color: '#fff', marginTop: 1 },

  scroll: { flex: 1 },
  content: { padding: 14, paddingTop: 10, gap: 10, paddingBottom: 110 },

  piggyTouchable: {
    zIndex: 5,
    overflow: 'visible',
    marginTop: 2,
  },
  piggyInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  piggyInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  piggyLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  piggyBalance: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: Colors.text,
    lineHeight: 22,
  },
  piggyChevron: {
    fontSize: 20,
    color: Colors.primary,
    fontWeight: '700',
    marginLeft: 4,
    lineHeight: 22,
  },
  piggyBonusRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  piggyBonusBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.bg,
    borderRadius: Radii.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  piggyBonusLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  piggyBonusVal: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
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
