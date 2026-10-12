import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { ChildModuleHeader } from '../../src/components/child/ChildModuleHeader';
import api from '../../src/services/api';
import { isRewardAvailable } from '../../src/lib/rewardStore';
import { StoreDialog, type StoreDialogConfig } from '../../src/components/store/StoreDialog';

export default function ChildStoreScreen() {
  const { childProfile } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<StoreDialogConfig | null>(null);
  const mutationRef = useRef(false);
  const confirmationRef = useRef(false);
  const loadVersion = useRef(0);
  const [points, setPoints] = useState({ total: 0, reserved: 0, available: 0 });

  const loadData = useCallback(async (isRefresh = false) => {
    const version = ++loadVersion.current;
    if (!childProfile?.id) { setLoading(false); setRefreshing(false); return; }
    try {
      if (!isRefresh) setLoading(true);

      const [rewardsRes, redemptionsRes, balanceRes] = await Promise.all([
        api.get('/allowance/rewards/list'),
        api.get('/allowance/redemptions/list'),
        api.get('/allowance/store-balance', { params: { child_id: childProfile.id } }),
      ]);
      if (version !== loadVersion.current) return;
      // Filtrar prêmios ativos
      const activeRewards = (rewardsRes?.data || []).filter(isRewardAvailable);
      setRewards(activeRewards);

      // Filtrar resgates desta criança
      const childReds = (redemptionsRes?.data || []).filter(
        (r: any) => String(r.child_id) === String(childProfile.id)
      );
      setRedemptions(childReds);
      setPoints(balanceRes.data);
      setLoadError('');
    } catch (err: any) {
      if (version === loadVersion.current) setLoadError(err.message || 'Não foi possível atualizar a loja.');
    } finally {
      if (version === loadVersion.current) { setLoading(false); setRefreshing(false); }
    }
  }, [childProfile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Executar pedido de resgate
  const redeemReward = async (reward: any) => {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await api.post(`/allowance/rewards/${reward.id}/redeem`, {
        child_id: childProfile?.id,
      });
      await loadData(true);
      setDialog({ title: 'Pedido enviado! 📤', message: 'Seu pedido de resgate foi enviado para aprovação dos seus pais.' });
    } catch (err: any) {
      setDialog({ title: 'Erro', message: err.message || 'Não foi possível solicitar o resgate.' });
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const handleRedeemReward = (reward: any) => {
    if (!childProfile?.id || confirmationRef.current || mutationRef.current || loading || loadError) return;
    const cost = Number(reward.point_cost ?? reward.points ?? 0);
    const myPoints = points.total;
    const availablePoints = points.available;

    if (cost > availablePoints) {
      if (cost > myPoints) {
        setDialog({ title: 'Pontos Insuficientes', message: `Você tem ⭐ ${myPoints} pontos, mas este prêmio custa ⭐ ${cost} pontos.` });
      } else {
        setDialog({ title: 'Pontos Reservados', message: `Você já tem outros resgates aguardando aprovação que comprometem seus pontos. Disponível no momento: ⭐ ${availablePoints}.` });
      }
      return;
    }

    confirmationRef.current = true;
    setDialog({
      title: 'Confirmar Resgate',
      message: `Deseja trocar ⭐ ${cost} pontos por "${reward.name}"?`,
      confirmLabel: 'Resgatar! 🎁',
      onConfirm: () => { void redeemReward(reward); },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { label: 'Aprovado ✓', color: Colors.success, bg: '#d1fae5' };
      case 'rejected':
        return { label: 'Recusado ✕', color: Colors.danger, bg: '#fee2e2' };
      default:
        return { label: 'Pendente ⏳', color: Colors.warning, bg: '#fef3c7' };
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ChildModuleHeader
        moduleId="loja"
        title="Loja"
        subtitle="Prêmios da família"
        actionLabel={showHistory ? 'Ver Prêmios' : 'Ver Pedidos'}
        actionIcon={showHistory ? 'gift-outline' : 'receipt-outline'}
        onAction={() => setShowHistory(!showHistory)}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* Card de Pontos */}
        <View style={styles.pointsCard}>
          <View style={styles.pointsLeft}>
            <Text style={styles.pointsLabel}>Minhas Estrelas Disponíveis</Text>
            <Text style={styles.pointsValue}>⭐ {points.available} pontos</Text>
            <Text style={styles.pointsLabel}>Total: {points.total} · Reservados: {points.reserved}</Text>
          </View>
          <Text style={{ fontSize: 44 }}>🎁</Text>
        </View>

        {loadError ? <TouchableOpacity onPress={onRefresh} accessibilityRole="button"><Text style={{ color: Colors.danger, marginBottom: 12 }}>{loadError} Toque para tentar novamente.</Text></TouchableOpacity> : null}
        {busy ? <ActivityIndicator color={Colors.primary} /> : null}
        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Carregando Loja...</Text>
          </View>
        ) : showHistory ? (
          /* ── HISTÓRICO DE RESGATES DA CRIANÇA ── */
          <View>
            <Text style={styles.sectionTitle}>Pedidos Enviados</Text>
            {redemptions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🧾</Text>
                <Text style={styles.emptyCardTitle}>Nenhum pedido de resgate</Text>
                <Text style={styles.emptyCardSub}>Os prêmios que você resgatar vão aparecer aqui!</Text>
              </View>
            ) : (
              redemptions.map((r) => {
                const badge = getStatusBadge(r.status);
                return (
                  <View key={r.id} style={styles.redemptionCard}>
                    <Text style={styles.redemptionIcon}>{r.reward_icon || '🎁'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.redemptionTitle}>{r.reward_name || 'Prêmio'}</Text>
                      <Text style={styles.redemptionCost}>Custo: ⭐ {r.point_cost} pontos</Text>
                      <Text style={styles.redemptionDate}>
                        Solicitado em: {new Date(r.created_at).toLocaleDateString('pt-BR')}
                      </Text>
                      {r.reviewed_at ? <Text style={styles.redemptionDate}>Resolvido em: {new Date(r.reviewed_at).toLocaleString('pt-BR')}</Text> : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* ── LISTAGEM DE RECOMPENSAS DISPONÍVEIS ── */
          <View>
            <Text style={styles.sectionTitle}>Prêmios da Família</Text>
            {rewards.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🧸</Text>
                <Text style={styles.emptyCardTitle}>Nenhum prêmio cadastrado</Text>
                <Text style={styles.emptyCardSub}>Peça para os seus pais adicionarem prêmios na loja da família!</Text>
              </View>
            ) : (
              rewards.map((rew) => {
                const cost = Number(rew.point_cost ?? rew.points ?? 0);
                const canAfford = points.available >= cost;

                return (
                  <TouchableOpacity
                    key={rew.id}
                    style={[styles.rewardCard, !canAfford && styles.rewardCardCantAfford]}
                    onPress={() => handleRedeemReward(rew)}
                    disabled={busy || !!loadError}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.rewardIcon}>{rew.icon || '🎁'}</Text>
                    <View style={styles.rewardInfo}>
                      <Text style={styles.rewardTitle}>{rew.name}</Text>
                      {rew.description ? (
                        <Text style={styles.rewardDesc}>{rew.description}</Text>
                      ) : null}
                      <Text style={styles.rewardCost}>⭐ {cost} pontos</Text>
                    </View>
                    <View style={[styles.buyBtn, !canAfford && styles.buyBtnDisabled]}>
                      <Text style={styles.buyBtnText}>{busy ? 'Aguarde...' : canAfford ? 'Resgatar' : 'Bloqueado'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
      <StoreDialog dialog={dialog} onClose={() => { confirmationRef.current = false; setDialog(null); }} />
    </View>
  );
}

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
    paddingTop: 16,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  backBtnText: {
    fontSize: 24,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: -4,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: Colors.text,
    marginLeft: 8,
    flex: 1,
  },
  historyToggleBtn: {
    backgroundColor: Colors.primaryLighter,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
    borderRadius: Radii.full,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  historyToggleText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },

  pointsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    padding: 18,
    marginBottom: 24,
    ...Shadow.sm,
  },
  pointsLeft: {
    flex: 1,
  },
  pointsLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  pointsValue: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    color: Colors.primaryDark,
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  centerContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  emptyCardTitle: {
    fontSize: FontSize.base - 1,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  emptyCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  rewardCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    ...Shadow.sm,
  },
  rewardCardCantAfford: {
    opacity: 0.75,
  },
  rewardIcon: {
    fontSize: 36,
    marginRight: 16,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: FontSize.base - 1,
    fontWeight: '800',
    color: Colors.text,
  },
  rewardDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 15,
  },
  rewardCost: {
    fontSize: FontSize.xs + 1,
    color: Colors.primary,
    fontWeight: '800',
    marginTop: 4,
  },
  buyBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  buyBtnDisabled: {
    backgroundColor: Colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  buyBtnText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '900',
  },

  redemptionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    ...Shadow.sm,
    gap: 12,
  },
  redemptionIcon: {
    fontSize: 30,
  },
  redemptionTitle: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  redemptionCost: {
    fontSize: FontSize.xs - 1,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  redemptionDate: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: Radii.full,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
});
