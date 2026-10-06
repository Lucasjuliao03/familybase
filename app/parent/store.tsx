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
  Modal,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import api from '../../src/services/api';

export default function ParentStoreScreen() {
  const router = useRouter();

  const [tab, setTab] = useState<'rewards' | 'redemptions'>('rewards');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Estados dos dados
  const [rewards, setRewards] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  // Estados dos Modais
  const [showRewardModal, setShowRewardModal] = useState<boolean>(false);
  const [editingReward, setEditingReward] = useState<any | null>(null);

  // Campos do Formulário de Recompensa
  const [rewardName, setRewardName] = useState<string>('');
  const [rewardDescription, setRewardDescription] = useState<string>('');
  const [rewardIcon, setRewardIcon] = useState<string>('🎁');
  const [rewardCost, setRewardCost] = useState<string>('');
  const [rewardIsActive, setRewardIsActive] = useState<boolean>(true);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const [rewardsRes, redemptionsRes] = await Promise.all([
        api.get('/allowance/rewards/list').catch(() => ({ data: [] })),
        api.get('/allowance/redemptions/list').catch(() => ({ data: [] })),
      ]);

      setRewards(rewardsRes?.data || []);
      setRedemptions(redemptionsRes?.data || []);
    } catch (err) {
      console.error('[ParentStore] Erro ao carregar dados da loja:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Abrir Modal de Criação
  const handleNewReward = () => {
    setEditingReward(null);
    setRewardName('');
    setRewardDescription('');
    setRewardIcon('🎁');
    setRewardCost('100');
    setRewardIsActive(true);
    setShowRewardModal(true);
  };

  // Abrir Modal de Edição
  const handleEditReward = (reward: any) => {
    setEditingReward(reward);
    setRewardName(reward.name || '');
    setRewardDescription(reward.description || '');
    setRewardIcon(reward.icon || '🎁');
    setRewardCost(String(reward.point_cost || reward.points || '100'));
    setRewardIsActive(reward.is_active !== false);
    setShowRewardModal(true);
  };

  // Salvar Recompensa (Nova ou Editada)
  const handleSaveReward = async () => {
    if (!rewardName.trim() || !rewardCost.trim()) {
      Alert.alert('Aviso', 'Preencha os campos obrigatórios.');
      return;
    }
    const cost = parseInt(rewardCost, 10);
    if (isNaN(cost) || cost <= 0) {
      Alert.alert('Aviso', 'O custo em pontos deve ser um número maior que zero.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: rewardName,
        description: rewardDescription || null,
        icon: rewardIcon || '🎁',
        point_cost: cost,
        is_active: rewardIsActive,
        available: rewardIsActive,
      };

      if (editingReward?.id) {
        await api.put(`/allowance/rewards/${editingReward.id}`, payload);
        Alert.alert('Sucesso!', 'Recompensa atualizada com sucesso!');
      } else {
        await api.post('/allowance/rewards', payload);
        Alert.alert('Sucesso!', 'Nova recompensa criada com sucesso!');
      }

      setShowRewardModal(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar a recompensa.');
    } finally {
      setLoading(false);
    }
  };

  // Deletar Recompensa
  const handleDeleteReward = (rewardId: string, rewardName: string) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir "${rewardName}" permanentemente?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.delete(`/allowance/rewards/${rewardId}`);
              Alert.alert('Sucesso!', 'Recompensa excluída.');
              loadData(true);
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Não foi possível excluir a recompensa.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Decidir sobre Resgate (Aprovar / Rejeitar)
  const handleReviewRedemption = (redemptionId: string, childName: string, rewardName: string, approved: boolean) => {
    Alert.alert(
      approved ? 'Aprovar Resgate' : 'Recusar Resgate',
      `Deseja ${approved ? 'aprovar' : 'recusar'} o pedido de ${childName} para resgatar "${rewardName}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: approved ? 'Aprovar' : 'Recusar',
          style: approved ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.put(`/allowance/redemptions/${redemptionId}/approve`, { approved });
              Alert.alert(
                approved ? 'Aprovado! ✓' : 'Recusado! ✕',
                approved 
                  ? `O resgate de ${childName} foi liberado. Estrelas foram deduzidas.` 
                  : 'O pedido de resgate foi reprovado.'
              );
              loadData(true);
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Não foi possível processar a decisão.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { label: 'Entregue ✓', color: Colors.success, bg: '#d1fae5' };
      case 'rejected':
        return { label: 'Recusado ✕', color: Colors.danger, bg: '#fee2e2' };
      default:
        return { label: 'Aguardando ⏳', color: Colors.warning, bg: '#fef3c7' };
    }
  };

  const pendingRedemptions = useMemo(() => {
    return redemptions.filter((r) => r.status === 'pending');
  }, [redemptions]);

  const historyRedemptions = useMemo(() => {
    return redemptions.filter((r) => r.status !== 'pending').slice(0, 15);
  }, [redemptions]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header padronizado */}
      <ModuleHeader
        title="Loja de Recompensas"
        emoji="🛍️"
        subtitle="Gerencie prêmios e resgates de pontos"
        onBack={() => router.back()}
      />

      {/* Abas */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'rewards' && styles.tabBtnActive]}
          onPress={() => setTab('rewards')}
        >
          <Text style={[styles.tabBtnText, tab === 'rewards' && styles.tabBtnTextActive]}>🧸 Prêmios Ativos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'redemptions' && styles.tabBtnActive]}
          onPress={() => setTab('redemptions')}
        >
          <Text style={[styles.tabBtnText, tab === 'redemptions' && styles.tabBtnTextActive]}>
            📥 Pedidos {pendingRedemptions.length > 0 && `(${pendingRedemptions.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando Loja...</Text>
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
          {/* ── CARD INFORMATIVO ── */}
          <Card style={styles.infoCard} shadow="sm">
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🎁</Text>
            <Text style={styles.infoCardTitle}>Loja Familiar</Text>
            <Text style={styles.infoCardText}>
              Cadastre recompensas para estimular seus filhos. Eles trocam pontos acumulados por esses prêmios.
            </Text>
          </Card>

          {/* ── ABA 1: GERENCIAR PRÊMIOS ── */}
          {tab === 'rewards' && (
            <View>
              <View style={styles.flexRowBetween}>
                <Text style={styles.sectionTitle}>Prêmios Cadastrados</Text>
                <TouchableOpacity style={styles.btnAction} onPress={handleNewReward}>
                  <Text style={styles.btnActionText}>+ Novo Prêmio</Text>
                </TouchableOpacity>
              </View>

              {rewards.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🧸</Text>
                  <Text style={styles.emptyTitle}>Nenhum prêmio cadastrado</Text>
                  <Text style={styles.emptySub}>Cadastre seu primeiro prêmio para motivar os filhos! (Ex: Tempo de tela, sorvete, etc.)</Text>
                </View>
              ) : (
                rewards.map((rew) => (
                  <Card key={rew.id} style={styles.rewardCard}>
                    <Text style={styles.rewardIcon}>{rew.icon || '🎁'}</Text>
                    <View style={styles.rewardInfo}>
                      <View style={styles.flexRowBetween}>
                        <Text style={styles.rewardTitle}>{rew.name}</Text>
                        <Badge
                          label={rew.is_active !== false ? 'Disponível' : 'Indisponível'}
                          variant={rew.is_active !== false ? 'success' : 'primary'}
                        />
                      </View>
                      {rew.description ? (
                        <Text style={styles.rewardDesc}>{rew.description}</Text>
                      ) : null}
                      <Text style={styles.rewardCost}>⭐ {rew.point_cost ?? rew.points ?? 0} XP</Text>
                      
                      <View style={styles.rewardActionsRow}>
                        <TouchableOpacity
                          style={styles.rewardEditBtn}
                          onPress={() => handleEditReward(rew)}
                        >
                          <Text style={styles.rewardEditBtnText}>✏️ Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rewardDeleteBtn}
                          onPress={() => handleDeleteReward(rew.id, rew.name)}
                        >
                          <Text style={styles.rewardDeleteBtnText}>✕ Excluir</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          {/* ── ABA 2: APROVAR PEDIDOS DE RESGATE ── */}
          {tab === 'redemptions' && (
            <View>
              <Text style={styles.sectionTitle}>Pedidos de Resgate Pendentes</Text>
              {pendingRedemptions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
                  <Text style={styles.emptyTitle}>Nenhum pedido pendente</Text>
                  <Text style={styles.emptySub}>Todos os resgates de prêmios solicitados pelos filhos estão em dia!</Text>
                </View>
              ) : (
                pendingRedemptions.map((r) => (
                  <Card key={r.id} style={styles.redemptionRequestCard}>
                    <Text style={styles.redemptionRequestIcon}>{r.reward_icon || '🎁'}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.flexRowBetween}>
                        <Text style={styles.redemptionReqTitle}>{r.reward_name}</Text>
                        <Text style={styles.redemptionReqCost}>⭐ {r.reward_point_cost ?? r.point_cost} XP</Text>
                      </View>
                      <Text style={styles.redemptionReqChild}>Solicitado por: <Text style={{ fontWeight: '800' }}>{r.child_name}</Text></Text>
                      <Text style={styles.redemptionReqDate}>Data do pedido: {new Date(r.created_at).toLocaleDateString('pt-BR')}</Text>

                      <View style={styles.redemptionReqActions}>
                        <TouchableOpacity
                          style={[styles.btnReview, styles.btnApprove]}
                          onPress={() => handleReviewRedemption(r.id, r.child_name, r.reward_name, true)}
                        >
                          <Text style={styles.btnReviewText}>Aprovar ✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btnReview, styles.btnReject]}
                          onPress={() => handleReviewRedemption(r.id, r.child_name, r.reward_name, false)}
                        >
                          <Text style={[styles.btnReviewText, { color: Colors.danger }]}>Recusar ✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                ))
              )}

              {/* Histórico processado */}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Histórico de Resgates Resolvidos</Text>
              {historyRedemptions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySub}>Nenhum resgate histórico.</Text>
                </View>
              ) : (
                historyRedemptions.map((r) => {
                  const badge = getStatusBadge(r.status);
                  return (
                    <Card key={r.id} style={styles.redemptionHistoryCard}>
                      <Text style={styles.redemptionHistIcon}>{r.reward_icon || '🎁'}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={styles.flexRowBetween}>
                          <Text style={styles.redemptionHistTitle}>{r.reward_name}</Text>
                          <View style={[styles.smallBadge, { backgroundColor: badge.bg }]}>
                            <Text style={[styles.smallBadgeText, { color: badge.color }]}>{badge.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.redemptionHistChild}>Filho: {r.child_name}</Text>
                        <Text style={styles.redemptionHistCost}>Custo: ⭐ {r.reward_point_cost ?? r.point_cost} XP</Text>
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── MODAL CRIAR/EDITAR PRÊMIO ── */}
      <Modal
        visible={showRewardModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRewardModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingReward ? '✏️ Editar Prêmio' : '🎁 Novo Prêmio / Recompensa'}
              </Text>
              <TouchableOpacity onPress={() => setShowRewardModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Emoji/Ícone do Prêmio *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 🎮, 🍦, 🧸, 🎬"
                placeholderTextColor={Colors.textMuted}
                value={rewardIcon}
                onChangeText={setRewardIcon}
                maxLength={4}
              />

              <Text style={styles.label}>Nome do Prêmio *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 1 Hora de Videogame"
                placeholderTextColor={Colors.textMuted}
                value={rewardName}
                onChangeText={setRewardName}
              />

              <Text style={styles.label}>Custo em XP/Estrelas *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 150"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={rewardCost}
                onChangeText={setRewardCost}
              />

              <Text style={styles.label}>Descrição/Instruções (opcional)</Text>
              <TextInput
                style={[styles.textarea, { height: 70 }]}
                placeholder="Ex: Válido aos finais de semana após cumprir deveres."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={rewardDescription}
                onChangeText={setRewardDescription}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Disponível para resgate?</Text>
                <Switch
                  value={rewardIsActive}
                  onValueChange={setRewardIsActive}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity 
                style={styles.btnSubmitModal}
                onPress={handleSaveReward}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSubmitModalText}>Salvar Recompensa 🚀</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderColor: 'transparent',
  },
  tabBtnActive: {
    borderColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.primary,
    fontWeight: '900',
  },

  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 110 },

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

  infoCard: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  infoCardTitle: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  infoCardText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },

  flexRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.md - 1,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
  },
  btnAction: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...Shadow.sm,
  },
  btnActionText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '800',
  },

  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    ...Shadow.sm,
  },
  emptyTitle: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  rewardCard: {
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rewardIcon: {
    fontSize: 32,
    marginTop: 2,
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
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '800',
    marginTop: 6,
  },
  rewardActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  rewardEditBtn: {
    paddingVertical: 4,
  },
  rewardEditBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  rewardDeleteBtn: {
    paddingVertical: 4,
  },
  rewardDeleteBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.danger,
  },

  // Redemptions Styles
  redemptionRequestCard: {
    marginBottom: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  redemptionRequestIcon: {
    fontSize: 32,
    marginTop: 2,
  },
  redemptionReqTitle: {
    fontSize: FontSize.xs + 2,
    fontWeight: '900',
    color: Colors.text,
  },
  redemptionReqCost: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  redemptionReqChild: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  redemptionReqDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  redemptionReqActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  btnReview: {
    flex: 1,
    borderRadius: Radii.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  btnApprove: {
    backgroundColor: Colors.primary,
  },
  btnReject: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  btnReviewText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '800',
  },

  redemptionHistoryCard: {
    marginBottom: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  redemptionHistIcon: {
    fontSize: 28,
  },
  redemptionHistTitle: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  redemptionHistChild: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  redemptionHistCost: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '800',
    marginTop: 1,
  },
  smallBadge: {
    borderRadius: Radii.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  smallBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },

  // Settings Card (ABA 3)
  settingsCard: {
    marginBottom: 12,
    padding: 16,
  },
  settingsChildName: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 10,
  },
  settingsInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  settingsInfoCol: {
    flex: 1,
    backgroundColor: Colors.bg,
    padding: 8,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsInfoLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  settingsInfoVal: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
  settingsEmptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  btnEditSettings: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnEditSettingsText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
  },

  // Modais
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.base,
    fontWeight: '900',
    color: Colors.text,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  modalBody: {
    paddingTop: 16,
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.bg,
    marginBottom: 16,
  },
  textarea: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.bg,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  switchLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  btnSubmitModal: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.btn,
    marginBottom: 20,
  },
  btnSubmitModalText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  cycleHistChild: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  cycleHistDate: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cycleHistReviewNote: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  cycleHistAmt: {
    fontSize: FontSize.sm,
    fontWeight: '900',
    color: Colors.text,
  },
});
