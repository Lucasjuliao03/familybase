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
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import api from '../../src/services/api';
import { supabase } from '../../src/lib/supabase';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import {
  buildPeriodConfig,
  buildSubjectBoletim,
  scoreColorByStatus,
  statusBadgeStyle,
  subjectIcon,
  gradeTypeLabel,
  formatGradeChip,
} from '../../src/shared/lib/gradesHelpers';

const PREDEFINED_SUBJECTS = [
  'Matemática', 'Português', 'Ciências', 'História', 'Geografia',
  'Educação Física', 'Artes', 'Inglês', 'Espanhol', 'Física',
  'Química', 'Biologia', 'Filosofia', 'Sociologia', 'Música',
];

const PERIOD_LABELS: Record<string, string[]> = {
  bimonthly: ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'],
  trimester:  ['1º Trimestre', '2º Trimestre', '3º Trimestre'],
};

export default function ParentGradesScreen() {
  const router = useRouter();
  const { family } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'grades' | 'settings'>('dashboard');

  const [grades, setGrades] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  
  // Filtros
  const [filterChild, setFilterChild] = useState<string>('');
  const [filterPeriod, setFilterPeriod] = useState<number>(0); // 0 = todos

  // Configurações
  const [settings, setSettings] = useState<Record<string, any>>({}); // { child_id: { evaluation_model, ... } }
  const [periods, setPeriods] = useState<Record<string, any[]>>({}); // { child_id: [periods] }
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Form de Configurações do Filho Selecionado
  const [settingsForm, setSettingsForm] = useState<any>({
    evaluation_model: 'bimonthly',
    approval_pct: '60',
    goal_pct: '80',
    attention_pct: '50',
    risk_pct: '75',
    periods: [],
  });

  // Modal Novo/Editar Nota
  const [showModal, setShowModal] = useState<boolean>(false);
  const [form, setForm] = useState<any>({
    id: null,
    subject: '',
    type: 'test',
    score: '',
    max_score: '10',
    concept: '',
    observation: '',
    date: new Date().toISOString().split('T')[0],
    child_id: '',
    period_number: 1,
  });
  const [isNewSubject, setIsNewSubject] = useState<boolean>(false);

  const loadBundle = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const params: Record<string, string> = {};
      if (filterChild) params.child_id = filterChild;

      const [gradesRes, childrenRes, subjectsRes] = await Promise.all([
        api.get('/grades', { params }),
        api.get('/families/children'),
        api.get('/grades/subjects'),
      ]);

      setGrades(gradesRes?.data || []);
      const childList = childrenRes?.data || [];
      setChildren(childList);
      if (childList.length > 0 && !filterChild) {
        setFilterChild(childList[0].id);
      }

      const extra = (subjectsRes?.data || []).filter((s: string) => {
        const norm = s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return !PREDEFINED_SUBJECTS.some(p => p.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === norm);
      });
      setSubjectOptions([...PREDEFINED_SUBJECTS, ...extra]);

      if (family?.id) {
        // Carregar configurações de avaliação
        const { data: sgsRows } = await supabase
          .from('school_grade_settings')
          .select('*')
          .eq('family_id', family.id);
        if (sgsRows) {
          const map: Record<string, any> = {};
          sgsRows.forEach((r) => { map[r.child_id] = r; });
          setSettings(map);
        }

        const { data: sgpRows } = await supabase
          .from('school_grade_periods')
          .select('*')
          .eq('family_id', family.id)
          .order('period_number', { ascending: true });
        if (sgpRows) {
          const pMap: Record<string, any[]> = {};
          sgpRows.forEach((r) => {
            if (!pMap[r.child_id]) pMap[r.child_id] = [];
            pMap[r.child_id].push(r);
          });
          setPeriods(pMap);
        }
      }
    } catch (err) {
      console.error('[ParentGrades] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterChild, family?.id]);

  useEffect(() => {
    loadBundle();
  }, [loadBundle]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBundle(true);
  }, [loadBundle]);

  // Sincronizar form de configurações ao selecionar/atualizar o filho filtrado
  useEffect(() => {
    if (!filterChild) return;
    const s = settings[filterChild] || { evaluation_model: 'bimonthly', approval_pct: 60, goal_pct: 80, attention_pct: 50, risk_pct: 75 };
    const childPeriods = periods[filterChild] || [];
    const pCfg = buildPeriodConfig(s, childPeriods);
    setSettingsForm({
      evaluation_model: s.evaluation_model,
      approval_pct: String(s.approval_pct || 60),
      goal_pct: String(s.goal_pct || 80),
      attention_pct: String(s.attention_pct || 50),
      risk_pct: String(s.risk_pct || 75),
      periods: pCfg,
    });
  }, [filterChild, settings, periods]);

  const activeSettings = useMemo(() => {
    return (filterChild && settings[filterChild]) || { evaluation_model: 'bimonthly' };
  }, [filterChild, settings]);

  const periodLabels = useMemo(() => {
    return PERIOD_LABELS[activeSettings.evaluation_model] || PERIOD_LABELS.bimonthly;
  }, [activeSettings]);

  // Filtrar notas listadas por período
  const filteredGrades = useMemo(() => {
    return grades.filter((g) => {
      if (filterPeriod && Number(g.period_number) !== Number(filterPeriod)) return false;
      return true;
    });
  }, [grades, filterPeriod]);

  // Operações de Lançamento/Edição
  const handleSubmit = async () => {
    if (!form.child_id) {
      Alert.alert('Erro', 'Selecione um filho.');
      return;
    }
    const subjectName = isNewSubject ? form.subject.trim() : form.subject;
    if (!subjectName.trim()) {
      Alert.alert('Erro', 'Insira uma disciplina/matéria.');
      return;
    }

    try {
      const payload = {
        ...form,
        subject: subjectName,
        score: form.score !== '' ? parseFloat(form.score) : null,
        max_score: parseFloat(form.max_score) || 10,
        period_number: Number(form.period_number),
        period_type: activeSettings.evaluation_model,
      };

      if (form.id) {
        await api.put(`/grades/${form.id}`, payload);
        Alert.alert('Sucesso', 'Nota atualizada com sucesso!');
      } else {
        await api.post('/grades', payload);
        // Se tirou nota máxima, o filho ganha XP. Notifica o pai!
        const isMaxGrade = form.type !== 'concept' && payload.score != null && payload.score === payload.max_score;
        if (isMaxGrade) {
          Alert.alert(
            'Nota Máxima! 🏆',
            'O seu filho obteve nota máxima e foi premiado com +50 XP no perfil!'
          );
        } else {
          Alert.alert('Sucesso', 'Nota cadastrada com sucesso!');
        }
      }

      setShowModal(false);
      setForm({
        id: null,
        subject: '',
        type: 'test',
        score: '',
        max_score: '10',
        concept: '',
        observation: '',
        date: new Date().toISOString().split('T')[0],
        child_id: '',
        period_number: 1,
      });
      setIsNewSubject(false);
      loadBundle();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao salvar nota.');
    }
  };

  const handleEdit = (grade: any) => {
    const isCustom = grade.subject && !subjectOptions.includes(grade.subject);
    setIsNewSubject(isCustom);
    setForm({
      id: grade.id,
      subject: grade.subject || '',
      type: grade.type || 'test',
      score: grade.score != null ? String(grade.score) : '',
      max_score: grade.max_score != null ? String(grade.max_score) : '10',
      concept: grade.concept || '',
      observation: grade.observation || '',
      date: grade.date ? grade.date.split('T')[0] : new Date().toISOString().split('T')[0],
      child_id: grade.child_id || '',
      period_number: grade.period_number || 1,
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/grades/${id}`);
              Alert.alert('Sucesso', 'Nota excluída com sucesso.');
              loadBundle();
            } catch (err: any) {
              Alert.alert('Erro', 'Ocorreu um erro ao excluir a nota.');
            }
          },
        },
      ]
    );
  };

  // Salvar Configurações
  const handleSaveSettings = async () => {
    if (!filterChild) return;
    if (!family?.id) return;
    
    setSavingSettings(true);
    try {
      const { evaluation_model, periods: formPeriods, approval_pct, goal_pct, attention_pct, risk_pct } = settingsForm;
      const count = evaluation_model === 'trimester' ? 3 : 4;
      const validPeriods = formPeriods.slice(0, count);

      const totalPoints = validPeriods.reduce((sum: number, p: any) => sum + (Number(p.total_points) || 0), 0);

      const payload = {
        family_id: family.id,
        child_id: filterChild,
        evaluation_model,
        periods_count: count,
        annual_total_points: totalPoints,
        approval_pct: Number(approval_pct),
        goal_pct: Number(goal_pct),
        attention_pct: Number(attention_pct),
        risk_pct: Number(risk_pct),
      };

      const { error: err1 } = await supabase
        .from('school_grade_settings')
        .upsert(payload, { onConflict: 'family_id,child_id' });
      if (err1) throw err1;

      // Salvar períodos
      for (const p of validPeriods) {
        const pPayload = {
          family_id: family.id,
          child_id: filterChild,
          period_number: p.number,
          period_label: p.label || `Período ${p.number}`,
          total_points: Number(p.total_points),
          approval_pct: Number(p.approval_pct),
          weight: Number(p.weight),
        };
        const { error: err2 } = await supabase
          .from('school_grade_periods')
          .upsert(pPayload, { onConflict: 'family_id,child_id,period_number' });
        if (err2) throw err2;
      }

      Alert.alert('Sucesso', 'Configurações escolares salvas com sucesso!');
      loadBundle();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePeriodFormChange = (idx: number, field: string, val: string) => {
    setSettingsForm((prev: any) => {
      const newP = [...prev.periods];
      newP[idx] = { ...newP[idx], [field]: val };
      return { ...prev, periods: newP };
    });
  };

  const handleModelChange = (model: string) => {
    setSettingsForm((prev: any) => {
      const childPeriods = periods[filterChild] || [];
      const pCfg = buildPeriodConfig({ evaluation_model: model, approval_pct: Number(prev.approval_pct) }, childPeriods);
      return { ...prev, evaluation_model: model, periods: pCfg };
    });
  };

  const selectedChildGrades = useMemo(() => {
    return filterChild ? grades.filter((g) => g.child_id === filterChild) : grades;
  }, [grades, filterChild]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header padronizado */}
      <ModuleHeader
        title="Boletim Escolar"
        emoji="📚"
        subtitle="Gerencie o desempenho escolar dos seus filhos"
        onBack={() => router.back()}
        right={(
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              setForm({
                id: null,
                subject: '',
                type: 'test',
                score: '',
                max_score: '10',
                concept: '',
                observation: '',
                date: new Date().toISOString().split('T')[0],
                child_id: children[0]?.id || '',
                period_number: 1,
              });
              setIsNewSubject(false);
              setShowModal(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Nota</Text>
          </TouchableOpacity>
        )}
      />

      {/* Filtros rápidos superior */}
      <View style={styles.filtersBar}>
        <View style={styles.pickerWrapper}>
          <Text style={styles.filterLabel}>Filho:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {/* "Todos" chip removed to always keep one child selected */}
            {children.map((c) => {
              const active = filterChild === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilterChild(c.id)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.pickerWrapper, { marginTop: 8 }]}>
          <Text style={styles.filterLabel}>Período:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity
              style={[styles.filterChip, filterPeriod === 0 && styles.filterChipActive]}
              onPress={() => setFilterPeriod(0)}
            >
              <Text style={[styles.filterChipText, filterPeriod === 0 && styles.filterChipTextActive]}>Todos</Text>
            </TouchableOpacity>
            {periodLabels.map((l, i) => {
              const active = filterPeriod === i + 1;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilterPeriod(i + 1)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{l.split(' ')[0]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {[
          { key: 'dashboard', label: '📊 Boletim' },
          { key: 'grades', label: '📋 Notas' },
          { key: 'settings', label: '⚙️ Ajustes' },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loaderText}>Carregando dados escolares...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
        >
          {/* ── TAB 1: DASHBOARD (BOLETIM) ── */}
          {activeTab === 'dashboard' && (
            <View style={styles.tabView}>
              {!filterChild ? (
                <View style={styles.selectPromptCard}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>👦👧</Text>
                  <Text style={styles.selectPromptTitle}>Selecione um Aluno</Text>
                  <Text style={styles.selectPromptSubtitle}>
                    Escolha um de seus filhos no menu superior para ver o boletim e histórico escolar.
                  </Text>
                </View>
              ) : (() => {
                const childSettings = settings[filterChild] || { evaluation_model: 'bimonthly', approval_pct: 60 };
                const childPeriods = periods[filterChild] || [];
                const pConfig = buildPeriodConfig(childSettings, childPeriods);
                const boletim = buildSubjectBoletim(selectedChildGrades, pConfig, childSettings);

                return (
                  <View style={{ gap: 16 }}>
                    {/* Resumo de KPIs */}
                    <View style={styles.kpiRow}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Média Geral</Text>
                        <Text style={[styles.kpiVal, { color: Colors.primary }]}>
                          {boletim.overall.avg !== null ? boletim.overall.avg.toFixed(1).replace('.', ',') : '—'}
                        </Text>
                      </View>
                      <View style={[styles.kpiCard, { borderColor: Colors.success }]}>
                        <Text style={[styles.kpiLabel, { color: Colors.success }]}>Aprovado/Conf.</Text>
                        <Text style={[styles.kpiVal, { color: Colors.success }]}>
                          {boletim.overall.approved}
                        </Text>
                      </View>
                      {boletim.overall.attention > 0 && (
                        <View style={[styles.kpiCard, { borderColor: Colors.warning }]}>
                          <Text style={[styles.kpiLabel, { color: Colors.warning }]}>Atenção</Text>
                          <Text style={[styles.kpiVal, { color: Colors.warning }]}>
                            {boletim.overall.attention}
                          </Text>
                        </View>
                      )}
                      {(boletim.overall.risk > 0 || boletim.overall.failed > 0) && (
                        <View style={[styles.kpiCard, { borderColor: Colors.danger }]}>
                          <Text style={[styles.kpiLabel, { color: Colors.danger }]}>Risco/Reprov.</Text>
                          <Text style={[styles.kpiVal, { color: Colors.danger }]}>
                            {boletim.overall.risk + boletim.overall.failed}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Resumo para os Pais */}
                    <Card style={styles.summaryInfoCard} shadow="sm">
                      <Text style={styles.summaryTitle}>💡 Resumo Escolar</Text>
                      <Text style={styles.summaryText}>
                        Seu filho(a) tem <Text style={{ fontWeight: '800' }}>{boletim.overall.totalSubjects} disciplinas</Text> registradas.
                        {'\n'}Status: <Text style={{ color: Colors.success, fontWeight: '700' }}>{boletim.overall.approved} Confortável(is)</Text>,{' '}
                        <Text style={{ color: '#D97706', fontWeight: '700' }}>{boletim.overall.attention} em Atenção</Text> e{' '}
                        <Text style={{ color: Colors.danger, fontWeight: '700' }}>{boletim.overall.risk + boletim.overall.failed} em Risco/Reprovadas</Text>.
                      </Text>
                    </Card>

                    {/* Lista de Matérias */}
                    {boletim.subjects.map((subj) => (
                      <Card
                        key={subj.name}
                        style={[styles.subjectCard, { borderLeftColor: scoreColorByStatus(subj.status) }]}
                        shadow="sm"
                      >
                        <View style={styles.subjHeader}>
                          <View style={styles.subjHeaderLeft}>
                            <View style={styles.subjIconContainer}>
                              <Text style={{ fontSize: 18 }}>{subjectIcon(subj.name)}</Text>
                            </View>
                            <View>
                              <Text style={styles.subjName}>{subj.name}</Text>
                              {subj.teacher ? (
                                <Text style={styles.subjTeacher}>Prof. {subj.teacher}</Text>
                              ) : null}
                            </View>
                          </View>

                          <View style={[styles.subjStatusBadge, statusBadgeStyle(subj.status) as any]}>
                            <Text style={styles.subjStatusText}>{subj.statusLabel}</Text>
                          </View>
                        </View>

                        {subj.maxEvaluated > 0 ? (
                          <View style={styles.subjDetails}>
                            <View style={styles.subjProgressRow}>
                              <Text style={styles.subjProgressText}>
                                Acumulado: <Text style={{ fontWeight: '700' }}>{subj.obtained.toFixed(1)}</Text> / {subj.maxEvaluated.toFixed(1)} pts
                              </Text>
                              <Text style={styles.subjAvgText}>Média: {subj.currentAvg?.toFixed(1)}</Text>
                            </View>

                            {subj.status !== 'approved' && subj.missing > 0 && subj.remainingAnnualPoints > 0 && (
                              <View style={styles.missingNotesCard}>
                                <Text style={styles.missingNotesText}>
                                  Faltam <Text style={{ fontWeight: '800', color: scoreColorByStatus(subj.status) }}>{subj.missing.toFixed(1)} pts</Text> nos {subj.remainingAnnualPoints.toFixed(1)} pts restantes para aprovação. ({subj.requiredRate.toFixed(0)}% de aproveitamento).
                                </Text>
                              </View>
                            )}

                            {/* Detalhe de Períodos */}
                            <View style={styles.periodRowList}>
                              {subj.periods
                                .filter((p) => !filterPeriod || Number(p.number) === Number(filterPeriod))
                                .map((p) => (
                                  <View key={p.number} style={styles.periodMiniRow}>
                                    <Text style={styles.periodMiniLabel}>{p.label}</Text>
                                    {p.hasData ? (
                                      <Text style={[styles.periodMiniVal, { color: p.passed ? Colors.success : Colors.danger }]}>
                                        {p.obtained.toFixed(1)} / {p.maxEvaluated} <Text style={styles.periodMiniPct}>({p.pct.toFixed(0)}%)</Text>
                                      </Text>
                                    ) : (
                                      <Text style={styles.periodMiniEmpty}>—</Text>
                                    )}
                                  </View>
                                ))}
                            </View>
                          </View>
                        ) : (
                          <Text style={styles.subjEmptyWarn}>Sem avaliações lançadas nesta matéria.</Text>
                        )}
                      </Card>
                    ))}

                    {boletim.subjects.length === 0 && (
                      <Text style={styles.noGradesText}>Nenhuma matéria registrada. Toque em "+ Nota" para começar!</Text>
                    )}
                  </View>
                );
              })()}
            </View>
          )}

          {/* ── TAB 2: LISTAGEM DE NOTAS (LISTA DETALHADA) ── */}
          {activeTab === 'grades' && (
            <View style={styles.tabView}>
              {filteredGrades.length === 0 ? (
                <View style={styles.selectPromptCard}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
                  <Text style={styles.selectPromptTitle}>Nenhuma nota encontrada</Text>
                  <Text style={styles.selectPromptSubtitle}>
                    {filterChild
                      ? 'Nenhuma nota registrada com estes filtros para o filho selecionado.'
                      : 'Nenhuma nota registrada na família ainda.'}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {filteredGrades.map((g) => {
                    const childObj = children.find((c) => c.id === g.child_id);
                    const dateStr = g.date ? new Date(g.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                    
                    return (
                      <Card key={g.id} style={styles.gradeCard} shadow="sm">
                        <View style={styles.gradeCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.gradeCardSubj}>{g.subject}</Text>
                            <View style={styles.gradeCardChildRow}>
                              <UserAvatar
                                avatarUrl={childObj?.avatar_url}
                                avatarPreset={childObj?.avatar_preset}
                                name={g.child_name || childObj?.name}
                                size={22}
                                bordered={false}
                                backgroundColor={g.child_color || Colors.primaryLighter}
                              />
                              <Text style={styles.gradeCardChildName}>{g.child_name || 'Criança'}</Text>
                            </View>
                          </View>

                          <View style={styles.gradeCardScoreCol}>
                            <Text style={[styles.gradeCardScore, { color: g.score >= (g.max_score * 0.7) ? Colors.success : Colors.danger }]}>
                              {g.score}/{g.max_score}
                            </Text>
                            <Text style={styles.gradeCardType}>{gradeTypeLabel(g.type)}</Text>
                          </View>
                        </View>

                        {g.observation ? (
                          <Text style={styles.gradeCardObs}>💬 {g.observation}</Text>
                        ) : null}

                        <View style={styles.gradeCardFooter}>
                          <Text style={styles.gradeCardDate}>📅 {dateStr} · {PERIOD_LABELS[g.period_type || 'bimonthly']?.[g.period_number - 1] || `Período ${g.period_number}`}</Text>
                          <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(g)}>
                              <Text style={styles.actionText}>✏️ Editar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, { borderColor: Colors.danger + '40' }]} onPress={() => handleDelete(g.id)}>
                              <Text style={[styles.actionText, { color: Colors.danger }]}>🗑️ Excluir</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ── TAB 3: CONFIGURAÇÃO DE MODELO E METAS ── */}
          {activeTab === 'settings' && (
            <View style={styles.tabView}>
              {!filterChild ? (
                <View style={styles.selectPromptCard}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>⚙️</Text>
                  <Text style={styles.selectPromptTitle}>Selecione um Aluno</Text>
                  <Text style={styles.selectPromptSubtitle}>
                    Escolha um de seus filhos no menu superior para configurar o boletim escolar e o modelo avaliativo.
                  </Text>
                </View>
              ) : (
                <Card style={styles.settingsCard} shadow="sm">
                  <Text style={styles.settingsHeadline}>⚙️ Configurar Boletim Escolar</Text>
                  
                  <Text style={styles.formLabel}>Modelo de avaliação</Text>
                  <View style={styles.modelGrid}>
                    <TouchableOpacity
                      style={[styles.modelButton, settingsForm.evaluation_model === 'bimonthly' && styles.modelButtonActive]}
                      onPress={() => handleModelChange('bimonthly')}
                    >
                      <Text style={[styles.modelBtnText, settingsForm.evaluation_model === 'bimonthly' && styles.modelBtnTextActive]}>
                        📅 4 Bimestres
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modelButton, settingsForm.evaluation_model === 'trimester' && styles.modelButtonActive]}
                      onPress={() => handleModelChange('trimester')}
                    >
                      <Text style={[styles.modelBtnText, settingsForm.evaluation_model === 'trimester' && styles.modelBtnTextActive]}>
                        📆 3 Trimestres
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.formRow}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.formLabel}>Média Escola (%)</Text>
                      <TextInput
                        style={styles.formInput}
                        keyboardType="numeric"
                        value={settingsForm.approval_pct}
                        onChangeText={(t) => setSettingsForm((prev: any) => ({ ...prev, approval_pct: t }))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>Meta Família (%)</Text>
                      <TextInput
                        style={styles.formInput}
                        keyboardType="numeric"
                        value={settingsForm.goal_pct}
                        onChangeText={(t) => setSettingsForm((prev: any) => ({ ...prev, goal_pct: t }))}
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.formLabel}>Alerta Atenção (%)</Text>
                      <TextInput
                        style={styles.formInput}
                        keyboardType="numeric"
                        value={settingsForm.attention_pct}
                        onChangeText={(t) => setSettingsForm((prev: any) => ({ ...prev, attention_pct: t }))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>Alerta Risco (%)</Text>
                      <TextInput
                        style={styles.formInput}
                        keyboardType="numeric"
                        value={settingsForm.risk_pct}
                        onChangeText={(t) => setSettingsForm((prev: any) => ({ ...prev, risk_pct: t }))}
                      />
                    </View>
                  </View>

                  <Text style={styles.sectionDivider}>Configuração por Período</Text>
                  
                  <View style={{ gap: 12, marginBottom: 20 }}>
                    {settingsForm.periods.map((p: any, idx: number) => (
                      <View key={p.number} style={styles.periodConfigBlock}>
                        <Text style={styles.periodConfigName}>{p.label}</Text>
                        <View style={styles.formRow}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.miniLabel}>Total pts</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(p.total_points)}
                              onChangeText={(val) => handlePeriodFormChange(idx, 'total_points', val)}
                            />
                          </View>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.miniLabel}>Aprovação %</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(p.approval_pct)}
                              onChangeText={(val) => handlePeriodFormChange(idx, 'approval_pct', val)}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.miniLabel}>Peso</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(p.weight)}
                              onChangeText={(val) => handlePeriodFormChange(idx, 'weight', val)}
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleSaveSettings}
                    disabled={savingSettings}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.submitBtnText}>
                      {savingSettings ? 'Salvando...' : '💾 Salvar Configurações'}
                    </Text>
                  </TouchableOpacity>
                </Card>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal: Nova/Editar Nota */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowModal(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {form.id ? '📝 Editar Nota' : '📚 Cadastrar Nota'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Filho *</Text>
              <View style={styles.pickerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {children.map((c) => {
                    const active = form.child_id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.formPeriodChip, active && styles.formPeriodChipActive]}
                        onPress={() => setForm((prev: any) => ({ ...prev, child_id: c.id }))}
                      >
                        <Text style={[styles.formPeriodText, active && styles.formPeriodTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.formLabel}>Disciplina *</Text>
              {!isNewSubject ? (
                <View style={{ marginBottom: 14 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {subjectOptions.map((s) => {
                      const active = form.subject === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.formPeriodChip, active && styles.formPeriodChipActive]}
                          onPress={() => setForm((prev: any) => ({ ...prev, subject: s }))}
                        >
                          <Text style={[styles.formPeriodText, active && styles.formPeriodTextActive]}>
                            {subjectIcon(s)} {s}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.formPeriodChip, { borderColor: Colors.primary }]}
                      onPress={() => {
                        setIsNewSubject(true);
                        setForm((prev: any) => ({ ...prev, subject: '' }));
                      }}
                    >
                      <Text style={[styles.formPeriodText, { color: Colors.primary }]}>➕ Outra...</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              ) : (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={[styles.formInput, { flex: 1, marginBottom: 0 }]}
                      placeholder="Nome da disciplina..."
                      placeholderTextColor={Colors.textMuted}
                      value={form.subject}
                      onChangeText={(text) => setForm((prev: any) => ({ ...prev, subject: text }))}
                    />
                    <TouchableOpacity
                      style={{ padding: 10, backgroundColor: Colors.bg, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border }}
                      onPress={() => {
                        setIsNewSubject(false);
                        setForm((prev: any) => ({ ...prev, subject: subjectOptions[0] || '' }));
                      }}
                    >
                      <Text style={{ fontSize: 12, color: Colors.textSecondary, fontWeight: '700' }}>Lista 📋</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Período</Text>
                  <View style={styles.pickerContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {periodLabels.map((l, i) => {
                        const num = i + 1;
                        const active = form.period_number === num;
                        return (
                          <TouchableOpacity
                            key={num}
                            style={[styles.formPeriodChip, active && styles.formPeriodChipActive]}
                            onPress={() => setForm((prev: any) => ({ ...prev, period_number: num }))}
                          >
                            <Text style={[styles.formPeriodText, active && styles.formPeriodTextActive]}>
                              {l.split(' ')[0]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </View>

              <Text style={styles.formLabel}>Tipo de avaliação</Text>
              <View style={styles.typePickerRow}>
                {['test', 'homework', 'project', 'concept'].map((t) => {
                  const label = t === 'test' ? '📝 Prova' : t === 'homework' ? '🏠 Dever' : t === 'project' ? '🎨 Trab.' : '🅰️ Conceito';
                  const active = form.type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typePickerItem, active && styles.typePickerItemActive]}
                      onPress={() => setForm((prev: any) => ({ ...prev, type: t }))}
                    >
                      <Text style={[styles.typePickerText, active && styles.typePickerTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {form.type !== 'concept' ? (
                <View style={styles.formRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.formLabel}>Nota Obtida</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Ex: 8.5"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      value={form.score}
                      onChangeText={(text) => setForm((prev: any) => ({ ...prev, score: text }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Nota Máxima</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Ex: 10"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      value={form.max_score}
                      onChangeText={(text) => setForm((prev: any) => ({ ...prev, max_score: text }))}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.formLabel}>Conceito</Text>
                  <View style={styles.conceptRow}>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((c) => {
                      const active = form.concept === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[styles.conceptButton, active && styles.conceptButtonActive]}
                          onPress={() => setForm((prev: any) => ({ ...prev, concept: c }))}
                        >
                          <Text style={[styles.conceptText, active && styles.conceptTextActive]}>{c}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.formLabel}>Observação</Text>
              <TextInput
                style={styles.formTextArea}
                placeholder="Ex: Prova final de bimestre."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={form.observation}
                onChangeText={(text) => setForm((prev: any) => ({ ...prev, observation: text }))}
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              activeOpacity={0.8}
            >
              <Text style={styles.submitBtnText}>Salvar Nota 💾</Text>
            </TouchableOpacity>
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
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 8,
    paddingHorizontal: 16,
    ...Shadow.sm,
  },
  addBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  filtersBar: {
    padding: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginRight: 10,
    minWidth: 50,
  },
  filterChip: {
    backgroundColor: Colors.bg,
    borderRadius: Radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loaderText: {
    marginTop: 12,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  tabView: {
    padding: 16,
  },
  selectPromptCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 20,
    ...Shadow.sm,
  },
  selectPromptTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  selectPromptSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Dashboard
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
    ...Shadow.sm,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  kpiVal: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    marginTop: 4,
  },
  summaryInfoCard: {
    padding: 14,
    backgroundColor: Colors.primaryLighter + '40',
    borderColor: Colors.primaryLighter,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  subjectCard: {
    padding: 16,
    borderLeftWidth: 4,
    backgroundColor: Colors.surface,
  },
  subjHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subjIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subjName: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  subjTeacher: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  subjStatusBadge: {
    borderRadius: Radii.xs,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  subjStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  subjDetails: {
    marginTop: 12,
  },
  subjProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjProgressText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  subjAvgText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  missingNotesCard: {
    backgroundColor: Colors.bg,
    borderRadius: Radii.sm,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  missingNotesText: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 14,
  },
  periodRowList: {
    borderTopWidth: 1,
    borderColor: Colors.borderLight,
    paddingTop: 8,
    gap: 6,
  },
  periodMiniRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodMiniLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  periodMiniVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  periodMiniPct: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '400',
  },
  periodMiniEmpty: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  subjEmptyWarn: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 10,
  },
  noGradesText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // Grade Card List
  gradeCard: {
    padding: 14,
    backgroundColor: Colors.surface,
  },
  gradeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
    paddingBottom: 10,
  },
  gradeCardSubj: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  gradeCardChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  miniAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeCardChildName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  gradeCardScoreCol: {
    alignItems: 'flex-end',
  },
  gradeCardScore: {
    fontSize: FontSize.md,
    fontWeight: '900',
  },
  gradeCardType: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 2,
  },
  gradeCardObs: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
  },
  gradeCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  gradeCardDate: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: Colors.primaryLight + '50',
    borderRadius: Radii.xs,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.bg + '10',
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  // Settings Card
  settingsCard: {
    padding: 16,
    backgroundColor: Colors.surface,
  },
  settingsHeadline: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 16,
  },
  modelGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  modelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  modelButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  modelBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  modelBtnTextActive: {
    color: Colors.primary,
  },
  sectionDivider: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 6,
    marginTop: 10,
    marginBottom: 12,
  },
  periodConfigBlock: {
    backgroundColor: Colors.bg + '30',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    padding: 10,
  },
  periodConfigName: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  miniLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  miniInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xs,
    padding: 6,
    fontSize: 11,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 11, 75, 0.4)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '90%',
    ...Shadow.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
  },
  modalClose: {
    fontSize: 18,
    color: Colors.textSecondary,
    paddingHorizontal: 8,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.bg,
    marginBottom: 14,
  },
  formTextArea: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.bg,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  pickerContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  formPeriodChip: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  formPeriodChipActive: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.primary,
  },
  formPeriodText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  formPeriodTextActive: {
    color: Colors.primary,
  },
  typePickerRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  typePickerItem: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  typePickerItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  typePickerText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  typePickerTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  conceptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  conceptButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conceptButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLighter,
  },
  conceptText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  conceptTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.btn,
    marginTop: 10,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
