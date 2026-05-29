import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { PiggyPopoutCard, piggyScrollTopInset } from '../../src/components/allowance/PiggyPopoutCard';
import api from '../../src/services/api';

const cofrinhoImg = require('../../icon/cofrinho.png');
const mesadaHeaderImg = require('../../icon/mesada1.png');

function useMesadaHeaderMetrics(screenW: number) {
  return useMemo(() => {
    const prevImgW = Math.round(screenW * 0.36 * 0.98);
    const imgWBase = Math.min(Math.round(prevImgW * 2), Math.round(screenW * 0.52));
    const imgW = Math.round(imgWBase * 0.75);
    const rowH = Math.round(imgW * 0.78);
    const slotW = Math.round(imgW * 0.82);
    const imgDisplayW = Math.round(slotW * 1.3);
    const imgDisplayH = Math.round(rowH * 1.3);
    const imgLeft = Math.round((slotW - imgDisplayW) / 2);
    return { slotW, rowH, imgDisplayW, imgDisplayH, imgLeft };
  }, [screenW]);
}

export default function AllowanceScreen() {
  const router = useRouter();
  const { childProfile, refreshProfile } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const { slotW, rowH, imgDisplayW, imgDisplayH, imgLeft } = useMesadaHeaderMetrics(screenW);

  const [tab, setTab] = useState<'allowance' | 'goals' | 'piggy'>('allowance');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Dados da API
  const [settings, setSettings] = useState<any>(null);
  const [cycle, setCycle] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [piggyRequests, setPiggyRequests] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);

  // Estados para Extrato Completo
  const [fullStatementModalVisible, setFullStatementModalVisible] = useState<boolean>(false);
  const [filterPeriod, setFilterPeriod] = useState<'all' | '30' | '90'>('all');
  const [filterCycle, setFilterCycle] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modais de Criação de Meta
  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [goalTitle, setGoalTitle] = useState<string>('');
  const [goalTargetAmount, setGoalTargetAmount] = useState<string>('');

  // Formulário de Resgate (Piggy Request)
  const [piggyGoalId, setPiggyGoalId] = useState<string>('');
  const [piggyAmount, setPiggyAmount] = useState<string>('');
  const [piggyMessage, setPiggyMessage] = useState<string>('');

  const formatCurrency = (val: number, currencyCode = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode }).format(val);
  };

  const currentBalance = useMemo(() => {
    if (!cycle || !settings) return 0;
    const opening = Number(cycle.opening_balance ?? 0);
    const base = settings.model_type !== 'accumulative' ? Number(cycle.base_amount ?? 0) : 0;
    const bonus = Number(cycle.total_bonus ?? 0);
    const manual = Number(cycle.manual_adjustments ?? 0);
    const discount = Number(cycle.total_discount ?? 0);
    
    let bal = opening + base + bonus + manual - discount;
    
    // Se não permitir saldo negativo, restringe a zero
    const allowNeg =
      settings.allow_negative_balance === true ||
      settings.allow_negative_balance === 1 ||
      String(settings.allow_negative_balance).toLowerCase() === 'true';
    if (!allowNeg) bal = Math.max(0, bal);
    
    return bal;
  }, [cycle, settings]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!childProfile?.id) return;
    try {
      if (!isRefresh) setLoading(true);

      // Sincroniza o perfil
      await refreshProfile();

      const childId = childProfile.id;
      const [rSet, rTrans, rGoals, rCyc, rPig, rCyclesAll] = await Promise.all([
        api.get('/allowance/settings'),
        api.get('/allowance/transactions', { params: { child_id: childId } }),
        api.get('/allowance/goals', { params: { child_id: childId } }),
        api.post('/allowance/cycles/current', { child_id: childId }).catch(() => ({ data: null })),
        api.get('/allowance/piggy-requests').catch(() => ({ data: [] })),
        api.get('/allowance/cycles').catch(() => ({ data: [] })),
      ]);

      const mySetting = Array.isArray(rSet?.data)
        ? rSet.data.find((s: any) => String(s?.child_id) === String(childId))
        : null;

      setSettings(mySetting);
      setTransactions(rTrans?.data || []);
      setGoals(rGoals?.data || []);
      setCycle(rCyc?.data || null);
      setCycles((rCyclesAll?.data || []).filter((c: any) => String(c.child_id) === String(childId)));

      // Filtra solicitações da criança logada
      const myPiggyReqs = (rPig?.data || []).filter((r: any) => String(r.child_id) === String(childId));
      setPiggyRequests(myPiggyReqs);
    } catch (err) {
      console.error('[Allowance] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childProfile?.id, refreshProfile]);

  useEffect(() => {
    if (childProfile?.id) {
      loadData();
    }
  }, [childProfile?.id, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const recentTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!settings?.last_cycle_closed_at) return true;
      return new Date(t.created_at) > new Date(settings.last_cycle_closed_at);
    });
  }, [transactions, settings]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
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
  }, [transactions, filterPeriod, filterCycle, filterStatus]);

  // Salvar Nova Meta de Poupança
  const handleSaveGoal = async () => {
    if (!goalTitle.trim() || !goalTargetAmount.trim()) {
      Alert.alert('Aviso', 'Preencha todos os campos obrigatórios.');
      return;
    }
    const target = parseFloat(goalTargetAmount);
    if (isNaN(target) || target <= 0) {
      Alert.alert('Aviso', 'Digite um valor de meta válido maior que zero.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/allowance/goals', {
        title: goalTitle,
        target_amount: target,
        child_id: childProfile?.id,
      });

      Alert.alert('Sucesso!', 'Nova meta criada com sucesso no seu cofrinho! 🎯');
      setShowGoalModal(false);
      setGoalTitle('');
      setGoalTargetAmount('');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível criar a meta.');
    } finally {
      setLoading(false);
    }
  };

  // Enviar Solicitação de Cofrinho (Retirada/Resgate)
  const handleSubmitPiggyRequest = async () => {
    if (!piggyGoalId) {
      Alert.alert('Aviso', 'Selecione a meta correspondente ao resgate.');
      return;
    }
    const amount = parseFloat(piggyAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Aviso', 'Informe um valor de resgate válido.');
      return;
    }
    if (amount > Math.max(currentBalance, 0)) {
      Alert.alert('Saldo Insuficiente', 'O valor solicitado é maior do que o seu saldo previsível atual.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/allowance/piggy-requests', {
        savings_goal_id: piggyGoalId,
        requested_amount: amount,
        message: piggyMessage || undefined,
        child_id: childProfile?.id,
      });

      Alert.alert('Sucesso!', 'Sua solicitação de retirada foi enviada para o seu responsável aprovar! 📤');
      setPiggyGoalId('');
      setPiggyAmount('');
      setPiggyMessage('');
      setTab('allowance'); // Volta para a aba principal
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível enviar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ──────────────────────────────── */}
      <LinearGradient
        colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: 18 }]}
      >
        <TouchableOpacity style={styles.backBtnAbs} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>

        <View style={[styles.headerColumns, { minHeight: rowH }]}>
          <View style={{ width: slotW, height: rowH }} />
          <View style={[styles.headerTextCol, { minHeight: rowH }]}>
            <Text style={styles.headerTitle}>Mesada & Cofrinho</Text>
            <Text style={styles.headerSub}>Aprender, guardar e conquistar!</Text>
          </View>
        </View>

        <Image
          source={mesadaHeaderImg}
          style={[
            styles.headerHeroImg,
            {
              left: 10 + imgLeft,
              width: imgDisplayW,
              height: imgDisplayH,
            },
          ]}
          resizeMode="contain"
        />
      </LinearGradient>

      {/* Abas */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'allowance' && styles.tabBtnActive]}
          onPress={() => setTab('allowance')}
        >
          <Text style={[styles.tabBtnText, tab === 'allowance' && styles.tabBtnTextActive]}>🐷 Mesada</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'goals' && styles.tabBtnActive]}
          onPress={() => setTab('goals')}
        >
          <Text style={[styles.tabBtnText, tab === 'goals' && styles.tabBtnTextActive]}>🎯 Cofrinho</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'piggy' && styles.tabBtnActive]}
          onPress={() => setTab('piggy')}
        >
          <Text style={[styles.tabBtnText, tab === 'piggy' && styles.tabBtnTextActive]}>💾 Resgates</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando dados da mesada...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: piggyScrollTopInset() + 4 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
        >
          {/* ── CARD DE SALDO TOTAL (Exibido no topo) ── */}
          <PiggyPopoutCard
            imageSource={cofrinhoImg}
            cardStyle={styles.balancePopCard}
            horizontalMargin={0}
          >
            <Text style={styles.balanceLabel}>Saldo Previsível</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(Math.max(currentBalance, 0), settings?.currency || 'BRL')}
            </Text>
            <Text style={styles.balanceHelp} numberOfLines={2}>
              {settings?.model_type === 'accumulative'
                ? 'Acumulativa: tarefas feitas geram bônus!'
                : 'Fixo: mesada base configurada pelos pais'}
            </Text>
          </PiggyPopoutCard>

          {/* ── ABA 1: DETALHES DA MESADA E EXTRATO ── */}
          {tab === 'allowance' && (
            <View>
              <Text style={styles.sectionTitle}>Histórico de Entradas e Saídas</Text>
              {recentTransactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🧾</Text>
                  <Text style={styles.emptyTextTitle}>Nenhuma movimentação recente</Text>
                  <Text style={styles.emptyTextSub}>As recompensas e transações deste ciclo aparecerão aqui.</Text>
                </View>
              ) : (
                <View>
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    {recentTransactions.slice(0, 15).map((tx, idx) => {
                      const isCredit = tx.type === 'credit';
                      return (
                        <View 
                          key={tx.id} 
                          style={[
                            styles.transactionRow, 
                            idx < recentTransactions.length - 1 && styles.borderBottom
                          ]}
                        >
                          <View style={[styles.transactionIcon, { backgroundColor: isCredit ? '#d1fae5' : '#fee2e2' }]}>
                            <Text style={{ color: isCredit ? Colors.success : Colors.danger, fontWeight: '900', fontSize: 16 }}>
                              {isCredit ? '+' : '−'}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.transactionTitle}>{tx.description || (isCredit ? 'Entrada' : 'Saída')}</Text>
                            <Text style={styles.transactionDate}>
                              {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                            </Text>
                          </View>
                          <Text style={[styles.transactionAmount, { color: isCredit ? Colors.success : Colors.danger }]}>
                            {isCredit ? '+' : '-'} {formatCurrency(tx.amount, settings?.currency || 'BRL')}
                          </Text>
                        </View>
                      );
                    })}
                  </Card>
                  
                  <TouchableOpacity
                    style={styles.btnFullStatementLink}
                    onPress={() => setFullStatementModalVisible(true)}
                  >
                    <Text style={styles.btnFullStatementLinkText}>🧾 Ver Extrato Completo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── ABA 2: METAS DO COFRINHO ── */}
          {tab === 'goals' && (
            <View>
              <View style={styles.flexBetweenRow}>
                <Text style={styles.sectionTitle}>Metas Ativas</Text>
                <TouchableOpacity style={styles.btnAction} onPress={() => setShowGoalModal(true)}>
                  <Text style={styles.btnActionText}>+ Nova Meta</Text>
                </TouchableOpacity>
              </View>

              {goals.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🎯</Text>
                  <Text style={styles.emptyTextTitle}>Nenhuma meta cadastrada</Text>
                  <Text style={styles.emptyTextSub}>Crie uma meta para saber quanto falta poupar para comprar o que você quer!</Text>
                </View>
              ) : (
                goals.map((g) => {
                  const perc = Math.min((g.current_amount / g.target_amount) * 100, 100);
                  const isCompleted = g.status === 'completed' || perc === 100;
                  return (
                    <Card key={g.id} style={styles.goalCard}>
                      <View style={styles.flexBetweenRow}>
                        <Text style={styles.goalTitle}>🎯 {g.title}</Text>
                        <Badge
                          label={isCompleted ? 'Concluída 🎉' : 'Ativa ⚡'}
                          variant={isCompleted ? 'success' : 'primary'}
                        />
                      </View>
                      <View style={[styles.flexBetweenRow, { marginTop: 10, marginBottom: 6 }]}>
                        <Text style={styles.goalAmt}>{formatCurrency(g.current_amount, settings?.currency || 'BRL')} guardados</Text>
                        <Text style={styles.goalAmtVal}>Meta: {formatCurrency(g.target_amount, settings?.currency || 'BRL')}</Text>
                      </View>
                      <ProgressBar
                        progress={perc}
                        color={isCompleted ? Colors.success : Colors.primary}
                        bg={Colors.primaryLighter}
                        height={10}
                      />
                      <Text style={styles.goalPercent}>{perc.toFixed(0)}% poupado</Text>
                    </Card>
                  );
                })
              )}
            </View>
          )}

          {/* ── ABA 3: RETIRADA E SOLICITAÇÕES ── */}
          {tab === 'piggy' && (
            <View>
              {/* Form de solicitação */}
              <Card style={{ padding: 18, marginBottom: 20 }}>
                <Text style={styles.sectionTitleInside}>💾 Pedir Retirada do Cofrinho</Text>
                <Text style={styles.helpText}>Use seu saldo acumulado para comprar/pagar por uma de suas metas de poupança.</Text>

                <Text style={styles.label}>Qual a sua meta? *</Text>
                <View style={{ marginBottom: 16 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.goalPickerChip, piggyGoalId === '' && styles.goalPickerChipActive]}
                      onPress={() => setPiggyGoalId('')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.goalPickerChipText, piggyGoalId === '' && styles.goalPickerChipTextActive]}>
                        Sem Meta (Livre)
                      </Text>
                    </TouchableOpacity>
                    {goals.filter((g: any) => g.status === 'active').map((g: any) => {
                      const active = piggyGoalId === g.id;
                      return (
                        <TouchableOpacity
                          key={g.id}
                          style={[styles.goalPickerChip, active && styles.goalPickerChipActive]}
                          onPress={() => setPiggyGoalId(g.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.goalPickerChipText, active && styles.goalPickerChipTextActive]}>
                            🎯 {g.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <Text style={styles.label}>Valor do Resgate (R$) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 50.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={piggyAmount}
                  onChangeText={setPiggyAmount}
                />

                <Text style={styles.label}>Recadinho para os pais (opcional)</Text>
                <TextInput
                  style={[styles.textarea, { height: 60 }]}
                  placeholder="Ex: Consegui juntar tudo e quero comprar meu videogame!"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={2}
                  value={piggyMessage}
                  onChangeText={setPiggyMessage}
                />

                <TouchableOpacity 
                  style={styles.btnSubmit}
                  onPress={handleSubmitPiggyRequest}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnSubmitText}>Enviar Solicitação 📤</Text>
                </TouchableOpacity>
              </Card>

              {/* Lista de requisições */}
              <Text style={styles.sectionTitle}>Minhas Solicitações de Retirada</Text>
              {piggyRequests.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>📤</Text>
                  <Text style={styles.emptyTextTitle}>Nenhum pedido enviado</Text>
                  <Text style={styles.emptyTextSub}>Seus pedidos de resgate do cofrinho aparecerão aqui.</Text>
                </View>
              ) : (
                piggyRequests.map((r) => {
                  const badge = getStatusBadgeProps(r.status);
                  return (
                    <Card key={r.id} style={styles.requestCard}>
                      <View style={styles.flexBetweenRow}>
                        <Text style={styles.requestGoal}>💾 {r.goal_title || 'Retirada'}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.requestAmt}>Valor pedido: {formatCurrency(r.requested_amount, settings?.currency || 'BRL')}</Text>
                      {r.message && (
                        <Text style={styles.requestMsg}>Minha nota: "{r.message}"</Text>
                      )}
                      {r.review_note && (
                        <View style={styles.reviewNoteBox}>
                          <Text style={styles.reviewNoteTitle}>Resposta do responsável:</Text>
                          <Text style={styles.reviewNoteContent}>"{r.review_note}"</Text>
                        </View>
                      )}
                    </Card>
                  );
                })
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── MODAL NOVA META ── */}
      <Modal
        visible={showGoalModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎯 Nova Meta de Poupança</Text>
              <TouchableOpacity onPress={() => setShowGoalModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>O que você quer comprar/poupar? *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Novo Jogo de Playstation"
                placeholderTextColor={Colors.textMuted}
                value={goalTitle}
                onChangeText={setGoalTitle}
              />

              <Text style={styles.label}>Qual o valor total necessário? (R$) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 250.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={goalTargetAmount}
                onChangeText={setGoalTargetAmount}
              />

              <TouchableOpacity 
                style={styles.btnModalSubmit}
                onPress={handleSaveGoal}
                activeOpacity={0.8}
              >
                <Text style={styles.btnModalSubmitText}>Criar Meta 🚀</Text>
              </TouchableOpacity>
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
                🧾 Meu Extrato Completo
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
                  {cycles.map((c) => {
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
                    Nenhuma movimentação encontrada.
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
                          {isCredit ? '+' : '-'} {formatCurrency(tx.amount, settings?.currency || 'BRL')}
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
  root:    { flex: 1, backgroundColor: Colors.bg, paddingBottom: 72 },
  header:  {
    paddingBottom: 2,
    paddingHorizontal: 10,
    overflow: 'visible',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    columnGap: 10,
    zIndex: 1,
  },
  headerHeroImg: {
    position: 'absolute',
    bottom: 2,
    zIndex: 25,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { elevation: 12 },
    }),
  },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
    minWidth: 0,
  },
  backBtnAbs: {
    position: 'absolute',
    top: 20,
    left: 10,
    zIndex: 30,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26, marginTop: -2 },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 24,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
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

  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 110 },

  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  balancePopCard: {
    marginBottom: 14,
  },
  balanceLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 12,
  },
  balanceValue: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: Colors.primaryDark,
    lineHeight: 24,
  },
  balanceHelp: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '600',
    lineHeight: 13,
    marginTop: 1,
  },

  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 12, marginTop: 10 },
  sectionTitleInside: { fontSize: FontSize.base - 1, fontWeight: '900', color: Colors.text, marginBottom: 4 },
  flexBetweenRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    ...Shadow.sm,
  },
  emptyTextTitle: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  emptyTextSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionTitle: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  transactionDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },

  goalCard: {
    marginBottom: 12,
    padding: 16,
  },
  goalTitle: {
    fontSize: FontSize.base - 1,
    fontWeight: '800',
    color: Colors.text,
  },
  goalAmt: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  goalAmtVal: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  goalPercent: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 4,
  },

  helpText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 16,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  goalPickerChip: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  goalPickerChipActive: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.primary,
  },
  goalPickerChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  goalPickerChipTextActive: {
    color: Colors.primary,
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
  btnSubmit: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.btn,
    marginTop: 8,
  },
  btnSubmitText: {
    color: '#fff',
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
  },

  requestCard: {
    marginBottom: 12,
    padding: 14,
  },
  requestGoal: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  requestAmt: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginTop: 6,
  },
  requestMsg: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
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
  reviewNoteBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: Radii.sm,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewNoteTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  reviewNoteContent: {
    fontSize: FontSize.xs - 1,
    color: Colors.text,
    fontStyle: 'italic',
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
    maxHeight: '80%',
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
  btnModalSubmit: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.btn,
    marginTop: 8,
    marginBottom: 20,
  },
  btnModalSubmitText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  selectorChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radii.full,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  selectorChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  selectorChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  selectorChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  btnFullStatementLink: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 14,
  },
  btnFullStatementLinkText: {
    fontSize: FontSize.xs + 1,
    fontWeight: '800',
    color: Colors.primary,
  },
  filterRowScroll: {
    marginBottom: 12,
  },
  filterSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statementList: {
    maxHeight: 320,
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
  miniTxEmpty: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
}) as any;
