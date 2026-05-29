import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { moduleAllowed, anyModuleAllowed } from '../../src/shared/lib/familyModules';
import api from '../../src/services/api';
import {
  ParentDashboardData,
  ChildProfile,
} from '../../src/lib/api';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import { ChildProfileSwitcher } from '../../src/components/proxy/ChildProfileSwitcher';

// ─── Componentes Auxiliares ──────────────────────────────────────────────────

interface ChildCardProps {
  child: ChildProfile;
}

function ChildCard({ child }: ChildCardProps) {
  const xpPct = child.xp_next_level > 0 ? Math.min((child.xp / child.xp_next_level) * 100, 100) : 0;
  const allowanceDisplay =
    child.allowance_balance_preview != null
      ? `R$ ${Number(child.allowance_balance_preview).toFixed(2)}`
      : '—';

  const cardColor = child.color || Colors.primary;

  return (
    <View style={[styles.childCard, { borderColor: Colors.border }]}>
      {/* Indicador de cor lateral */}
      <View style={[styles.childCardColorBar, { backgroundColor: cardColor }]} />

      <View style={styles.childCardContent}>
        {/* Header do Filho */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <View style={styles.childAvatarContainer}>
            <UserAvatar
              avatarUrl={child.avatar_url}
              avatarPreset={child.avatar_preset}
              name={child.name}
              size={48}
              bordered={false}
              backgroundColor={`${cardColor}15`}
            />
            <View style={styles.childInfoText}>
              <Text style={styles.childName}>{child.name}</Text>
              <Text style={styles.childLevel}>⭐ Nível {child.level}</Text>
            </View>
          </View>
          {child.streak_current > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {child.streak_current}d</Text>
            </View>
          )}
        </View>

        {/* Progresso de XP */}
        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>XP</Text>
            <Text style={styles.xpVal}>{child.xp} / {child.xp_next_level}</Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${xpPct}%`, backgroundColor: cardColor }]} />
          </View>
        </View>

        {/* Estatísticas Rápidas */}
        <View style={styles.childStatsRow}>
          <View style={styles.childStatCol}>
            <Text style={styles.childStatIcon}>⭐</Text>
            <View>
              <Text style={styles.childStatVal}>{child.points}</Text>
              <Text style={styles.childStatLabel}>Pontos</Text>
            </View>
          </View>

          <View style={styles.childStatCol}>
            <Text style={styles.childStatIcon}>💰</Text>
            <View>
              <Text style={styles.childStatVal} numberOfLines={1}>{allowanceDisplay}</Text>
              <Text style={styles.childStatLabel}>Mesada</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

interface QuickActionProps {
  icon: string;
  label: string;
  color: string;
  route: string;
}

function QuickAction({ icon, label, color, route }: QuickActionProps) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={[styles.quickActionCard, { borderColor: Colors.border }]}
      activeOpacity={0.75}
      onPress={() => router.push(route as any)}
    >
      <View style={[styles.quickActionIconBg, { backgroundColor: `${color}12` }]}>
        <Text style={[styles.quickActionIcon, { color }]}>{icon}</Text>
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────

export default function ParentHomeScreen() {
  const { user, family, logout, modules } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }, []);

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, []);

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (!family?.id) {
      setError('Nenhuma família vinculada ao seu usuário.');
      setLoading(false);
      return;
    }

    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const { data: res } = await api.get('/reports/dashboard');
      setData(res as ParentDashboardData);
    } catch (err: any) {
      console.error('[ParentDashboard] Erro ao carregar dados:', err);
      setError(err?.message || 'Erro ao carregar o painel da família.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [family?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData(true);
  }, [loadDashboardData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Carregando painel familiar...</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Não foi possível carregar o painel</Text>
        <Text style={styles.errorDesc}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => loadDashboardData()}>
          <Text style={styles.retryBtnText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stats = data?.stats;
  const children = data?.children || [];
  const events = data?.upcomingEvents || [];
  const history = data?.recentHistory || [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        {/* Header / Hero */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting}>
              {greeting}, <Text style={styles.username}>{user?.name?.split(' ')[0] || 'Gestor'}</Text>! 👋
            </Text>
            <Text style={styles.familyName}>
              {family?.name ? `Família ${family.name}` : 'Base Familiar'} · {formattedDate}
            </Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} activeOpacity={0.85}>
            <Text style={styles.avatarText}>
              {(user?.name || 'P').charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Badge de Cargo */}
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>👨‍👩‍👧 Painel do Responsável</Text>
        </View>

        {/* KPI Cards */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiPurple]}>
            <Text style={styles.kpiEmoji}>📋</Text>
            <View style={styles.kpiValContainer}>
              <Text style={[styles.kpiValue, { color: Colors.primaryDark }]}>{stats?.pending ?? 0}</Text>
              <Text style={[styles.kpiLabel, { color: Colors.primary }]}>Tarefas Hoje</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, styles.kpiOrange]}>
            <Text style={styles.kpiEmoji}>⏳</Text>
            <View style={styles.kpiValContainer}>
              <Text style={[styles.kpiValue, { color: '#C2410C' }]}>{stats?.completed ?? 0}</Text>
              <Text style={[styles.kpiLabel, { color: '#EA580C' }]}>Aguardando</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, styles.kpiGreen]}>
            <Text style={styles.kpiEmoji}>✅</Text>
            <View style={styles.kpiValContainer}>
              <Text style={[styles.kpiValue, { color: '#15803D' }]}>{stats?.approved ?? 0}</Text>
              <Text style={[styles.kpiLabel, { color: '#16A34A' }]}>Aprovadas</Text>
            </View>
          </View>

          {stats && stats.pendingRedemptions > 0 && (
            <View style={[styles.kpiCard, styles.kpiBlue]}>
              <Text style={styles.kpiEmoji}>🛍️</Text>
              <View style={styles.kpiValContainer}>
                <Text style={[styles.kpiValue, { color: '#0369A1' }]}>{stats.pendingRedemptions}</Text>
                <Text style={[styles.kpiLabel, { color: '#0284C7' }]}>Resgates</Text>
              </View>
            </View>
          )}
        </View>

        {/* Seletor de perfil do filho (modo filho) */}
        {children.length > 0 && (
          <ChildProfileSwitcher
            childrenList={children}
            title="Entrar no perfil de um filho"
            subtitle="Atue como o filho para concluir tarefas e interagir nos módulos. Tudo fica registado no perfil dele."
          />
        )}

        {/* Acesso Rápido */}
        <Text style={styles.sectionTitle}>⚡ Acesso Rápido</Text>
        <View style={styles.quickActionsGrid}>
          {moduleAllowed(modules, 'tasks') && (
            <>
              <QuickAction icon="✅" label="Tarefas" color={Colors.primary} route="/parent/tasks" />
              <QuickAction icon="👍" label="Aprovações" color="#F97316" route="/parent/tasks" />
            </>
          )}
          {moduleAllowed(modules, 'grades') && (
            <QuickAction icon="📚" label="Notas" color="#3B82F6" route="/parent/grades" />
          )}
          {anyModuleAllowed(modules, ['allowance', 'piggy_bank', 'goals']) && (
            <QuickAction icon="💰" label="Mesada" color="#10B981" route="/parent/allowance" />
          )}
          {moduleAllowed(modules, 'health') && (
            <QuickAction icon="❤️" label="Saúde" color="#EC4899" route="/parent/health" />
          )}
          {moduleAllowed(modules, 'shopping') && (
            <QuickAction icon="🛒" label="Compras" color="#14B8A6" route="/parent/shopping" />
          )}
          {moduleAllowed(modules, 'calendar') && (
            <QuickAction icon="📅" label="Calendário" color="#818CF8" route="/parent/calendar" />
          )}
          {moduleAllowed(modules, 'mural') && (
            <QuickAction icon="📌" label="Mural" color="#FBBF24" route="/parent/mural" />
          )}
          {moduleAllowed(modules, 'location') && (
            <QuickAction icon="📍" label="Localização" color="#EF4444" route="/parent/location" />
          )}
          {moduleAllowed(modules, 'family_shop') && (
            <QuickAction icon="🛍️" label="Loja" color="#F472B6" route="/parent/store" />
          )}
        </View>

        {/* Seção Crianças */}
        {children.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Meus Filhos</Text>
              <TouchableOpacity onPress={() => router.push('/parent/profile')}>
                <Text style={styles.sectionActionText}>Gerir família</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.childrenList}>
              {children.map((child) => (
                <ChildCard key={child.id} child={child} />
              ))}
            </View>
          </View>
        )}

        {/* Eventos e Atividade */}
        <View style={styles.bottomGrid}>
          {/* Card Eventos */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>📅 Próximos Eventos</Text>
            </View>

            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📅</Text>
                <Text style={styles.emptyText}>Sem eventos próximos</Text>
              </View>
            ) : (
              events.map((ev) => (
                <View key={ev.id} style={styles.eventRow}>
                  <View style={[styles.eventDot, { backgroundColor: ev.child_color || Colors.primary }]} />
                  <View style={styles.eventBody}>
                    <Text style={styles.eventTitle}>{ev.title}</Text>
                    <Text style={styles.eventMeta}>
                      {ev.date} {ev.time ? `· ${ev.time.slice(0, 5)}` : ''} {ev.child_name ? `· ${ev.child_name}` : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Card Atividade Recente */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>🕐 Atividade Recente</Text>
            </View>

            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📝</Text>
                <Text style={styles.emptyText}>Sem atividade recente</Text>
              </View>
            ) : (
              history.map((h) => {
                const histColor = h.child_color || Colors.primary;
                return (
                  <View key={h.id} style={styles.activityRow}>
                    <UserAvatar
                      avatarUrl={h.avatar_url}
                      avatarPreset={h.avatar_preset}
                      name={h.child_name}
                      size={40}
                      bordered={false}
                      backgroundColor={`${histColor}10`}
                      style={styles.activityAvatarBg}
                    />
                    <View style={styles.activityBody}>
                      <Text style={styles.activityEvent} numberOfLines={2}>{h.event}</Text>
                      <Text style={styles.activityChild}>{h.child_name}</Text>
                    </View>
                    {h.points > 0 && (
                      <View style={styles.pointsBadge}>
                        <Text style={styles.pointsBadgeText}>+{h.points} XP</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Botão de Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sair da Conta</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footerText}>© 2025 Base Familiar · App Móvel</Text>
      </ScrollView>

      {/* Menu Inferior */}
    </View>
  );
}

// ─── Estilos (Design System Claro) ──────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 45,
    paddingBottom: 110,
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
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
    ...Shadow.btn,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: FontSize.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.text,
  },
  username: {
    fontWeight: '800',
    color: Colors.primary,
  },
  familyName: {
    fontSize: FontSize.xs + 1,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  avatarText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  roleBadge: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleBadgeText: {
    color: Colors.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  kpiCard: {
    width: '48%',
    borderRadius: Radii.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    ...Shadow.sm,
  },
  kpiPurple: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.border,
  },
  kpiOrange: {
    backgroundColor: '#FFFAF0',
    borderColor: '#FEE2E2',
  },
  kpiGreen: {
    backgroundColor: Colors.greenLight,
    borderColor: Colors.greenMid,
  },
  kpiBlue: {
    backgroundColor: Colors.blueLight,
    borderColor: Colors.blue,
  },
  kpiEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  kpiValContainer: {
    flex: 1,
  },
  kpiValue: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    lineHeight: 26,
  },
  kpiLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  quickActionCard: {
    width: '31%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  quickActionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionIcon: {
    fontSize: 18,
  },
  quickActionLabel: {
    color: Colors.text,
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionActionText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  childrenList: {
    gap: 12,
  },
  childCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    ...Shadow.sm,
  },
  childCardColorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  childCardContent: {
    padding: 14,
    paddingLeft: 20,
  },
  childAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  childAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bg,
  },
  childAvatarEmojiBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childAvatarEmoji: {
    fontSize: 22,
  },
  childInfoText: {
    marginLeft: 12,
  },
  childName: {
    color: Colors.text,
    fontSize: FontSize.base,
    fontWeight: '800',
  },
  childLevel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginTop: 1,
  },
  streakBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: Radii.xs,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  streakText: {
    color: '#F97316',
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  xpSection: {
    marginTop: 12,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  xpLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  xpVal: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  xpTrack: {
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 3,
  },
  childStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  childStatCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
  },
  childStatIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  childStatVal: {
    color: Colors.text,
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
  },
  childStatLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 1,
  },
  bottomGrid: {
    gap: 12,
    marginBottom: 24,
  },
  cardContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: FontSize.base,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyIcon: {
    fontSize: 24,
    marginBottom: 6,
    opacity: 0.6,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  eventBody: {
    flex: 1,
  },
  eventTitle: {
    color: Colors.text,
    fontSize: FontSize.sm + 1,
    fontWeight: '700',
  },
  eventMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
  },
  activityAvatarBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  activityAvatarEmoji: {
    fontSize: 16,
  },
  activityBody: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  activityEvent: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
  activityChild: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  pointsBadge: {
    backgroundColor: Colors.greenLight,
    borderRadius: Radii.xs,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Colors.greenMid,
  },
  pointsBadgeText: {
    color: Colors.green,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  logoutBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
    ...Shadow.sm,
  },
  logoutText: {
    color: Colors.danger,
    fontSize: FontSize.base,
    fontWeight: '800',
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '600',
  },
});
