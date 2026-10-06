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
import api from '../../src/services/api';
import { supabase } from '../../src/lib/supabase';
import {
  buildPeriodConfig,
  buildSubjectBoletim,
  formatGradeChip,
  gradeTypeLabel,
  getSubjectDisplayStatus,
  schoolGoalMessage,
  familyGoalMessage,
  subjectIcon,
} from '../../src/shared/lib/gradesHelpers';

const PREDEFINED_SUBJECTS = [
  'Matemática', 'Português', 'Ciências', 'História', 'Geografia',
  'Educação Física', 'Artes', 'Inglês', 'Espanhol', 'Física',
  'Química', 'Biologia', 'Filosofia', 'Sociologia', 'Música',
];

function fmtAvg(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(1).replace('.', ',');
}

function fmtPts(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0';
  return n.toFixed(1).replace('.', ',');
}

export default function ChildGradesScreen() {
  const router = useRouter();
  const { childProfile, family, refreshProfile } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [grades, setGrades] = useState<any[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedSubjectName, setSelectedSubjectName] = useState<string | null>(null);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set([1]));

  const [settings, setSettings] = useState<any>({ evaluation_model: 'bimonthly', approval_pct: 60 });
  const [periods, setPeriods] = useState<any[]>([]);

  // Form de Lançamento de Nota
  const [form, setForm] = useState({
    subject: '',
    type: 'test',
    score: '',
    max_score: '10',
    concept: '',
    observation: '',
    date: new Date().toISOString().split('T')[0],
    period_number: 1,
  });
  const [isNewSubject, setIsNewSubject] = useState<boolean>(false);

  const loadBundle = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const [gradesRes, subjectsRes] = await Promise.all([
        api.get('/grades'),
        api.get('/grades/subjects'),
      ]);

      setGrades(gradesRes?.data || []);

      const extra = (subjectsRes?.data || []).filter((s: string) => {
        const norm = s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return !PREDEFINED_SUBJECTS.some(p => p.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === norm);
      });
      setSubjectOptions([...PREDEFINED_SUBJECTS, ...extra]);

      const cid = childProfile?.id;
      if (cid && family?.id) {
        const { data: cfg } = await supabase
          .from('school_grade_settings')
          .select('*')
          .eq('family_id', family.id)
          .eq('child_id', cid)
          .maybeSingle();
        if (cfg) setSettings(cfg);

        const { data: sgpRows } = await supabase
          .from('school_grade_periods')
          .select('*')
          .eq('family_id', family.id)
          .eq('child_id', cid)
          .order('period_number', { ascending: true });
        if (sgpRows) setPeriods(sgpRows);
      }
    } catch (err) {
      console.error('[ChildGrades] Erro ao carregar notas:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childProfile?.id, family?.id]);

  useEffect(() => {
    loadBundle();
  }, [loadBundle]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBundle(true);
  }, [loadBundle]);

  const pConfig = useMemo(() => buildPeriodConfig(settings, periods), [settings, periods]);
  const boletim = useMemo(() => buildSubjectBoletim(grades, pConfig, settings), [grades, pConfig, settings]);
  const subjects = boletim.subjects;

  useEffect(() => {
    if (!subjects.length) {
      setSelectedSubjectName(null);
      return;
    }
    setSelectedSubjectName((prev) => {
      if (prev && subjects.some((s) => s.name === prev)) return prev;
      return subjects[0].name;
    });
  }, [subjects]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.name === selectedSubjectName) || subjects[0] || null,
    [subjects, selectedSubjectName]
  );

  const selectSubject = (name: string) => {
    setSelectedSubjectName(name);
    setExpandedPeriods(new Set([pConfig[0]?.number ?? 1]));
  };

  const togglePeriod = (num: number) => {
    setExpandedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!childProfile?.id) {
      Alert.alert('Erro', 'Perfil do filho não carregado ainda.');
      return;
    }
    const subjectName = isNewSubject ? form.subject.trim() : form.subject;
    if (!subjectName.trim()) {
      Alert.alert('Erro', 'Insira uma disciplina/matéria.');
      return;
    }

    try {
      const isConcept = form.type === 'concept';
      const scoreNum = form.score !== '' ? parseFloat(form.score) : null;
      const maxScoreNum = parseFloat(form.max_score) || 10;

      // Verificação simples: se nota > max
      if (!isConcept && scoreNum != null && scoreNum > maxScoreNum) {
        Alert.alert('Atenção', 'A nota obtida não pode ser maior que a nota máxima.');
        return;
      }

      await api.post('/grades', {
        ...form,
        subject: subjectName,
        child_id: childProfile.id,
        score: scoreNum,
        max_score: maxScoreNum,
        period_number: Number(form.period_number),
        period_type: settings.evaluation_model,
      });

      // Se tirou nota máxima, dá o aviso de parabéns na tela (bônus XP)
      const isMaxGrade = !isConcept && scoreNum != null && scoreNum === maxScoreNum;
      if (isMaxGrade) {
        Alert.alert(
          'Incrível! 🏆',
          'Você tirou nota máxima e ganhou +50 XP de bônus! Continue brilhando! 📚✨'
        );
      } else {
        Alert.alert('Sucesso', 'Nota cadastrada com sucesso! 📚');
      }

      setShowModal(false);
      setForm({
        subject: '',
        type: 'test',
        score: '',
        max_score: '10',
        concept: '',
        observation: '',
        date: new Date().toISOString().split('T')[0],
        period_number: 1,
      });
      setIsNewSubject(false);
      
      await refreshProfile(); // Recarrega XP no menu/header
      loadBundle();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Ocorreu um erro ao salvar a nota.');
    }
  };

  const displayStatus = selectedSubject ? getSubjectDisplayStatus(selectedSubject) : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Minhas Notas 📚</Text>
          <Text style={styles.headerSubtitle}>Acompanhe suas médias e avaliações</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setForm({
              subject: '',
              type: 'test',
              score: '',
              max_score: '10',
              concept: '',
              observation: '',
              date: new Date().toISOString().split('T')[0],
              period_number: 1,
            });
            setIsNewSubject(false);
            setShowModal(true);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Nota</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loaderText}>Carregando notas...</Text>
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
          {subjects.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>📚</Text>
              <Text style={styles.emptyTitle}>Nenhuma matéria com notas ainda.</Text>
              <Text style={styles.emptySubtitle}>
                Toque no botão "+ Nota" no topo para lançar sua primeira nota escolar!
              </Text>
            </View>
          ) : (
            <>
              {/* Carrossel Horizontal de Matérias */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subjectsScroll}
                contentContainerStyle={styles.subjectsScrollContent}
              >
                {subjects.map((subj) => {
                  const ds = getSubjectDisplayStatus(subj);
                  const isSel = selectedSubject?.name === subj.name;
                  return (
                    <TouchableOpacity
                      key={subj.name}
                      style={[
                        styles.subjectChip,
                        isSel && { backgroundColor: ds.pastel, borderColor: ds.accent },
                      ]}
                      onPress={() => selectSubject(subj.name)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.subjectIconWrap, { backgroundColor: isSel ? '#fff' : ds.pastel }]}>
                        <Text style={{ fontSize: 18 }}>{subjectIcon(subj.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subjectName} numberOfLines={1}>
                          {subj.name}
                        </Text>
                        <Text style={styles.subjectPoints}>
                          {subj.maxEvaluated > 0 ? `${fmtPts(subj.obtained)} / ${fmtPts(subj.maxEvaluated)} pts` : 'Sem notas'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Detalhe da Matéria Selecionada */}
              {selectedSubject && displayStatus && (
                <View style={styles.detailContainer}>
                  <Card style={styles.detailHero} shadow="sm">
                    <View style={styles.heroRow}>
                      <View style={[styles.heroIconWrap, { backgroundColor: displayStatus.pastel }]}>
                        <Text style={{ fontSize: 24 }}>{subjectIcon(selectedSubject.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.heroTitle}>{selectedSubject.name}</Text>
                        {selectedSubject.teacher ? (
                          <Text style={styles.heroSubtitle}>Prof. {selectedSubject.teacher}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: displayStatus.pastel, borderColor: displayStatus.accent }]}>
                        <Text style={[styles.statusBadgeText, { color: displayStatus.accent }]}>
                          {displayStatus.dot} {displayStatus.label}
                        </Text>
                      </View>
                    </View>

                    {selectedSubject.maxEvaluated > 0 ? (
                      <>
                        <View style={styles.statsRow}>
                          <View style={styles.statCol}>
                            <Text style={styles.statLabel}>Nota acumulada</Text>
                            <Text style={styles.statValue}>{fmtPts(selectedSubject.obtained)}</Text>
                            <Text style={styles.statSub}>de {fmtPts(selectedSubject.maxEvaluated)} pts</Text>
                          </View>
                          <View style={styles.statDivider} />
                          <View style={styles.statCol}>
                            <Text style={styles.statLabel}>Média atual</Text>
                            <Text style={styles.statValue}>{fmtAvg(selectedSubject.currentAvg)}</Text>
                            <Text style={styles.statSub}>escala de 10</Text>
                          </View>
                        </View>

                        {/* Metas da Escola e Família */}
                        <View style={styles.goalsRow}>
                          <View style={styles.goalCard}>
                            <Text style={{ fontSize: 20, marginBottom: 4 }}>🎯</Text>
                            <Text style={styles.goalTitle}>Meta da escola</Text>
                            <Text style={styles.goalText}>
                              {schoolGoalMessage(selectedSubject) || 'Sem dados da meta.'}
                            </Text>
                          </View>
                          <View style={styles.goalCard}>
                            <Text style={{ fontSize: 20, marginBottom: 4 }}>⭐</Text>
                            <Text style={styles.goalTitle}>Meta da família</Text>
                            <Text style={styles.goalText}>
                              {familyGoalMessage(selectedSubject) || 'Sem dados da meta.'}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.noGradesWarning}>
                        Sem avaliações salvas para esta matéria.
                      </Text>
                    )}
                  </Card>

                  {/* Listagem de Avaliações por Período */}
                  <Text style={styles.evaluationsTitle}>Avaliações</Text>
                  {selectedSubject.periods.map((p) => {
                    const open = expandedPeriods.has(p.number);
                    return (
                      <View key={p.number} style={[styles.periodCard, open && styles.periodCardOpen]}>
                        <TouchableOpacity
                          style={styles.periodHeader}
                          onPress={() => togglePeriod(p.number)}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.periodLabel}>{p.label}</Text>
                            {p.hasData && (
                              <Text style={styles.periodSummary}>
                                Acumulado: {fmtPts(p.obtained)} / {fmtPts(p.maxEvaluated)} pts
                              </Text>
                            )}
                          </View>
                          <Text style={styles.periodChevron}>{open ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        {open && (
                          <View style={styles.periodBody}>
                            {!p.hasData ? (
                              <Text style={styles.emptyPeriodText}>Nenhuma nota cadastrada</Text>
                            ) : (
                              <View style={styles.chipsContainer}>
                                {p.grades.map((g: any) => (
                                  <View key={g.id} style={styles.gradeChip}>
                                    <Text style={styles.gradeChipType}>{gradeTypeLabel(g.type)}</Text>
                                    <Text style={styles.gradeChipScore}>{formatGradeChip(g)}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Modal: Novo Lançamento de Nota */}
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
              <Text style={styles.modalTitle}>📚 Cadastrar Nota</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
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
                      onChangeText={(text) => setForm((prev) => ({ ...prev, subject: text }))}
                    />
                    <TouchableOpacity
                      style={{ padding: 10, backgroundColor: Colors.bg, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border }}
                      onPress={() => {
                        setIsNewSubject(false);
                        setForm((prev) => ({ ...prev, subject: subjectOptions[0] || '' }));
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
                      {pConfig.map((p) => {
                        const active = form.period_number === p.number;
                        return (
                          <TouchableOpacity
                            key={p.number}
                            style={[styles.formPeriodChip, active && styles.formPeriodChipActive]}
                            onPress={() => setForm((prev) => ({ ...prev, period_number: p.number }))}
                          >
                            <Text style={[styles.formPeriodText, active && styles.formPeriodTextActive]}>
                              {p.label.split(' ')[0]}
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
                      onPress={() => setForm((prev) => ({ ...prev, type: t }))}
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
                      onChangeText={(text) => setForm((prev) => ({ ...prev, score: text }))}
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
                      onChangeText={(text) => setForm((prev) => ({ ...prev, max_score: text }))}
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
                          onPress={() => setForm((prev) => ({ ...prev, concept: c }))}
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
                placeholder="Ex: Fui muito bem! Adorei a prova."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={form.observation}
                onChangeText={(text) => setForm((prev) => ({ ...prev, observation: text }))}
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreate}
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
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 64,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Subjects Scroll
  subjectsScroll: {
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  subjectsScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    minWidth: 140,
  },
  subjectIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectName: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  subjectPoints: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  // Detail
  detailContainer: {
    padding: 16,
    gap: 16,
  },
  detailHero: {
    padding: 16,
    backgroundColor: Colors.surface,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 14,
    marginBottom: 14,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
  },
  heroSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: Radii.xs,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: FontSize.xs - 1,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    color: Colors.text,
    marginVertical: 4,
  },
  statSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  goalsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  goalCard: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: Radii.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  goalTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  goalText: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 13,
  },
  noGradesWarning: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  // Period Acc
  evaluationsTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 8,
  },
  periodCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  periodCardOpen: {
    borderColor: Colors.primaryLight,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.surface,
  },
  periodLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  periodSummary: {
    fontSize: FontSize.xs - 1,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  periodChevron: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  periodBody: {
    padding: 14,
    borderTopWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bg + '10',
  },
  emptyPeriodText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  gradeChipType: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  gradeChipScore: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
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
    marginBottom: 6,
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
