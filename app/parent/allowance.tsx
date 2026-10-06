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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import api from '../../src/services/api';

export default function ParentAllowanceScreen() {
  const router = useRouter();
  const { family } = useAuth();

  const getStatusBadgeProps = (status: string) => {
    switch (status) {
      case 'approved':
        return { label: 'Aprovada ✅', color: Colors.success, bg: '#d1fae5' };
      case 'rejected':
        return { label: 'Recusada ✕', color: Colors.danger, bg: '#fee2e2' };
      default:
        return { label: 'Aguardando ⏳', color: Colors.warning, bg: '#fef3c7' };
    }
  };

  const [tab, setTab] = useState<'allowance' | 'settings' | 'piggy'>('allowance');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Estados dos dados
  const [children, setChildren] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [piggyRequests, setPiggyRequests] = useState<any[]>([]);

  // Estados dos Modais
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsForm, setSettingsForm] = useState<any>({});

  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [adjustForm, setAdjustForm] = useState({
    child_id: '',
    type: 'credit',
    amount: '',
    description: '',
  });

  const [reviewModalVisible, setReviewModalVisible] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reviewApproved, setReviewApproved] = useState<boolean>(true);
  const [reviewNote, setReviewNote] = useState<string>('');

  // Estados para Fechamento de Ciclo
  const [closeCycleModalVisible, setCloseCycleModalVisible] = useState<boolean>(false);
  const [closeCycleStep, setCloseCycleStep] = useState<1 | 2>(1);
  const [closeCycleData, setCloseCycleData] = useState<{
    cycleId: string;
    childId: string;
    childName: string;
    currentBalance: number;
    baseAmount: number;
  } | null>(null);
  const [keepPreviousBase, setKeepPreviousBase] = useState<boolean>(true);

  // Estados para Extrato Completo
  const [fullStatementModalVisible, setFullStatementModalVisible] = useState<boolean>(false);
  const [selectedChildForStatement, setSelectedChildForStatement] = useState<{ id: string; name: string } | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<'all' | '30' | '90'>('all');
  const [filterCycle, setFilterCycle] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const formatCurrency = (val: number, currencyCode = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode }).format(val);
  };

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const [rSets, rCycles, rCh, rTrans, rPiggy] = await Promise.all([
        api.get('/allowance/settings').catch(() => ({ data: [] })),
        api.get('/allowance/cycles').catch(() => ({ data: [] })),
        api.get('/families/children').catch(() => ({ data: [] })),
        api.get('/allowance/transactions').catch(() => ({ data: [] })),
        api.get('/allowance/piggy-requests').catch(() => ({ data: [] })),
      ]);

      setSettings(rSets?.data || []);
      setCycles(rCycles?.data || []);
      setChildren(rCh?.data || []);
      setTransactions(rTrans?.data || []);
      setPiggyRequests(rPiggy?.data || []);
    } catch (err) {
      console.error('[ParentAllowance] Erro ao carregar dados:', err);
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

  const getOpenCycle = (childId: string) => {
    return cycles.find((c) => c.child_id === childId && c.status === 'open');
  };

  // Ajuste Manual de Saldo
  const handleSaveAdjustment = async () => {
    if (!adjustForm.child_id || !adjustForm.amount.trim() || !adjustForm.description.trim()) {
      Alert.alert('Aviso', 'Preencha todos os campos obrigatórios.');
      return;
    }
    const val = parseFloat(adjustForm.amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Aviso', 'Insira um valor válido maior que zero.');
      return;
    }

    try {
      setLoading(true);
      const cycle = getOpenCycle(adjustForm.child_id);
      
      await api.post('/allowance/transactions/manual', {
        child_id: adjustForm.child_id,
        cycle_id: cycle?.id || '',
        type: adjustForm.type,
        amount: val,
        description: adjustForm.description,
      });

      Alert.alert('Sucesso!', 'Ajuste de saldo lançado com sucesso! 💰');
      setShowAdjustModal(false);
      setAdjustForm({ child_id: '', type: 'credit', amount: '', description: '' });
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível registrar o ajuste.');
    } finally {
      setLoading(false);
    }
  };

  // Salvar Configurações de Mesada do Filho
  const handleSaveSettings = async () => {
    if (!settingsForm.child_id) return;

    // Converte os valores de string para número antes de enviar à API
    const baseAmountClean = parseFloat(String(settingsForm.base_amount || '0').replace(',', '.')) || 0;
    const maxBonusClean = parseFloat(String(settingsForm.max_bonus || '0').replace(',', '.')) || 0;
    const maxDiscountClean = parseFloat(String(settingsForm.max_discount || '0').replace(',', '.')) || 0;

    const payload = {
      ...settingsForm,
      base_amount: baseAmountClean,
      max_bonus: maxBonusClean,
      max_discount: maxDiscountClean,
      allow_accumulation: !!settingsForm.allow_accumulation,
      allow_negative_balance: !!settingsForm.allow_negative_balance,
      is_active: !!settingsForm.is_active,
      require_parent_approval: !!settingsForm.require_parent_approval,
    };

    try {
      setLoading(true);
      await api.put(`/allowance/settings/${settingsForm.child_id}`, payload);
      // Garante ou abre o ciclo corrente para o filho
      await api.post('/allowance/cycles/current', { child_id: settingsForm.child_id });
      
      Alert.alert('Sucesso!', 'Configurações de mesada salvas com sucesso! ⚙️');
      setShowSettingsModal(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar as configurações.');
    } finally {
      setLoading(false);
    }
  };

  // Fechar Ciclo de Mesada (Abre o modal de duas etapas)
  const handleCloseCycle = (cycleId: string, childId: string, childName: string, currentBalance: number, baseAmount: number) => {
    setCloseCycleData({ cycleId, childId, childName, currentBalance, baseAmount });
    setCloseCycleStep(1);
    setKeepPreviousBase(true);
    setCloseCycleModalVisible(true);
  };

  const handleConfirmClosePay = async () => {
    if (!closeCycleData) return;
    try {
      setLoading(true);
      await api.post(`/allowance/cycles/${closeCycleData.cycleId}/close`, {
        action: 'pay'
      });
      Alert.alert('Ciclo Pago e Encerrado! 💸', `O ciclo de ${closeCycleData.childName} foi pago e encerrado com sucesso.`);
      setCloseCycleModalVisible(false);
      setCloseCycleData(null);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível fechar o ciclo.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCloseRollover = async () => {
    if (!closeCycleData) return;
    try {
      setLoading(true);
      await api.post(`/allowance/cycles/${closeCycleData.cycleId}/close`, {
        action: 'rollover',
        keep_previous_base: keepPreviousBase
      });
      Alert.alert('Ciclo Transferido! 🔄', `O valor foi adicionado ao ciclo do próximo mês de ${closeCycleData.childName} com sucesso.`);
      setCloseCycleModalVisible(false);
      setCloseCycleData(null);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível realizar a transferência.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToStep2 = () => {
    setCloseCycleStep(2);
  };

  const handleOpenFullStatement = (childId: string, childName: string) => {
    setSelectedChildForStatement({ id: childId, name: childName });
    setFilterPeriod('all');
    setFilterCycle('all');
    setFilterStatus('all');
    setFullStatementModalVisible(true);
  };

  const filteredTransactions = useMemo(() => {
    if (!selectedChildForStatement) return [];
    
    return transactions.filter((t) => {
      if (t.child_id !== selectedChildForStatement.id) return false;
      
      if (filterPeriod !== 'all') {
        const days = parseInt(filterPeriod, 10);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        if (new Date(t.created_at) < cutoffDate) return false;
      }
      
      if (filterCycle !== 'all') {
        if (t.cycle_id !== filterCycle) return false;
      }
      
      if (filterStatus !== 'all') {
        if (filterStatus === 'paid') {
          if (t.status !== 'paid' && t.origin !== 'payment') return false;
        } else if (filterStatus === 'pending') {
          if (t.status !== 'pending' && t.status !== 'waiting') return false;
        } else if (filterStatus === 'transferred') {
          if (t.description?.toLowerCase().includes('transferido') === false) return false;
        }
      }
      
      return true;
    });
  }, [transactions, selectedChildForStatement, filterPeriod, filterCycle, filterStatus]);

  const childCycles = useMemo(() => {
    if (!selectedChildForStatement) return [];
    return cycles.filter((c) => c.child_id === selectedChildForStatement.id);
  }, [cycles, selectedChildForStatement]);

  // Pagar Ciclo (Mudar status de fechado para pago)
  const handlePayCycle = (cycleId: string, childName: string, amount: number) => {
    Alert.alert(
      'Confirmar Pagamento',
      `Deseja registrar o pagamento de ${formatCurrency(amount)} referente ao ciclo fechado de ${childName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Pagar',
          onPress: async () => {
            try {
              setLoading(true);
              await api.post(`/allowance/cycles/${cycleId}/pay`);
              Alert.alert('Pago!', 'O pagamento foi registrado com sucesso.');
              loadData(true);
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Não foi possível registrar o pagamento.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Revisar/Decidir Solicitação de Cofrinho da Criança (Piggy Request)
  const handleStartReviewRequest = (req: any, approved: boolean) => {
    setSelectedRequest(req);
    setReviewApproved(approved);
    setReviewNote('');
    setReviewModalVisible(true);
  };

  const handleConfirmReviewRequest = async () => {
    if (!selectedRequest) return;
    try {
      setLoading(true);
      await api.put(`/allowance/piggy-requests/${selectedRequest.id}/review`, {
        approved: reviewApproved,
        review_note: reviewNote.trim() || (reviewApproved ? 'Solicitação aprovada pelo responsável' : 'Solicitação reprovada pelo responsável'),
      });

      Alert.alert(
        reviewApproved ? 'Aprovada! ✅' : 'Reprovada! ✕',
        `A solicitação de resgate de ${selectedRequest.child_name} foi processada.`
      );
      setReviewModalVisible(false);
      setSelectedRequest(null);
      setReviewNote('');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível processar a decisão.');
    } finally {
      setLoading(false);
    }
  };

  const pendingRequests = useMemo(() => {
    return piggyRequests.filter((r) => r.status === 'pending');
  }, [piggyRequests]);

  const historyRequests = useMemo(() => {
    return piggyRequests.filter((r) => r.status !== 'pending').slice(0, 10);
  }, [piggyRequests]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header padronizado */}
      <ModuleHeader
        title="Gestão de Mesadas"
        emoji="💰"
        subtitle="Gerencie saldos, metas e resgates"
        onBack={() => router.back()}
      />

      {/* Abas */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'allowance' && styles.tabBtnActive]}
          onPress={() => setTab('allowance')}
        >
          <Text style={[styles.tabBtnText, tab === 'allowance' && styles.tabBtnTextActive]}>💰 Visão Geral</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'settings' && styles.tabBtnActive]}
          onPress={() => setTab('settings')}
        >
          <Text style={[styles.tabBtnText, tab === 'settings' && styles.tabBtnTextActive]}>⚙️ Configurar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'piggy' && styles.tabBtnActive]}
          onPress={() => setTab('piggy')}
        >
          <Text style={[styles.tabBtnText, tab === 'piggy' && styles.tabBtnTextActive]}>
            🐷 Resgates {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando gestão de mesadas...</Text>
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
          {/* ── ABA 1: VISÃO GERAL DE MESADAS ── */}
          {tab === 'allowance' && (
            <View>
              <View style={styles.flexRowBetween}>
                <Text style={styles.sectionTitle}>Saldos Atuais dos Filhos</Text>
                <TouchableOpacity 
                  style={styles.btnAction} 
                  onPress={() => {
                    setAdjustForm({ child_id: children[0]?.id || '', type: 'credit', amount: '', description: '' });
                    setShowAdjustModal(true);
                  }}
                >
                  <Text style={styles.btnActionText}>+ Ajuste Manual</Text>
                </TouchableOpacity>
              </View>

              {children.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>👦👧</Text>
                  <Text style={styles.emptyTitle}>Nenhum filho cadastrado</Text>
                  <Text style={styles.emptySub}>Cadastre os filhos no perfil para iniciar as mesadas.</Text>
                </View>
              ) : (
                children.map((child) => {
                  const set = settings.find((s) => s.child_id === child.id);
                  const cycle = getOpenCycle(child.id);

                  if (!set || !cycle) {
                    return (
                      <Card key={child.id} style={[styles.childCard, { borderLeftColor: child.color || Colors.primary }]}>
                        <View style={styles.flexRowBetween}>
                          <Text style={styles.childName}>{child.name}</Text>
                          <Badge label="Sem Mesada" variant="primary" />
                        </View>
                        <Text style={styles.childCardSub}>Mesada não configurada ou sem ciclo aberto.</Text>
                        <TouchableOpacity
                          style={styles.btnCardConfigure}
                          onPress={() => {
                            setTab('settings');
                            setSettingsForm({
                              child_id: child.id,
                              model_type: 'hybrid',
                              base_amount: '10.00',
                              currency: 'BRL',
                              cycle_closing_day: 30,
                              payment_day: 5,
                              allow_accumulation: true,
                              allow_negative_balance: false,
                              max_bonus: '50.00',
                              max_discount: '50.00',
                              require_parent_approval: true,
                              is_active: true,
                            });
                            setShowSettingsModal(true);
                          }}
                        >
                          <Text style={styles.btnCardConfigureText}>Configurar Agora</Text>
                        </TouchableOpacity>
                      </Card>
                    );
                  }

                  const prevFinal = Number(cycle.opening_balance ?? 0);
                  const expectedBase = set.model_type !== 'accumulative' ? Number(cycle.base_amount ?? 0) : 0;
                  const bonus = Number(cycle.total_bonus ?? 0);
                  const manual = Number(cycle.manual_adjustments ?? 0);
                  const discount = Number(cycle.total_discount ?? 0);
                  const currentBalance = prevFinal + expectedBase + bonus + manual - discount;

                  const childTx = transactions
                    .filter((t) => {
                      if (t.child_id !== child.id) return false;
                      if (!set.last_cycle_closed_at) return true;
                      return new Date(t.created_at) > new Date(set.last_cycle_closed_at);
                    })
                    .slice(0, 3);

                  return (
                    <Card key={child.id} style={[styles.childCard, { borderLeftColor: child.color || Colors.primary }]}>
                      <View style={styles.flexRowBetween}>
                        <Text style={styles.childName}>{child.name}</Text>
                        <Badge
                          label={
                            set.model_type === 'fixed'
                              ? 'Fixa'
                              : set.model_type === 'accumulative'
                              ? 'Acumulativa'
                              : 'Híbrida'
                          }
                          variant="primary"
                        />
                      </View>

                      {/* Info grid de saldo */}
                      <View style={styles.balanceGrid}>
                        <View style={styles.balanceBox}>
                          <Text style={styles.balanceBoxLabel}>Saldo Anterior</Text>
                          <Text style={styles.balanceBoxVal}>{formatCurrency(prevFinal, set.currency)}</Text>
                        </View>
                        <View style={styles.balanceBox}>
                          <Text style={styles.balanceBoxLabel}>Previsão do Mês</Text>
                          <Text style={[styles.balanceBoxVal, { color: Colors.primary, fontSize: FontSize.md + 1 }]}>
                            {formatCurrency(Math.max(currentBalance, 0), set.currency)}
                          </Text>
                        </View>
                      </View>

                      {/* Bônus / Descontos acumulados */}
                      <View style={styles.bonusRow}>
                        <View style={styles.bonusBox}>
                          <Text style={styles.bonusBoxLabel}>Bônus</Text>
                          <Text style={[styles.bonusBoxVal, { color: Colors.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            + {formatCurrency(bonus + (manual > 0 ? manual : 0), set.currency)}
                          </Text>
                        </View>
                        <View style={styles.bonusBox}>
                          <Text style={styles.bonusBoxLabel}>Descontos</Text>
                          <Text style={[styles.bonusBoxVal, { color: Colors.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            − {formatCurrency(discount + (manual < 0 ? Math.abs(manual) : 0), set.currency)}
                          </Text>
                        </View>
                      </View>

                      {/* Miniextrato */}
                      <View style={styles.miniTxContainer}>
                        <Text style={styles.miniTxHeader}>Extrato Recente</Text>
                        {childTx.length === 0 ? (
                          <Text style={styles.miniTxEmpty}>Nenhuma movimentação recente neste ciclo.</Text>
                        ) : (
                          childTx.map((tx) => {
                            const isCredit = tx.type === 'credit';
                            return (
                              <View key={tx.id} style={styles.miniTxRow}>
                                <Text style={styles.miniTxDate}>
                                  {new Date(tx.created_at).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                                </Text>
                                <Text style={styles.miniTxTitle} numberOfLines={1}>
                                  {tx.description || (isCredit ? 'Entrada' : 'Saída')}
                                </Text>
                                <Text style={[styles.miniTxAmt, { color: isCredit ? Colors.success : Colors.danger }]}>
                                  {isCredit ? '+' : '-'} {formatCurrency(tx.amount, set.currency)}
                                </Text>
                              </View>
                            );
                          })
                        )}
                        
                        <TouchableOpacity
                          style={styles.btnFullStatementLink}
                          onPress={() => handleOpenFullStatement(child.id, child.name)}
                        >
                          <Text style={styles.btnFullStatementLinkText}>🧾 Ver Extrato Completo</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Botões rápidos */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => handleCloseCycle(cycle.id, child.id, child.name, currentBalance, set.base_amount)}
                        >
                          <Text style={styles.cardActionBtnText}>🔒 Fechar Ciclo</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  );
                })
              )}

              {/* Histórico de Ciclos Fechados */}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Histórico de Ciclos Fechados</Text>
              {cycles.filter((c) => c.status !== 'open').length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySub}>Nenhum ciclo fechado no histórico.</Text>
                </View>
              ) : (
                cycles
                  .filter((c) => c.status !== 'open')
                  .slice(0, 6)
                  .map((c) => {
                    const isClosed = c.status === 'closed';
                    return (
                      <Card key={c.id} style={styles.cycleHistoryCard}>
                        <View style={styles.flexRowBetween}>
                          <View>
                            <Text style={styles.cycleHistChild}>{c.child_name || 'Filho'}</Text>
                            <Text style={styles.cycleHistDate}>Competência: {c.month}/{c.year}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.cycleHistAmt}>{formatCurrency(c.final_amount)}</Text>
                            <Badge 
                              label={isClosed ? 'Aguardando Pagar' : 'Pago'} 
                              variant={isClosed ? 'warning' : 'success'} 
                              style={{ marginTop: 4 }}
                            />
                          </View>
                        </View>
                        {isClosed && (
                          <TouchableOpacity
                            style={styles.btnPayCycle}
                            onPress={() => handlePayCycle(c.id, c.child_name || 'Filho', c.final_amount)}
                          >
                            <Text style={styles.btnPayCycleText}>💸 Marcar como Pago</Text>
                          </TouchableOpacity>
                        )}
                      </Card>
                    );
                  })
              )}
            </View>
          )}

          {/* ── ABA 2: CONFIGURAÇÕES DE MESADA ── */}
          {tab === 'settings' && (
            <View>
              <Text style={styles.sectionTitle}>Configurações de Mesada</Text>
              {children.map((child) => {
                const set = settings.find((s) => s.child_id === child.id);
                return (
                  <Card key={child.id} style={styles.settingsCard}>
                    <Text style={styles.settingsChildName}>👦👧 {child.name}</Text>
                    {set ? (
                      <View style={styles.settingsInfoRow}>
                        <View style={styles.settingsInfoCol}>
                          <Text style={styles.settingsInfoLabel}>Modelo</Text>
                          <Text style={styles.settingsInfoVal}>
                            {set.model_type === 'fixed'
                              ? 'Fixa'
                              : set.model_type === 'accumulative'
                              ? 'Acumulativa'
                              : 'Híbrida'}
                          </Text>
                        </View>
                        <View style={styles.settingsInfoCol}>
                          <Text style={styles.settingsInfoLabel}>Valor Base</Text>
                          <Text style={styles.settingsInfoVal}>{formatCurrency(set.base_amount, set.currency)}</Text>
                        </View>
                        <View style={styles.settingsInfoCol}>
                          <Text style={styles.settingsInfoLabel}>Status</Text>
                          <Text style={styles.settingsInfoVal}>{set.is_active ? 'Ativa' : 'Desativada'}</Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.settingsEmptyText}>Mesada ainda não configurada.</Text>
                    )}

                    <TouchableOpacity
                      style={styles.btnEditSettings}
                      onPress={() => {
                        if (set) {
                          setSettingsForm({
                            ...set,
                            base_amount: set.base_amount != null ? String(set.base_amount) : '0.00',
                            max_bonus: set.max_bonus != null ? String(set.max_bonus) : '0.00',
                            max_discount: set.max_discount != null ? String(set.max_discount) : '0.00',
                            allow_accumulation: set.allow_accumulation === true || set.allow_accumulation === 1,
                            allow_negative_balance: set.allow_negative_balance === true || set.allow_negative_balance === 1,
                            is_active: set.is_active === true || set.is_active === 1,
                            require_parent_approval: set.require_parent_approval === true || set.require_parent_approval === 1,
                          });
                        } else {
                          setSettingsForm({
                            child_id: child.id,
                            model_type: 'hybrid',
                            base_amount: '10.00',
                            currency: 'BRL',
                            cycle_closing_day: 30,
                            payment_day: 5,
                            allow_accumulation: true,
                            allow_negative_balance: false,
                            max_bonus: '50.00',
                            max_discount: '50.00',
                            require_parent_approval: true,
                            is_active: true,
                          });
                        }
                        setShowSettingsModal(true);
                      }}
                    >
                      <Text style={styles.btnEditSettingsText}>{set ? '✏️ Editar Mesada' : '⚙️ Configurar Mesada'}</Text>
                    </TouchableOpacity>
                  </Card>
                );
              })}
            </View>
          )}

          {/* ── ABA 3: PEDIDOS DE RESGATE ── */}
          {tab === 'piggy' && (
            <View>
              <Text style={styles.sectionTitle}>Solicitações Pendentes</Text>
              {pendingRequests.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
                  <Text style={styles.emptyTitle}>Nenhum resgate pendente</Text>
                  <Text style={styles.emptySub}>Todos os pedidos de cofrinho das crianças foram resolvidos!</Text>
                </View>
              ) : (
                pendingRequests.map((r) => (
                  <Card key={r.id} style={styles.piggyRequestCard}>
                    <View style={styles.flexRowBetween}>
                      <Text style={styles.piggyReqChild}>{r.child_name}</Text>
                      <Text style={styles.piggyReqAmt}>{formatCurrency(r.requested_amount)}</Text>
                    </View>
                    <Text style={styles.piggyReqMeta}>Meta: {r.goal_title || 'Outra'}</Text>
                    {r.message && (
                      <Text style={styles.piggyReqMsg}>Mensagem: "{r.message}"</Text>
                    )}

                    <View style={styles.piggyReqActions}>
                      <TouchableOpacity
                        style={[styles.btnReview, styles.btnApprove]}
                        onPress={() => handleStartReviewRequest(r, true)}
                      >
                        <Text style={styles.btnReviewText}>Aprovar ✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnReview, styles.btnReject]}
                        onPress={() => handleStartReviewRequest(r, false)}
                      >
                        <Text style={[styles.btnReviewText, { color: Colors.danger }]}>Rejeitar ✕</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))
              )}

              {/* Histórico recente */}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Histórico de Resgates</Text>
              {historyRequests.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySub}>Nenhum resgate histórico.</Text>
                </View>
              ) : (
                historyRequests.map((r) => {
                  const badge = getStatusBadgeProps(r.status);
                  return (
                    <Card key={r.id} style={styles.piggyHistoryCard}>
                      <View style={styles.flexRowBetween}>
                        <View>
                          <Text style={styles.cycleHistChild}>{r.child_name}</Text>
                          <Text style={styles.cycleHistDate}>Meta: {r.goal_title || 'Outra'}</Text>
                          {r.review_note && (
                            <Text style={styles.cycleHistReviewNote}>Nota: "{r.review_note}"</Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.cycleHistAmt}>{formatCurrency(r.requested_amount)}</Text>
                          <View style={[styles.smallBadge, { backgroundColor: badge.bg }]}>
                            <Text style={[styles.smallBadgeText, { color: badge.color }]}>{badge.label}</Text>
                          </View>
                        </View>
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

      {/* ── MODAL LANÇAR AJUSTE MANUAL ── */}
      <Modal
        visible={showAdjustModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdjustModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>➕ Ajuste Manual de Saldo</Text>
              <TouchableOpacity onPress={() => setShowAdjustModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Selecione o Filho *</Text>
              <View style={{ marginBottom: 16 }}>
                {children.length === 0 ? (
                  <Text style={{ fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' }}>
                    Nenhum filho cadastrado.
                  </Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {children.map((c) => {
                      const active = adjustForm.child_id === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.selectorChip,
                            active && styles.selectorChipActive
                          ]}
                          onPress={() => setAdjustForm((p) => ({ ...p, child_id: c.id }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.selectorChipText,
                            active && styles.selectorChipTextActive
                          ]}>
                            👦 {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <Text style={styles.label}>Tipo de Ajuste *</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[
                    styles.groupButton,
                    adjustForm.type === 'credit' && styles.groupButtonCreditActive
                  ]}
                  onPress={() => setAdjustForm((p) => ({ ...p, type: 'credit' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.groupButtonText,
                    adjustForm.type === 'credit' && styles.groupButtonTextActive
                  ]}>
                    💚 Crédito (+)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.groupButton,
                    adjustForm.type === 'debit' && styles.groupButtonDebitActive
                  ]}
                  onPress={() => setAdjustForm((p) => ({ ...p, type: 'debit' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.groupButtonText,
                    adjustForm.type === 'debit' && styles.groupButtonTextActive
                  ]}>
                    ❤️ Débito (-)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Valor (R$) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 25.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={adjustForm.amount}
                onChangeText={(text) => setAdjustForm((p) => ({ ...p, amount: text }))}
              />

              <Text style={styles.label}>Motivo / Descrição *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Mesada da semana / Bônus comportamento"
                placeholderTextColor={Colors.textMuted}
                value={adjustForm.description}
                onChangeText={(text) => setAdjustForm((p) => ({ ...p, description: text }))}
              />

              <TouchableOpacity 
                style={styles.btnSubmitModal}
                onPress={handleSaveAdjustment}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSubmitModalText}>Lançar Ajuste 🚀</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL EDITAR CONFIGURAÇÕES DE MESADA ── */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚙️ Configurar Parâmetros de Mesada</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Modelo de Mesada *</Text>
              <View style={{ gap: 10, marginBottom: 16 }}>
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    settingsForm.model_type === 'fixed' && styles.modelOptionCardActive
                  ]}
                  onPress={() => setSettingsForm((p: any) => ({ ...p, model_type: 'fixed' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.modelOptionTitle,
                    settingsForm.model_type === 'fixed' && styles.modelOptionTitleActive
                  ]}>
                    📌 Fixa
                  </Text>
                  <Text style={styles.modelOptionDesc}>
                    Valor estático por ciclo + bônus/descontos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    settingsForm.model_type === 'accumulative' && styles.modelOptionCardActive
                  ]}
                  onPress={() => setSettingsForm((p: any) => ({ ...p, model_type: 'accumulative' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.modelOptionTitle,
                    settingsForm.model_type === 'accumulative' && styles.modelOptionTitleActive
                  ]}>
                    📈 Acumulativa
                  </Text>
                  <Text style={styles.modelOptionDesc}>
                    Rende apenas com tarefas feitas (bônus por tarefa)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    settingsForm.model_type === 'hybrid' && styles.modelOptionCardActive
                  ]}
                  onPress={() => setSettingsForm((p: any) => ({ ...p, model_type: 'hybrid' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.modelOptionTitle,
                    settingsForm.model_type === 'hybrid' && styles.modelOptionTitleActive
                  ]}>
                    ⚡ Híbrida (Recomendado)
                  </Text>
                  <Text style={styles.modelOptionDesc}>
                    Valor base + bônus adicionais de tarefas realizadas
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Valor Base Mensal (R$) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 50.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={settingsForm.base_amount || ''}
                onChangeText={(text) => setSettingsForm((p: any) => ({ ...p, base_amount: text }))}
                editable={settingsForm.model_type !== 'accumulative'}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Acumular saldo pro mês seguinte?</Text>
                <Switch
                  value={!!settingsForm.allow_accumulation}
                  onValueChange={(val) => setSettingsForm((p: any) => ({ ...p, allow_accumulation: val }))}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Permitir saldo negativo?</Text>
                <Switch
                  value={!!settingsForm.allow_negative_balance}
                  onValueChange={(val) => setSettingsForm((p: any) => ({ ...p, allow_negative_balance: val }))}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <Text style={styles.label}>Limite Mensal de Bônus (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 50.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={settingsForm.max_bonus || ''}
                onChangeText={(text) => setSettingsForm((p: any) => ({ ...p, max_bonus: text }))}
              />

              <Text style={styles.label}>Limite Mensal de Descontos (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 50.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={settingsForm.max_discount || ''}
                onChangeText={(text) => setSettingsForm((p: any) => ({ ...p, max_discount: text }))}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Ativar mesada para este filho?</Text>
                <Switch
                  value={!!settingsForm.is_active}
                  onValueChange={(val) => setSettingsForm((p: any) => ({ ...p, is_active: val }))}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity 
                style={[styles.btnSubmitModal, { marginTop: 16 }]}
                onPress={handleSaveSettings}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSubmitModalText}>Salvar Parâmetros ⚙️</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL DECISÃO DE RESGATE (PIGGY REVIEW) ── */}
      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {reviewApproved ? '✓ Aprovar Retirada' : '✕ Rejeitar Retirada'}
              </Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {selectedRequest && (
                <View>
                  <Text style={styles.modalSubtitle}>
                    Revisando pedido de: <Text style={{ fontWeight: '800' }}>{selectedRequest.child_name}</Text>
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Valor: <Text style={{ fontWeight: '800' }}>{formatCurrency(selectedRequest.requested_amount)}</Text>
                  </Text>
                  
                  <Text style={styles.label}>Escreva uma mensagem de resposta para o filho:</Text>
                  <TextInput
                    style={styles.textarea}
                    placeholder={
                      reviewApproved 
                        ? 'Ex: Muito bem! Aprovado, pode comprar seu jogo!'
                        : 'Ex: Estude mais um pouco ou espere completar a meta!'
                    }
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={3}
                    value={reviewNote}
                    onChangeText={setReviewNote}
                  />

                  <TouchableOpacity 
                    style={[
                      styles.btnSubmitModal, 
                      { backgroundColor: reviewApproved ? Colors.success : Colors.danger }
                    ]}
                    onPress={handleConfirmReviewRequest}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnSubmitModalText}>
                      {reviewApproved ? 'Confirmar Aprovação ✓' : 'Confirmar Reprovação ✕'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL FECHAR CICLO DE MESADA (CloseCycleModal) ── */}
      <Modal
        visible={closeCycleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCloseCycleModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔒 Encerramento do Ciclo de Mesada</Text>
              <TouchableOpacity onPress={() => setCloseCycleModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {closeCycleData && (
                <View>
                  {/* Indicador de passos */}
                  <View style={styles.stepIndicator}>
                    <View style={[styles.stepDot, closeCycleStep === 1 && styles.stepDotActive]} />
                    <View style={[styles.stepDot, closeCycleStep === 2 && styles.stepDotActive]} />
                  </View>

                  {closeCycleStep === 1 ? (
                    <View>
                      <Text style={[styles.modalSubtitle, { textAlign: 'center', marginBottom: 16 }]}>
                        Como você deseja encerrar o ciclo atual de <Text style={{ fontWeight: '800' }}>{closeCycleData.childName}</Text>?
                      </Text>

                      <View style={styles.modalBalanceHighlight}>
                        <Text style={styles.modalBalanceHighlightLabel}>Saldo Acumulado do Ciclo</Text>
                        <Text style={styles.modalBalanceHighlightVal}>
                          {formatCurrency(closeCycleData.currentBalance)}
                        </Text>
                      </View>

                      <View style={{ gap: 12 }}>
                        {/* Opção 1: Marcar como Pago */}
                        <TouchableOpacity
                          style={[styles.radioOption, { borderColor: Colors.success }]}
                          onPress={handleConfirmClosePay}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.radioCircle, { borderColor: Colors.success }]} />
                          <View style={styles.radioTextContainer}>
                            <Text style={[styles.radioTitle, { color: Colors.success }]}>💸 Marcar como Pago</Text>
                            <Text style={styles.radioSub}>
                              Zera a mesada atual do filho, marca o ciclo como pago no histórico e desconfigura a mesada (retorna a "Sem Mesada").
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Opção 2: Adicionar para Próximo Mês */}
                        <TouchableOpacity
                          style={[styles.radioOption, { borderColor: Colors.primary }]}
                          onPress={handleGoToStep2}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.radioCircle, { borderColor: Colors.primary }]} />
                          <View style={styles.radioTextContainer}>
                            <Text style={[styles.radioTitle, { color: Colors.primary }]}>🔄 Adicionar para o Próximo Mês</Text>
                            <Text style={styles.radioSub}>
                              Transfere o saldo restante/acumulado atual diretamente para o próximo ciclo de mesada.
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Text style={[styles.modalSubtitle, { marginBottom: 16 }]}>
                        Você escolheu transferir o valor de <Text style={{ fontWeight: '800' }}>{formatCurrency(closeCycleData.currentBalance)}</Text> para o próximo mês.
                      </Text>

                      <Text style={styles.label}>Qual valor previsto deseja utilizar para o próximo mês?</Text>

                      <TouchableOpacity
                        style={[styles.radioOption, keepPreviousBase && styles.radioOptionActive]}
                        onPress={() => setKeepPreviousBase(true)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.radioCircle, keepPreviousBase && styles.radioCircleActive]}>
                          {keepPreviousBase && <View style={styles.radioInnerCircle} />}
                        </View>
                        <View style={styles.radioTextContainer}>
                          <Text style={styles.radioTitle}>Manter valor previsto conforme mês anterior</Text>
                          <Text style={styles.radioSub}>
                            Será usado o valor do ciclo atual ({formatCurrency(closeCycleData.baseAmount)}) somado ao saldo transferido.
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.radioOption, !keepPreviousBase && styles.radioOptionActive]}
                        onPress={() => setKeepPreviousBase(false)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.radioCircle, !keepPreviousBase && styles.radioCircleActive]}>
                          {!keepPreviousBase && <View style={styles.radioInnerCircle} />}
                        </View>
                        <View style={styles.radioTextContainer}>
                          <Text style={styles.radioTitle}>Usar valor padrão estipulado</Text>
                          <Text style={styles.radioSub}>
                            Será usado o valor padrão das configurações somado ao saldo transferido.
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.modalButtonsRow}>
                        <TouchableOpacity
                          style={styles.btnModalCancel}
                          onPress={() => setCloseCycleStep(1)}
                        >
                          <Text style={styles.btnModalCancelText}>Voltar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.btnModalConfirmBlue}
                          onPress={handleConfirmCloseRollover}
                        >
                          <Text style={styles.btnModalConfirmBlueText}>Confirmar e Fechar ✓</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL EXTRATO COMPLETO (FullStatementModal) ── */}
      <Modal
        visible={fullStatementModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFullStatementModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                🧾 Extrato Completo - {selectedChildForStatement?.name}
              </Text>
              <TouchableOpacity onPress={() => setFullStatementModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* FILTROS */}
              <Text style={styles.filterSectionTitle}>Período</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRowScroll}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterPeriod === 'all' && styles.selectorChipActive]}
                    onPress={() => setFilterPeriod('all')}
                  >
                    <Text style={[styles.selectorChipText, filterPeriod === 'all' && styles.selectorChipTextActive]}>Todo Histórico</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterPeriod === '30' && styles.selectorChipActive]}
                    onPress={() => setFilterPeriod('30')}
                  >
                    <Text style={[styles.selectorChipText, filterPeriod === '30' && styles.selectorChipTextActive]}>Últimos 30 dias</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterPeriod === '90' && styles.selectorChipActive]}
                    onPress={() => setFilterPeriod('90')}
                  >
                    <Text style={[styles.selectorChipText, filterPeriod === '90' && styles.selectorChipTextActive]}>Últimos 90 dias</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <Text style={styles.filterSectionTitle}>Ciclo / Competência</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRowScroll}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterCycle === 'all' && styles.selectorChipActive]}
                    onPress={() => setFilterCycle('all')}
                  >
                    <Text style={[styles.selectorChipText, filterCycle === 'all' && styles.selectorChipTextActive]}>Todos Ciclos</Text>
                  </TouchableOpacity>
                  {childCycles.map((c) => {
                    const label = `${c.month}/${c.year} (${c.status === 'open' ? 'Aberto' : c.status === 'paid' ? 'Pago' : 'Fechado'})`;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.selectorChip, filterCycle === c.id && styles.selectorChipActive]}
                        onPress={() => setFilterCycle(c.id)}
                      >
                        <Text style={[styles.selectorChipText, filterCycle === c.id && styles.selectorChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={styles.filterSectionTitle}>Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRowScroll}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterStatus === 'all' && styles.selectorChipActive]}
                    onPress={() => setFilterStatus('all')}
                  >
                    <Text style={[styles.selectorChipText, filterStatus === 'all' && styles.selectorChipTextActive]}>Todos Status</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterStatus === 'paid' && styles.selectorChipActive]}
                    onPress={() => setFilterStatus('paid')}
                  >
                    <Text style={[styles.selectorChipText, filterStatus === 'paid' && styles.selectorChipTextActive]}>Pago / Entrada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterStatus === 'pending' && styles.selectorChipActive]}
                    onPress={() => setFilterStatus('pending')}
                  >
                    <Text style={[styles.selectorChipText, filterStatus === 'pending' && styles.selectorChipTextActive]}>Pendente</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorChip, filterStatus === 'transferred' && styles.selectorChipActive]}
                    onPress={() => setFilterStatus('transferred')}
                  >
                    <Text style={[styles.selectorChipText, filterStatus === 'transferred' && styles.selectorChipTextActive]}>Transferido</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {/* LISTAGEM DE TRANSAÇÕES */}
              <ScrollView style={styles.statementList} showsVerticalScrollIndicator={true}>
                {filteredTransactions.length === 0 ? (
                  <Text style={[styles.miniTxEmpty, { textAlign: 'center', marginVertical: 32 }]}>
                    Nenhuma movimentação encontrada com os filtros selecionados.
                  </Text>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isCredit = tx.type === 'credit';
                    return (
                      <View key={tx.id} style={styles.statementRow}>
                        <View style={[styles.statementRowLeft, { backgroundColor: isCredit ? '#d1fae5' : '#fee2e2' }]}>
                          <Text style={{ color: isCredit ? Colors.success : Colors.danger, fontWeight: '900', fontSize: 14 }}>
                            {isCredit ? '+' : '−'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.statementDesc}>{tx.description || (isCredit ? 'Entrada' : 'Saída')}</Text>
                          <Text style={styles.statementMeta}>
                            {new Date(tx.created_at).toLocaleDateString('pt-BR')} • Ciclo {cycles.find(c => c.id === tx.cycle_id) ? `${cycles.find(c => c.id === tx.cycle_id).month}/${cycles.find(c => c.id === tx.cycle_id).year}` : 'N/A'}
                          </Text>
                        </View>
                        <Text style={[styles.statementAmt, { color: isCredit ? Colors.success : Colors.danger }]}>
                          {isCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
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

  childCard: {
    marginBottom: 16,
    borderLeftWidth: 5,
    padding: 16,
  },
  childName: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.text,
  },
  childCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 8,
  },
  btnCardConfigure: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.md,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  btnCardConfigureText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },

  balanceGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
  },
  balanceBox: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: Radii.md,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  balanceBoxLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  balanceBoxVal: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },

  bonusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bonusBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.bg,
    borderRadius: Radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  bonusBoxLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bonusBoxVal: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },

  miniTxContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  miniTxHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  miniTxEmpty: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  miniTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLighter + '40',
  },
  miniTxDate: {
    fontSize: 9,
    color: Colors.textMuted,
    width: 44,
  },
  miniTxTitle: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  miniTxAmt: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    textAlign: 'right',
  },

  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  cardActionBtn: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cardActionBtnText: {
    fontSize: FontSize.xs - 1,
    fontWeight: '800',
    color: Colors.textSecondary,
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

  cycleHistoryCard: {
    marginBottom: 10,
    padding: 12,
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
  cycleHistAmt: {
    fontSize: FontSize.sm,
    fontWeight: '900',
    color: Colors.text,
  },
  btnPayCycle: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.sm,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  btnPayCycleText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },

  settingsCard: {
    marginBottom: 14,
    padding: 16,
  },
  settingsChildName: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
  },
  settingsInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
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
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
  settingsEmptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
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

  piggyRequestCard: {
    marginBottom: 12,
    padding: 16,
  },
  piggyReqChild: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.text,
  },
  piggyReqAmt: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  piggyReqMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '700',
  },
  piggyReqMsg: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 6,
  },
  piggyReqActions: {
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

  piggyHistoryCard: {
    marginBottom: 10,
    padding: 12,
  },
  cycleHistReviewNote: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  smallBadge: {
    borderRadius: Radii.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  smallBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },

  // Modal styles
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
    maxHeight: '85%',
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
  pickerFake: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    backgroundColor: Colors.bg,
    marginBottom: 16,
    overflow: 'hidden',
  },
  pickerNative: {
    width: '100%',
    height: 44,
    paddingHorizontal: 8,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: 'transparent',
    borderWidth: 0,
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
    height: 80,
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
  selectorChip: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  selectorChipActive: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.primary,
  },
  selectorChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  selectorChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  groupButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  groupButtonCreditActive: {
    borderColor: Colors.success,
    backgroundColor: '#d1fae5',
  },
  groupButtonDebitActive: {
    borderColor: Colors.danger,
    backgroundColor: '#fee2e2',
  },
  groupButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  groupButtonTextActive: {
    fontWeight: '800',
    color: Colors.text,
  },
  modelOptionCard: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 12,
    backgroundColor: Colors.bg,
    marginBottom: 4,
  },
  modelOptionCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  modelOptionTitle: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  modelOptionTitleActive: {
    color: Colors.primary,
  },
  modelOptionDesc: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  btnFullStatementLink: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  btnFullStatementLinkText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  btnModalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  btnModalCancelText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  btnModalConfirmGreen: {
    flex: 1,
    backgroundColor: Colors.success,
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.success,
  },
  btnModalConfirmGreenText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: '#fff',
  },
  btnModalConfirmBlue: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  btnModalConfirmBlueText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: '#fff',
  },
  modalBalanceHighlight: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.md,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  modalBalanceHighlightLabel: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  modalBalanceHighlightVal: {
    fontSize: FontSize.lg + 2,
    fontWeight: '900',
    color: Colors.primary,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
    width: 20,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    marginBottom: 10,
    gap: 12,
  },
  radioOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter + '40',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: Colors.primary,
  },
  radioInnerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  radioTextContainer: {
    flex: 1,
  },
  radioTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
  },
  radioSub: {
    fontSize: FontSize.xs - 1,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Filtros extrato
  filterRowScroll: {
    marginBottom: 16,
  },
  filterSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statementList: {
    maxHeight: 350,
  },
  statementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  statementRowLeft: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statementDesc: {
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
    color: Colors.text,
  },
  statementMeta: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statementAmt: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    textAlign: 'right',
  },
});
