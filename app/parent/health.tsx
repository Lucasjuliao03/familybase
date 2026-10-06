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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import api from '../../src/services/api';
import { UserAvatar } from '../../src/components/profile/UserAvatar';

const RECORD_TYPES = [
  { id: 'headache', label: 'Dor de Cabeça 🤕' },
  { id: 'fever', label: 'Febre 🌡️' },
  { id: 'cold', label: 'Resfriado 🤧' },
  { id: 'sore_throat', label: 'Dor de Garganta 🗣️' },
  { id: 'stomach_ache', label: 'Dor de Barriga 🤢' },
  { id: 'cough', label: 'Tosse 😷' },
  { id: 'allergy', label: 'Alergia 🌸' },
  { id: 'malaise', label: 'Mal Estar 🥱' },
  { id: 'other', label: 'Outro 📍' },
];

const SEVERITIES = [
  { id: 'mild', label: 'Leve 🟢', color: Colors.success, bg: '#d1fae5' },
  { id: 'moderate', label: 'Moderada 🟡', color: Colors.warning, bg: '#fef3c7' },
  { id: 'severe', label: 'Forte 🔴', color: Colors.danger, bg: '#fee2e2' },
];

export default function ParentHealthScreen() {
  const router = useRouter();
  const { family, user } = useAuth();

  const [tab, setTab] = useState<'overview' | 'symptoms' | 'appointments' | 'medications' | 'history'>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filtros
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');

  // Dados do Servidor
  const [overview, setOverview] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Modais de Criação / Edição
  const [showRecordModal, setShowRecordModal] = useState<boolean>(false);
  const [recordForm, setRecordForm] = useState<any>({
    id: null,
    child_id: '',
    record_type: 'other',
    severity: 'mild',
    symptoms: '',
    temperature: '',
    notes: '',
    stayed_home: false,
    medication_given: '',
  });

  const [showApptModal, setShowApptModal] = useState<boolean>(false);
  const [apptForm, setApptForm] = useState<any>({
    id: null,
    child_id: '',
    title: '',
    professional_name: '',
    specialty: '',
    appointment_date: '',
    appointment_time: '',
    location: '',
    notes: '',
    status: 'scheduled',
  });

  const [showMedModal, setShowMedModal] = useState<boolean>(false);
  const [medForm, setMedForm] = useState<any>({
    id: null,
    child_id: '',
    name: '',
    dosage: '',
    frequency: '',
    notes: '',
    status: 'active',
  });

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const params: any = {};
      if (selectedChildId) params.child_id = selectedChildId;

      const [rOverview, rRecords, rAppts, rMeds, rLogs, rChildren] = await Promise.all([
        api.get('/health/overview', { params }).catch(() => ({ data: null })),
        api.get('/health/records', { params }).catch(() => ({ data: [] })),
        api.get('/health/appointments', { params }).catch(() => ({ data: [] })),
        api.get('/health/medications', { params }).catch(() => ({ data: [] })),
        api.get('/health/medication-logs', { params }).catch(() => ({ data: [] })),
        api.get('/families/children').catch(() => ({ data: [] })),
      ]);

      setOverview(rOverview?.data || null);
      setRecords(rRecords?.data || []);
      setAppointments(rAppts?.data || []);
      setMedications(rMeds?.data || []);
      setLogs(rLogs?.data || []);
      setChildren(rChildren?.data || []);

      // Auto-selecionar o primeiro filho no form se nenhum estiver selecionado
      const childList = rChildren?.data || [];
      if (childList.length > 0) {
        setRecordForm((p: any) => ({ ...p, child_id: p.child_id || childList[0].id }));
        setApptForm((p: any) => ({ ...p, child_id: p.child_id || childList[0].id }));
        setMedForm((p: any) => ({ ...p, child_id: p.child_id || childList[0].id }));
      }
    } catch (err) {
      console.error('[ParentHealth] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const getChildName = (cid: string) => {
    const c = children.find(ch => ch.id === cid);
    return c ? c.name : 'Membro';
  };

  const getChild = (cid: string) => {
    return children.find(ch => ch.id === cid);
  };

  const formatDateBr = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // ── SINTOMAS ───────────────────────────────
  const handleSaveRecord = async () => {
    if (!recordForm.symptoms.trim()) {
      Alert.alert('Erro', 'Por favor descreva o sintoma.');
      return;
    }
    try {
      setLoading(true);
      const now = new Date();
      const payload = {
        ...recordForm,
        record_date: now.toISOString().split('T')[0],
        record_time: now.toTimeString().slice(0, 5),
        status: recordForm.id ? recordForm.status : 'active',
        temperature: recordForm.temperature ? parseFloat(recordForm.temperature) : null,
      };

      if (recordForm.id) {
        await api.put(`/health/records/${recordForm.id}`, payload);
        Alert.alert('Sucesso', 'Registro de sintoma atualizado!');
      } else {
        await api.post('/health/records', payload);
        Alert.alert('Sucesso', 'Sintoma registrado!');
      }

      setShowRecordModal(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao salvar sintoma.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    Alert.alert('Excluir Registro', 'Deseja excluir permanentemente este sintoma do histórico?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await api.delete(`/health/records/${id}`);
            Alert.alert('Excluído', 'Registro apagado com sucesso.');
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

  // ── CONSULTAS ──────────────────────────────
  const handleSaveAppt = async () => {
    if (!apptForm.title.trim() || !apptForm.appointment_date) {
      Alert.alert('Erro', 'Preencha o título e a data da consulta.');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        ...apptForm,
        date: apptForm.appointment_date,
        time: apptForm.appointment_time || null,
        doctor_name: apptForm.professional_name || null,
      };

      if (apptForm.id) {
        await api.put(`/health/appointments/${apptForm.id}`, payload);
        Alert.alert('Sucesso', 'Consulta atualizada com sucesso!');
      } else {
        await api.post('/health/appointments', payload);
        Alert.alert('Sucesso', 'Consulta médica agendada!');
      }

      setShowApptModal(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao agendar consulta.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAppt = async (id: string) => {
    Alert.alert('Excluir Consulta', 'Deseja desmarcar/excluir este agendamento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await api.delete(`/health/appointments/${id}`);
            Alert.alert('Sucesso', 'Consulta cancelada.');
            loadData(true);
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Erro ao deletar consulta.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // ── REMÉDIOS ───────────────────────────────
  const handleSaveMed = async () => {
    if (!medForm.name.trim() || !medForm.dosage.trim()) {
      Alert.alert('Erro', 'Informe o nome do remédio e a dosagem.');
      return;
    }
    try {
      setLoading(true);
      if (medForm.id) {
        await api.put(`/health/medications/${medForm.id}`, medForm);
        Alert.alert('Sucesso', 'Medicamento atualizado!');
      } else {
        await api.post('/health/medications', medForm);
        Alert.alert('Sucesso', 'Novo remédio cadastrado no diário!');
      }

      setShowMedModal(false);
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao cadastrar medicação.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMed = async (id: string) => {
    Alert.alert('Excluir Remédio', 'Deseja remover esta medicação e todo seu histórico de doses?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await api.delete(`/health/medications/${id}`);
            Alert.alert('Sucesso', 'Medicamento removido.');
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

  // ── HISTÓRICO DE DOSES ─────────────────────
  const handleDeleteLog = async (id: string) => {
    Alert.alert('Excluir Registro de Dose', 'Remover esta dose do histórico de consumo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await api.delete(`/health/medication-logs/${id}`);
            Alert.alert('Sucesso', 'Registro apagado.');
            loadData(true);
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Erro ao apagar log.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header padronizado */}
      <ModuleHeader
        title="Diário de Saúde"
        emoji="🏥"
        subtitle="Gerencie sintomas, remédios e consultas"
        onBack={() => router.back()}
      />

      {/* Seletor de Filho (Filtro Horizontal) */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Filtrar Filho:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity
            style={[styles.filterChip, selectedChildId === '' && styles.filterChipActive]}
            onPress={() => setSelectedChildId('')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, selectedChildId === '' && styles.filterChipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
          {children.map((c) => {
            const active = selectedChildId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedChildId(c.id)}
                activeOpacity={0.7}
              >
                <UserAvatar
                  avatarUrl={c.avatar_url}
                  avatarPreset={c.avatar_preset}
                  name={c.name}
                  size={20}
                  bordered={false}
                  backgroundColor={c.color ? `${c.color}20` : undefined}
                />
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Abas */}
      <View style={styles.tabsContainer}>
        {[
          { key: 'overview', label: '📊 Resumo' },
          { key: 'symptoms', label: '🤒 Sintomas' },
          { key: 'appointments', label: '📅 Consultas' },
          { key: 'medications', label: '💊 Remédios' },
          { key: 'history', label: '📋 Doses' },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(t.key as any)}
            >
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#EC4899" />
          <Text style={styles.loadingText}>Carregando informações médicas...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#EC4899']} />
          }
        >
          {/* ── RESUMO ── */}
          {tab === 'overview' && overview && (
            <View style={{ gap: 16 }}>
              {/* KPIs rápidas */}
              <View style={styles.kpiRow}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiVal}>{overview.activeMedications?.length || 0}</Text>
                  <Text style={styles.kpiLabel}>Remédios Ativos</Text>
                </View>
                <View style={[styles.kpiCard, { borderColor: Colors.warning }]}>
                  <Text style={[styles.kpiVal, { color: Colors.warning }]}>
                    {overview.upcomingAppointments?.length || 0}
                  </Text>
                  <Text style={[styles.kpiLabel, { color: Colors.warning }]}>Consultas</Text>
                </View>
                <View style={[styles.kpiCard, { borderColor: Colors.danger }]}>
                  <Text style={[styles.kpiVal, { color: Colors.danger }]}>
                    {overview.monitoring?.length || 0}
                  </Text>
                  <Text style={[styles.kpiLabel, { color: Colors.danger }]}>Monitoramento</Text>
                </View>
              </View>

              {/* Consultas Agendadas */}
              <Card style={styles.blockCard}>
                <Text style={styles.blockTitle}>📅 Consultas Agendadas</Text>
                {(overview.upcomingAppointments || []).length === 0 ? (
                  <Text style={styles.emptyBlockText}>Nenhuma consulta programada.</Text>
                ) : (
                  overview.upcomingAppointments.map((a: any) => {
                    const child = getChild(a.child_id);
                    return (
                      <View key={a.id} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            {child && (
                              <UserAvatar
                                avatarUrl={child.avatar_url}
                                avatarPreset={child.avatar_preset}
                                name={child.name}
                                size={18}
                                bordered={false}
                                backgroundColor={child.color ? `${child.color}20` : undefined}
                              />
                            )}
                            <Text style={styles.itemTitle}>{child ? child.name : 'Membro'}: {a.specialty || 'Consulta'}</Text>
                          </View>
                          <Text style={styles.itemSubtitle}>
                            📅 {formatDateBr(a.appointment_date)} às {a.appointment_time || '—'} {a.professional_name ? `(${a.professional_name})` : ''}
                          </Text>
                        </View>
                        <Badge label={a.status === 'confirmed' ? 'Confirmado' : 'Agendado'} variant={a.status === 'confirmed' ? 'success' : 'primary'} />
                      </View>
                    );
                  })
                )}
              </Card>

              {/* Remédios Ativos */}
              <Card style={styles.blockCard}>
                <Text style={styles.blockTitle}>💊 Medicamentos em Uso</Text>
                {(overview.activeMedications || []).length === 0 ? (
                  <Text style={styles.emptyBlockText}>Nenhum remédio ativo.</Text>
                ) : (
                  overview.activeMedications.map((m: any) => {
                    const child = getChild(m.child_id);
                    return (
                      <View key={m.id} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{m.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            {child && (
                              <UserAvatar
                                avatarUrl={child.avatar_url}
                                avatarPreset={child.avatar_preset}
                                name={child.name}
                                size={18}
                                bordered={false}
                                backgroundColor={child.color ? `${child.color}20` : undefined}
                              />
                            )}
                            <Text style={styles.itemSubtitle}>{child ? child.name : 'Membro'} · Dose: {m.dosage} ({m.frequency})</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>
            </View>
          )}

          {/* ── SINTOMAS ── */}
          {tab === 'symptoms' && (
            <View>
              <View style={styles.flexBetweenRow}>
                <Text style={styles.sectionTitle}>Sintomas & Registros</Text>
                <TouchableOpacity
                  style={styles.btnAdd}
                  onPress={() => {
                    setRecordForm({
                      id: null,
                      child_id: children[0]?.id || '',
                      record_type: 'other',
                      severity: 'mild',
                      symptoms: '',
                      temperature: '',
                      notes: '',
                      stayed_home: false,
                      medication_given: '',
                    });
                    setShowRecordModal(true);
                  }}
                >
                  <Text style={styles.btnAddText}>+ Registrar</Text>
                </TouchableOpacity>
              </View>

              {records.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTextTitle}>Nenhum sintoma relatado</Text>
                  <Text style={styles.emptyTextSub}>Seus filhos não reportaram nenhum sintoma recentemente.</Text>
                </View>
              ) : (
                records.map((r) => {
                  const sev = SEVERITIES.find(s => s.id === r.severity);
                  return (
                    <Card key={r.id} style={[styles.dataCard, { borderLeftColor: sev?.color || Colors.primary }]}>
                      <View style={styles.flexRowBetween}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardMainTitle}>
                            {RECORD_TYPES.find(t => t.id === r.record_type)?.label || r.record_type}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            {getChild(r.child_id) && (
                              <UserAvatar
                                avatarUrl={getChild(r.child_id).avatar_url}
                                avatarPreset={getChild(r.child_id).avatar_preset}
                                name={getChild(r.child_id).name}
                                size={18}
                                bordered={false}
                                backgroundColor={getChild(r.child_id).color ? `${getChild(r.child_id).color}20` : undefined}
                              />
                            )}
                            <Text style={styles.cardSubtitle}>
                              {getChildName(r.child_id)} · {formatDateBr(r.record_date)} às {r.record_time || ''}
                            </Text>
                          </View>
                        </View>
                        <Badge label={sev?.label || r.severity} variant="ghost" />
                      </View>

                      <Text style={styles.cardDesc}>🩺 {r.symptoms}</Text>
                      {r.temperature ? <Text style={styles.cardMeta}>🌡️ Temperatura: {r.temperature}°C</Text> : null}
                      {r.notes ? <Text style={styles.cardObs}>💬 Obs: "{r.notes}"</Text> : null}

                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.btnAction}
                          onPress={() => {
                            setRecordForm({
                              id: r.id,
                              child_id: r.child_id,
                              record_type: r.record_type,
                              severity: r.severity,
                              symptoms: r.symptoms,
                              temperature: r.temperature ? String(r.temperature) : '',
                              notes: r.notes || '',
                              stayed_home: !!r.stayed_home,
                              medication_given: r.medication_given || '',
                              status: r.status || 'active',
                            });
                            setShowRecordModal(true);
                          }}
                        >
                          <Text style={styles.btnActionText}>✏️ Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnAction, { borderColor: Colors.danger + '33' }]} onPress={() => handleDeleteRecord(r.id)}>
                          <Text style={[styles.btnActionText, { color: Colors.danger }]}>🗑️ Excluir</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          )}

          {/* ── CONSULTAS ── */}
          {tab === 'appointments' && (
            <View>
              <View style={styles.flexBetweenRow}>
                <Text style={styles.sectionTitle}>Consultas Clínicas</Text>
                <TouchableOpacity
                  style={styles.btnAdd}
                  onPress={() => {
                    setApptForm({
                      id: null,
                      child_id: children[0]?.id || '',
                      title: '',
                      professional_name: '',
                      specialty: '',
                      appointment_date: new Date().toISOString().split('T')[0],
                      appointment_time: '14:00',
                      location: '',
                      notes: '',
                      status: 'scheduled',
                    });
                    setShowApptModal(true);
                  }}
                >
                  <Text style={styles.btnAddText}>+ Agendar</Text>
                </TouchableOpacity>
              </View>

              {appointments.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTextTitle}>Nenhuma consulta agendada</Text>
                  <Text style={styles.emptyTextSub}>Clique em "+ Agendar" para registrar exames e rotinas médicas.</Text>
                </View>
              ) : (
                appointments.map((a) => (
                  <Card key={a.id} style={styles.dataCard}>
                    <View style={styles.flexRowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardMainTitle}>🩺 {a.title || a.specialty || 'Consulta Médica'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {getChild(a.child_id) && (
                            <UserAvatar
                              avatarUrl={getChild(a.child_id).avatar_url}
                              avatarPreset={getChild(a.child_id).avatar_preset}
                              name={getChild(a.child_id).name}
                              size={18}
                              bordered={false}
                              backgroundColor={getChild(a.child_id).color ? `${getChild(a.child_id).color}20` : undefined}
                            />
                          )}
                          <Text style={styles.cardSubtitle}>
                            {getChildName(a.child_id)} · 📅 {formatDateBr(a.appointment_date)} às {a.appointment_time || ''}
                          </Text>
                        </View>
                      </View>
                      <Badge label={a.status === 'confirmed' ? 'Confirmado' : a.status === 'completed' ? 'Realizado' : 'Agendado'} variant={a.status === 'confirmed' ? 'success' : 'primary'} />
                    </View>
                    {a.professional_name ? <Text style={styles.cardMeta}>👨‍⚕️ Médico: {a.professional_name} ({a.specialty || 'Clínico'})</Text> : null}
                    {a.location ? <Text style={styles.cardMeta}>📍 Local: {a.location}</Text> : null}
                    {a.notes ? <Text style={styles.cardObs}>💬 Notas: "{a.notes}"</Text> : null}

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.btnAction}
                        onPress={() => {
                          setApptForm({
                            id: a.id,
                            child_id: a.child_id,
                            title: a.title || '',
                            professional_name: a.professional_name || a.doctor_name || '',
                            specialty: a.specialty || '',
                            appointment_date: a.appointment_date || a.date,
                            appointment_time: a.appointment_time || a.time || '',
                            location: a.location || '',
                            notes: a.notes || '',
                            status: a.status || 'scheduled',
                          });
                          setShowApptModal(true);
                        }}
                      >
                        <Text style={styles.btnActionText}>✏️ Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btnAction, { borderColor: Colors.danger + '33' }]} onPress={() => handleDeleteAppt(a.id)}>
                        <Text style={[styles.btnActionText, { color: Colors.danger }]}>🗑️ Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          {/* ── MEDICAMENTOS ── */}
          {tab === 'medications' && (
            <View>
              <View style={styles.flexBetweenRow}>
                <Text style={styles.sectionTitle}>Remédios & Prescrições</Text>
                <TouchableOpacity
                  style={styles.btnAdd}
                  onPress={() => {
                    setMedForm({
                      id: null,
                      child_id: children[0]?.id || '',
                      name: '',
                      dosage: '',
                      frequency: '',
                      notes: '',
                      status: 'active',
                    });
                    setShowMedModal(true);
                  }}
                >
                  <Text style={styles.btnAddText}>+ Receitar</Text>
                </TouchableOpacity>
              </View>

              {medications.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTextTitle}>Nenhum remédio cadastrado</Text>
                  <Text style={styles.emptyTextSub}>Cadastre os medicamentos de uso contínuo ou temporários.</Text>
                </View>
              ) : (
                medications.map((m) => (
                  <Card key={m.id} style={styles.dataCard}>
                    <View style={styles.flexRowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardMainTitle}>💊 {m.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {getChild(m.child_id) && (
                            <UserAvatar
                              avatarUrl={getChild(m.child_id).avatar_url}
                              avatarPreset={getChild(m.child_id).avatar_preset}
                              name={getChild(m.child_id).name}
                              size={18}
                              bordered={false}
                              backgroundColor={getChild(m.child_id).color ? `${getChild(m.child_id).color}20` : undefined}
                            />
                          )}
                          <Text style={styles.cardSubtitle}>
                            {getChildName(m.child_id)} · Dose: {m.dosage} ({m.frequency})
                          </Text>
                        </View>
                      </View>
                      <Badge label={m.status === 'active' ? 'Ativo' : 'Finalizado'} variant={m.status === 'active' ? 'primary' : 'ghost'} />
                    </View>
                    {m.notes ? <Text style={styles.cardObs}>💬 Obs: "{m.notes}"</Text> : null}

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.btnAction}
                        onPress={() => {
                          setMedForm({
                            id: m.id,
                            child_id: m.child_id,
                            name: m.name,
                            dosage: m.dosage,
                            frequency: m.frequency,
                            notes: m.notes || '',
                            status: m.status || 'active',
                          });
                          setShowMedModal(true);
                        }}
                      >
                        <Text style={styles.btnActionText}>✏️ Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btnAction, { borderColor: Colors.danger + '33' }]} onPress={() => handleDeleteMed(m.id)}>
                        <Text style={[styles.btnActionText, { color: Colors.danger }]}>🗑️ Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          {/* ── HISTÓRICO DE DOSES ── */}
          {tab === 'history' && (
            <View>
              <Text style={styles.sectionTitle}>Histórico de Consumo (Doses)</Text>
              {logs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTextTitle}>Nenhuma dose registrada</Text>
                  <Text style={styles.emptyTextSub}>O histórico das tomadas de remédio aparecerá aqui.</Text>
                </View>
              ) : (
                logs.map((l) => (
                  <Card key={l.id} style={styles.logListCard}>
                    <View style={styles.flexRowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.logMedName}>💊 {l.medication_name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {getChild(l.child_id) && (
                            <UserAvatar
                              avatarUrl={getChild(l.child_id).avatar_url}
                              avatarPreset={getChild(l.child_id).avatar_preset}
                              name={getChild(l.child_id).name}
                              size={18}
                              bordered={false}
                              backgroundColor={getChild(l.child_id).color ? `${getChild(l.child_id).color}20` : undefined}
                            />
                          )}
                          <Text style={styles.logDetail}>
                            {getChildName(l.child_id)} · Tomado em: {l.taken_at ? new Date(l.taken_at).toLocaleString('pt-BR') : ''}
                          </Text>
                        </View>
                        {l.notes ? <Text style={styles.logNotes}>"{l.notes}"</Text> : null}
                      </View>
                      <TouchableOpacity style={styles.btnDeleteLog} onPress={() => handleDeleteLog(l.id)}>
                        <Text style={styles.btnDeleteLogText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* MODAL: SINTOMAS */}
      <Modal visible={showRecordModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🤒 Registrar Sintoma</Text>
              <TouchableOpacity onPress={() => setShowRecordModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Filho *</Text>
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {children.map((c) => {
                    const active = recordForm.child_id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.selectorChip, active && styles.selectorChipActive]}
                        onPress={() => setRecordForm((p: any) => ({ ...p, child_id: c.id }))}
                      >
                        <UserAvatar
                          avatarUrl={c.avatar_url}
                          avatarPreset={c.avatar_preset}
                          name={c.name}
                          size={18}
                          bordered={false}
                          backgroundColor={c.color ? `${c.color}20` : undefined}
                        />
                        <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.formLabel}>Tipo de Sintoma *</Text>
              <View style={styles.gridContainer}>
                {RECORD_TYPES.map((rt) => {
                  const active = recordForm.record_type === rt.id;
                  return (
                    <TouchableOpacity
                      key={rt.id}
                      style={[styles.selectorChip, active && styles.selectorChipActive]}
                      onPress={() => setRecordForm((p: any) => ({ ...p, record_type: rt.id }))}
                    >
                      <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>{rt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Intensidade *</Text>
              <View style={styles.buttonGroup}>
                {SEVERITIES.map((sev) => {
                  const active = recordForm.severity === sev.id;
                  return (
                    <TouchableOpacity
                      key={sev.id}
                      style={[styles.groupButton, active && { borderColor: sev.color, backgroundColor: sev.bg }]}
                      onPress={() => setRecordForm((p: any) => ({ ...p, severity: sev.id }))}
                    >
                      <Text style={[styles.groupButtonText, active && { color: sev.color, fontWeight: '800' }]}>{sev.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Sintoma Principal / Descrição *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Dor na garganta ao engolir"
                value={recordForm.symptoms}
                onChangeText={(text) => setRecordForm((p: any) => ({ ...p, symptoms: text }))}
              />

              <Text style={styles.formLabel}>Temperatura (°C - opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 38.2"
                keyboardType="numeric"
                value={recordForm.temperature}
                onChangeText={(text) => setRecordForm((p: any) => ({ ...p, temperature: text }))}
              />

              <Text style={styles.formLabel}>Outras Anotações</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Demos um copo de água e dipirona."
                value={recordForm.notes}
                onChangeText={(text) => setRecordForm((p: any) => ({ ...p, notes: text }))}
                multiline
              />

              <TouchableOpacity style={styles.btnSubmit} onPress={handleSaveRecord}>
                <Text style={styles.btnSubmitText}>Salvar Registro 💾</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: CONSULTAS */}
      <Modal visible={showApptModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📅 Agendar Consulta</Text>
              <TouchableOpacity onPress={() => setShowApptModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Filho *</Text>
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {children.map((c) => {
                    const active = apptForm.child_id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.selectorChip, active && styles.selectorChipActive]}
                        onPress={() => setApptForm((p: any) => ({ ...p, child_id: c.id }))}
                      >
                        <UserAvatar
                          avatarUrl={c.avatar_url}
                          avatarPreset={c.avatar_preset}
                          name={c.name}
                          size={18}
                          bordered={false}
                          backgroundColor={c.color ? `${c.color}20` : undefined}
                        />
                        <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.formLabel}>Título do Agendamento *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Pediatra Geral / Dentista Semestral"
                value={apptForm.title}
                onChangeText={(text) => setApptForm((p: any) => ({ ...p, title: text }))}
              />

              <Text style={styles.formLabel}>Especialidade Médica</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Pediatria, Oftalmologia"
                value={apptForm.specialty}
                onChangeText={(text) => setApptForm((p: any) => ({ ...p, specialty: text }))}
              />

              <Text style={styles.formLabel}>Nome do Médico / Profissional</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Dr. Roberto Alencar"
                value={apptForm.professional_name}
                onChangeText={(text) => setApptForm((p: any) => ({ ...p, professional_name: text }))}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Data (AAAA-MM-DD) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2026-06-15"
                    value={apptForm.appointment_date}
                    onChangeText={(text) => setApptForm((p: any) => ({ ...p, appointment_date: text }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Hora (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="14:30"
                    value={apptForm.appointment_time}
                    onChangeText={(text) => setApptForm((p: any) => ({ ...p, appointment_time: text }))}
                  />
                </View>
              </View>

              <Text style={styles.formLabel}>Local da Consulta</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Clínica Saúde e Vida - Sala 204"
                value={apptForm.location}
                onChangeText={(text) => setApptForm((p: any) => ({ ...p, location: text }))}
              />

              <Text style={styles.formLabel}>Instruções / Notas</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Levar carteirinha e exames anteriores."
                value={apptForm.notes}
                onChangeText={(text) => setApptForm((p: any) => ({ ...p, notes: text }))}
                multiline
              />

              <TouchableOpacity style={styles.btnSubmit} onPress={handleSaveAppt}>
                <Text style={styles.btnSubmitText}>Salvar Consulta 💾</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: REMÉDIOS */}
      <Modal visible={showMedModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💊 Cadastrar Medicação</Text>
              <TouchableOpacity onPress={() => setShowMedModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Filho *</Text>
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {children.map((c) => {
                    const active = medForm.child_id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.selectorChip, active && styles.selectorChipActive]}
                        onPress={() => setMedForm((p: any) => ({ ...p, child_id: c.id }))}
                      >
                        <UserAvatar
                          avatarUrl={c.avatar_url}
                          avatarPreset={c.avatar_preset}
                          name={c.name}
                          size={18}
                          bordered={false}
                          backgroundColor={c.color ? `${c.color}20` : undefined}
                        />
                        <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.formLabel}>Nome do Remédio *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Amoxicilina 250mg / Dipirona Gotas"
                value={medForm.name}
                onChangeText={(text) => setMedForm((p: any) => ({ ...p, name: text }))}
              />

              <Text style={styles.formLabel}>Dosagem *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 5 ml / 15 gotas / 1 comprimido"
                value={medForm.dosage}
                onChangeText={(text) => setMedForm((p: any) => ({ ...p, dosage: text }))}
              />

              <Text style={styles.formLabel}>Frequência de Uso *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: A cada 8 horas / 1x ao dia pela manhã"
                value={medForm.frequency}
                onChangeText={(text) => setMedForm((p: any) => ({ ...p, frequency: text }))}
              />

              <Text style={styles.formLabel}>Recomendações / Anotações</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Tomar após as refeições. Manter na geladeira."
                value={medForm.notes}
                onChangeText={(text) => setMedForm((p: any) => ({ ...p, notes: text }))}
                multiline
              />

              <TouchableOpacity style={styles.btnSubmit} onPress={handleSaveMed}>
                <Text style={styles.btnSubmitText}>Salvar Medicamento 💾</Text>
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
  filterContainer: { padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel:     { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  filterChip:      { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.full, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChipActive: { backgroundColor: '#EC489912', borderColor: '#EC4899' },
  filterChipText:   { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: '#EC4899', fontWeight: '800' },

  tabsContainer: { flexDirection: 'row', backgroundColor: Colors.surface, paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: Colors.border },
  tabBtn:       { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  tabBtnActive: { borderColor: '#EC4899' },
  tabBtnText:   { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  tabBtnTextActive: { color: '#EC4899', fontWeight: '800' },

  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 110 },
  centerContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },

  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  flexBetweenRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  flexRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnAdd: { backgroundColor: '#EC4899', borderRadius: Radii.full, paddingVertical: 6, paddingHorizontal: 12, ...Shadow.sm },
  btnAddText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800' },

  emptyState: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  emptyTextTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  emptyTextSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },

  // KPIs
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: Colors.primaryLight, padding: 14, alignItems: 'center' },
  kpiVal:  { fontSize: FontSize.xl, fontWeight: '900', color: Colors.primary },
  kpiLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700', marginTop: 4, textAlign: 'center' },

  blockCard: { padding: 16, marginBottom: 12 },
  blockTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  emptyBlockText: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemTitle: { fontSize: FontSize.xs + 1, fontWeight: '800', color: Colors.text },
  itemSubtitle: { fontSize: FontSize.xs - 1, color: Colors.textSecondary },

  // Data Cards
  dataCard: { padding: 16, marginBottom: 12 },
  cardMainTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text },
  cardSubtitle: { fontSize: FontSize.xs - 1, color: Colors.textSecondary, marginTop: 2 },
  cardDesc: { fontSize: FontSize.xs + 1, color: Colors.text, marginVertical: 8 },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 2 },
  cardObs:  { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  btnAction: { flex: 1, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  btnActionText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  // Logs
  logListCard: { padding: 12, marginBottom: 8 },
  logMedName: { fontSize: FontSize.xs + 1, fontWeight: '800', color: Colors.text },
  logDetail: { fontSize: FontSize.xs - 1, color: Colors.textSecondary, marginTop: 2 },
  logNotes: { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  btnDeleteLog: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' },
  btnDeleteLogText: { color: Colors.danger, fontSize: FontSize.xs, fontWeight: 'bold' },

  // Modais
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:   { fontSize: FontSize.base, fontWeight: '900', color: Colors.text },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLighter, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { fontSize: 14, color: Colors.primary, fontWeight: 'bold' },
  modalBody:    { paddingTop: 12 },
  formLabel:    { fontSize: FontSize.xs, fontWeight: '800', color: Colors.text, marginBottom: 6, marginTop: 8 },
  selectorChip: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.full, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectorChipActive: { backgroundColor: '#EC489912', borderColor: '#EC4899' },
  selectorChipText:   { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },
  selectorChipTextActive: { color: '#EC4899', fontWeight: '800' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },

  buttonGroup: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  groupButton: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.md, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.bg },
  groupButtonText: { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },

  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.md, padding: 10, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.bg, marginBottom: 8 },
  textarea: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.md, padding: 10, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.bg, marginBottom: 8, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 10 },
  btnSubmit: { backgroundColor: '#EC4899', borderRadius: Radii.full, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', ...Shadow.btn, marginTop: 12, marginBottom: 30 },
  btnSubmitText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
});
