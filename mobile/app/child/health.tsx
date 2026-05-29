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
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import api from '../../src/services/api';
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

export default function ChildHealthScreen() {
  const router = useRouter();
  const { childProfile } = useAuth();

  const [tab, setTab] = useState<'medications' | 'symptoms' | 'appointments'>('medications');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Dados da API
  const [medications, setMedications] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Formulário de Sintoma
  const [symptomForm, setSymptomForm] = useState({
    record_type: 'other',
    severity: 'mild',
    symptoms: '',
    temperature: '',
    notes: '',
    stayed_home: false,
    medication_given: '',
  });

  const loadData = useCallback(async (isRefresh = false) => {
    if (!childProfile?.id) return;
    try {
      if (!isRefresh) setLoading(true);

      const params = { child_id: childProfile.id };
      const [rMeds, rAppts, rLogs] = await Promise.all([
        api.get('/health/medications', { params }),
        api.get('/health/appointments', { params }),
        api.get('/health/medication-logs', { params }),
      ]);

      setMedications(rMeds?.data || []);
      setAppointments(rAppts?.data || []);
      setLogs(rLogs?.data || []);
    } catch (err) {
      console.error('[ChildHealth] Erro ao carregar dados de saúde:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childProfile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Registrar que tomou uma dose
  const handleLogDose = async (medId: string, medName: string) => {
    Alert.alert(
      'Confirmar Dose 💊',
      `Confirma que você já tomou o remédio "${medName}" agora?`,
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, já tomei!',
          onPress: async () => {
            try {
              setLoading(true);
              const now = new Date();
              await api.post('/health/medication-logs', {
                medication_id: medId,
                child_id: childProfile?.id,
                taken_date: now.toISOString().split('T')[0],
                taken_time: now.toTimeString().slice(0, 5),
                status: 'taken',
                notes: 'Registrado pelo próprio filho no celular',
              });

              Alert.alert('Muito bem! 🌟', 'Dose registrada com sucesso! Seus pais foram notificados.');
              loadData(true);
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Não foi possível registrar a dose.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Enviar Sintoma
  const handleReportSymptom = async () => {
    if (!symptomForm.symptoms.trim()) {
      Alert.alert('Aviso', 'Descreva brevemente o que você está sentindo.');
      return;
    }

    try {
      setLoading(true);
      const now = new Date();
      await api.post('/health/records', {
        ...symptomForm,
        child_id: childProfile?.id,
        record_date: now.toISOString().split('T')[0],
        record_time: now.toTimeString().slice(0, 5),
        status: 'active',
        temperature: symptomForm.temperature ? parseFloat(symptomForm.temperature) : null,
      });

      Alert.alert(
        'Sintoma Reportado! ❤️',
        'Seus pais já receberam o aviso no painel deles e vão te ajudar logo. Se cuide! 🥰'
      );
      setSymptomForm({
        record_type: 'other',
        severity: 'mild',
        symptoms: '',
        temperature: '',
        notes: '',
        stayed_home: false,
        medication_given: '',
      });
      setTab('medications');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível enviar o sintoma.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateBr = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ──────────────────────────────── */}
      <LinearGradient
        colors={['#EC4899', '#D946EF', '#A855F7']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Meu Diário de Saúde ❤️</Text>
            <Text style={styles.headerSub}>Estou me cuidando super bem! 🌟</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      {/* Abas */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'medications' && styles.tabBtnActive]}
          onPress={() => setTab('medications')}
        >
          <Text style={[styles.tabBtnText, tab === 'medications' && styles.tabBtnTextActive]}>💊 Remédios</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'symptoms' && styles.tabBtnActive]}
          onPress={() => setTab('symptoms')}
        >
          <Text style={[styles.tabBtnText, tab === 'symptoms' && styles.tabBtnTextActive]}>🤒 Sintomas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'appointments' && styles.tabBtnActive]}
          onPress={() => setTab('appointments')}
        >
          <Text style={[styles.tabBtnText, tab === 'appointments' && styles.tabBtnTextActive]}>📅 Consultas</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#EC4899" />
          <Text style={styles.loadingText}>Carregando diário de saúde...</Text>
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
          {/* ── TAB 1: MEUS REMÉDIOS ── */}
          {tab === 'medications' && (
            <View>
              <Text style={styles.sectionTitle}>Remédios de Hoje</Text>
              {medications.filter(m => m.status === 'active').length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 44, marginBottom: 8 }}>🎉</Text>
                  <Text style={styles.emptyTextTitle}>Nenhum remédio ativo!</Text>
                  <Text style={styles.emptyTextSub}>Você não tem medicamentos programados para hoje.</Text>
                </View>
              ) : (
                medications.filter(m => m.status === 'active').map((m) => {
                  const myLogs = logs.filter(l => l.medication_id === m.id).slice(0, 3);
                  return (
                    <Card key={m.id} style={styles.medCard}>
                      <View style={styles.flexRowBetween}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={styles.medName}>💊 {m.name}</Text>
                          <View style={styles.badgeRow}>
                            <Badge label={`Dosagem: ${m.dosage}`} variant="ghost" />
                            <Badge label={`Frequência: ${m.frequency}`} variant="ghost" />
                          </View>
                          {m.notes ? <Text style={styles.medNotes}>Obs: {m.notes}</Text> : null}
                        </View>
                        <TouchableOpacity
                          style={styles.btnDose}
                          onPress={() => handleLogDose(m.id, m.name)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.btnDoseText}>Já tomei! 👍</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Histórico das últimas doses */}
                      {myLogs.length > 0 && (
                        <View style={styles.logBox}>
                          <Text style={styles.logTitle}>Últimas doses tomadas:</Text>
                          {myLogs.map((l) => (
                            <Text key={l.id} style={styles.logText}>
                              ✅ {l.taken_at ? new Date(l.taken_at).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </Text>
                          ))}
                        </View>
                      )}
                    </Card>
                  );
                })
              )}
            </View>
          )}

          {/* ── TAB 2: REPORTAR SINTOMA ── */}
          {tab === 'symptoms' && (
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitleInside}>🤒 Como você está se sentindo?</Text>
              <Text style={styles.helpText}>Marque abaixo se você estiver com alguma dor ou mal estar para que seus pais fiquem sabendo.</Text>

              <Text style={styles.label}>O que está sentindo? *</Text>
              <View style={styles.symptomsGrid}>
                {RECORD_TYPES.map((rt) => {
                  const active = symptomForm.record_type === rt.id;
                  return (
                    <TouchableOpacity
                      key={rt.id}
                      style={[styles.symptomChip, active && styles.symptomChipActive]}
                      onPress={() => setSymptomForm((p) => ({ ...p, record_type: rt.id }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.symptomChipText, active && styles.symptomChipTextActive]}>
                        {rt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Qual a intensidade? *</Text>
              <View style={styles.buttonGroup}>
                {SEVERITIES.map((sev) => {
                  const active = symptomForm.severity === sev.id;
                  return (
                    <TouchableOpacity
                      key={sev.id}
                      style={[
                        styles.groupButton,
                        active && { borderColor: sev.color, backgroundColor: sev.bg }
                      ]}
                      onPress={() => setSymptomForm((p) => ({ ...p, severity: sev.id }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.groupButtonText,
                        active && { color: sev.color, fontWeight: '800' }
                      ]}>
                        {sev.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Qual o sintoma principal? (Escreva aqui) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Dor na nuca forte / Nariz escorrendo"
                placeholderTextColor={Colors.textMuted}
                value={symptomForm.symptoms}
                onChangeText={(text) => setSymptomForm((p) => ({ ...p, symptoms: text }))}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Temperatura corporal (opcional - °C)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 37.5"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    value={symptomForm.temperature}
                    onChangeText={(text) => setSymptomForm((p) => ({ ...p, temperature: text }))}
                  />
                </View>
              </View>

              <Text style={styles.label}>Outras observações / Recado pros pais</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Já tomei água e estou deitado."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={2}
                value={symptomForm.notes}
                onChangeText={(text) => setSymptomForm((p) => ({ ...p, notes: text }))}
              />

              <TouchableOpacity
                style={styles.btnSubmit}
                onPress={handleReportSymptom}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSubmitText}>Reportar Sintoma 📤</Text>
              </TouchableOpacity>
            </Card>
          )}

          {/* ── TAB 3: CONSULTAS MÉDICAS ── */}
          {tab === 'appointments' && (
            <View>
              <Text style={styles.sectionTitle}>Minhas Consultas Agendadas</Text>
              {appointments.filter(a => ['scheduled', 'confirmed'].includes(a.status)).length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 44, marginBottom: 8 }}>📅</Text>
                  <Text style={styles.emptyTextTitle}>Nenhuma consulta marcada!</Text>
                  <Text style={styles.emptyTextSub}>Você não tem nenhuma consulta ou retorno agendado por enquanto.</Text>
                </View>
              ) : (
                appointments.filter(a => ['scheduled', 'confirmed'].includes(a.status)).map((a) => (
                  <Card key={a.id} style={styles.apptCard}>
                    <View style={styles.flexRowBetween}>
                      <Text style={styles.apptSpecialty}>🩺 {a.specialty || 'Consulta Médica'}</Text>
                      <Badge
                        label={a.status === 'confirmed' ? 'Confirmado ✅' : 'Agendado ⏳'}
                        variant={a.status === 'confirmed' ? 'success' : 'primary'}
                      />
                    </View>
                    <View style={styles.apptDetails}>
                      <Text style={styles.apptInfo}>📅 Data: {formatDateBr(a.appointment_date)} às {a.appointment_time || '—'}</Text>
                      {a.professional_name ? <Text style={styles.apptInfo}>👨‍⚕️ Médico: {a.professional_name}</Text> : null}
                      {a.location ? <Text style={styles.apptInfo}>📍 Local: {a.location}</Text> : null}
                      {a.reason ? <Text style={styles.apptReason}>Motivo: "{a.reason}"</Text> : null}
                    </View>
                  </Card>
                ))
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  header:  { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26, marginTop: -2 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

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
    borderColor: '#EC4899',
  },
  tabBtnText: {
    fontSize: FontSize.xs + 1,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: '#EC4899',
    fontWeight: '900',
  },

  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 110 },

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

  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 12, marginTop: 10 },
  sectionTitleInside: { fontSize: FontSize.base - 1, fontWeight: '900', color: Colors.text, marginBottom: 4 },
  flexRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

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

  // Remédios
  medCard: { padding: 16, marginBottom: 12 },
  medName: { fontSize: FontSize.base - 1, fontWeight: '800', color: Colors.text },
  badgeRow: { flexDirection: 'row', gap: 6, marginVertical: 6, flexWrap: 'wrap' },
  medNotes: { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontStyle: 'italic' },
  btnDose: {
    backgroundColor: '#EC4899',
    borderRadius: Radii.full,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  btnDoseText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800' },
  logBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logTitle: { fontSize: FontSize.xs - 1, fontWeight: '800', color: Colors.textSecondary, marginBottom: 4 },
  logText: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginBottom: 2 },

  // Reportar Sintoma
  formCard: { padding: 18, marginBottom: 20 },
  helpText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 16, lineHeight: 16 },
  label: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.text, marginBottom: 8, marginTop: 4 },
  symptomsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  symptomChip: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  symptomChipActive: {
    backgroundColor: '#EC489912',
    borderColor: '#EC4899',
  },
  symptomChipText: { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },
  symptomChipTextActive: { color: '#EC4899', fontWeight: '800' },

  buttonGroup: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  groupButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  groupButtonText: { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textSecondary },

  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.bg,
    marginBottom: 12,
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
  formRow: { flexDirection: 'row', gap: 12 },
  btnSubmit: {
    backgroundColor: '#EC4899',
    borderRadius: Radii.full,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.btn,
    marginTop: 8,
  },
  btnSubmitText: { color: '#fff', fontSize: FontSize.xs + 1, fontWeight: '800' },

  // Consultas
  apptCard: { padding: 16, marginBottom: 12 },
  apptSpecialty: { fontSize: FontSize.base - 1, fontWeight: '800', color: Colors.text },
  apptDetails: { marginTop: 10, gap: 4 },
  apptInfo: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  apptReason: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
});
