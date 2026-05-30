import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { AppLogo } from '../../src/components/ui/AppLogo';
import api from '../../src/services/api';
import { supabase } from '../../src/lib/supabase';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_PRESET } from '../../src/lib/avatarCatalog';
import {
  COLOR_PRESETS,
  GUARDIAN_EMOJI_PRESETS,
  FEATURE_KEYS,
  SUGGESTED_TASKS,
  toISODate,
  maskDate,
  yearsSince,
  logOnboardingAudit,
  type LocalChild,
  type LocalGuardian,
  type FeatureKey,
} from '../../src/lib/onboarding/helpers';
import {
  translations,
  getRelationPresets,
  featureMeta,
  type OnboardingLang,
} from '../../src/lib/onboarding/i18n';

const TOTAL_STEPS = 5;

export default function ParentOnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isReviewMode = mode === 'review';
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { user, family, refreshProfile } = useAuth();
  const lang: OnboardingLang = family?.language === 'en' ? 'en' : 'pt';
  const t = translations[lang];
  const relationPresets = getRelationPresets(lang);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);
  const [tasksInfoOpen, setTasksInfoOpen] = useState(false);

  const [localKids, setLocalKids] = useState<LocalChild[]>([]);
  const [localGuardians, setLocalGuardians] = useState<LocalGuardian[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(['t1', 't2', 't3']);
  const [showKidForm, setShowKidForm] = useState(true);

  const [kidForm, setKidForm] = useState({
    name: '',
    birth: '',
    relation: '',
    customRelation: '',
    hasPhone: false,
    email: '',
    password: '',
    color: '#7C3AED',
    avatarPreset: DEFAULT_AVATAR_PRESET,
  });

  const [gForm, setGForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'auxiliar' as 'gestor' | 'auxiliar',
    emoji: '👩',
  });

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  const nextStep = useCallback(() => {
    setStep((p) => Math.min(TOTAL_STEPS, p + 1));
  }, []);

  const prevStep = useCallback(() => {
    setStep((p) => Math.max(1, p - 1));
  }, []);

  const openFeatureInfo = (key: FeatureKey) => {
    const meta = featureMeta(key, t);
    if (meta) setInfoModal({ title: meta.title, body: meta.detail });
  };

  const resetKidForm = () => {
    setKidForm({
      name: '',
      birth: '',
      relation: '',
      customRelation: '',
      hasPhone: false,
      email: '',
      password: '',
      color: '#7C3AED',
      avatarPreset: DEFAULT_AVATAR_PRESET,
    });
  };

  const validateKidForm = (): string | null => {
    if (!kidForm.name.trim()) return t.kidNameRequired;
    const relation = kidForm.relation === '__custom__' ? kidForm.customRelation.trim() : kidForm.relation.trim();
    if (!relation) return t.kidRelationRequired;
    const iso = toISODate(kidForm.birth);
    if (!iso) return t.kidBirthInvalid;
    if (kidForm.hasPhone) {
      if (!kidForm.email.trim().includes('@')) return t.kidEmailInvalid;
      if (kidForm.password.length < 6) return t.kidPassShort;
    }
    return null;
  };

  const handleAddChild = async (addAnother: boolean) => {
    const err = validateKidForm();
    if (err) return Alert.alert(lang === 'en' ? 'Required' : 'Obrigatório', err);

    const iso = toISODate(kidForm.birth)!;
    const relation = kidForm.relation === '__custom__' ? kidForm.customRelation.trim() : kidForm.relation.trim();
    const safeEmail = kidForm.hasPhone
      ? kidForm.email.trim().toLowerCase()
      : `filho.${kidForm.name.trim().toLowerCase().replace(/\s+/g, '')}.${Date.now()}@family.mock`;
    const safePassword = kidForm.hasPhone ? kidForm.password : '123456';

    setSubmitting(true);
    try {
      const payload = {
        name: kidForm.name.trim(),
        nickname: relation,
        birthday: iso,
        age: yearsSince(iso),
        color: kidForm.color,
        avatar_preset: kidForm.avatarPreset,
        email: safeEmail,
        password: safePassword,
        must_change_password: false,
      };

      const res = await api.post('/families/children', payload);
      const saved: LocalChild = {
        id: res.data?.id || String(Date.now()),
        name: payload.name,
        nickname: relation,
        birthday: iso,
        age: payload.age,
        color: payload.color,
        avatar_preset: payload.avatar_preset,
        hasPhone: kidForm.hasPhone,
      };
      setLocalKids((p) => [...p, saved]);

      await logOnboardingAudit(user, 'onboarding_child_added', {
        child_id: saved.id,
        name: saved.name,
        has_phone: kidForm.hasPhone,
      });

      Alert.alert(lang === 'en' ? 'Success' : 'Sucesso', t.kidAdded);
      resetKidForm();

      if (addAnother) {
        setShowKidForm(true);
      } else {
        setShowKidForm(false);
        nextStep();
      }
    } catch (err: unknown) {
      Alert.alert('Erro', (err as Error)?.message || t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddGuardian = async () => {
    if (!gForm.name.trim()) return Alert.alert('Erro', t.gName);
    if (!gForm.email.trim().includes('@')) return Alert.alert('Erro', t.gEmail);
    if (gForm.password.length < 6) return Alert.alert('Erro', t.gPass);

    setSubmitting(true);
    try {
      const payload = {
        name: gForm.name.trim(),
        email: gForm.email.trim().toLowerCase(),
        password: gForm.password,
        access_profile: gForm.role,
        display_color: '#3B82F6',
        emoji: gForm.emoji,
        must_change_password: true,
      };

      await api.post('/families/members', payload);
      setLocalGuardians((p) => [...p, { name: payload.name, email: payload.email, role: gForm.role, emoji: gForm.emoji }]);

      await logOnboardingAudit(user, 'onboarding_guardian_added', {
        name: payload.name,
        role: gForm.role,
      });

      Alert.alert(lang === 'en' ? 'Success' : 'Sucesso', t.guardianAdded);
      setGForm({ name: '', email: '', password: '', role: 'auxiliar', emoji: '👩' });
      nextStep();
    } catch (err: unknown) {
      Alert.alert('Erro', (err as Error)?.message || t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTasks = async () => {
    if (localKids.length === 0 || selectedTaskIds.length === 0) {
      nextStep();
      return;
    }

    setSubmitting(true);
    try {
      const tasksToCreate = SUGGESTED_TASKS.filter((task) => selectedTaskIds.includes(task.id));
      const todayStr = new Date().toISOString().split('T')[0];

      for (const kid of localKids) {
        for (const task of tasksToCreate) {
          const title = `${task.emoji} ${t[task.titleKey as keyof typeof t]}`;
          const description = t[task.descKey as keyof typeof t] as string;
          await api.post('/tasks', {
            title,
            description,
            category: 'routine',
            points: task.points,
            frequency: 'daily',
            is_recurring: true,
            recurrence_days: '1,2,3,4,5,6,7',
            requires_approval: true,
            affects_allowance: true,
            start_date: todayStr,
            child_id: kid.id,
            allowance_rule: {
              affects_allowance: true,
              bonus_amount: task.bonus,
              discount_amount: 0,
            },
          });
        }
      }

      await logOnboardingAudit(user, 'onboarding_tasks_created', {
        task_count: tasksToCreate.length * localKids.length,
        task_ids: selectedTaskIds,
      });

      nextStep();
    } catch {
      Alert.alert('Erro', t.errorGeneric);
      nextStep();
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      if (!isReviewMode) {
        const { error } = await supabase
          .from('users')
          .update({ has_onboarded: true })
          .eq('id', user?.id);
        if (error) throw error;
      }

      await logOnboardingAudit(user, isReviewMode ? 'onboarding_review_completed' : 'parent_onboarding_completed', {
        kids_count: localKids.length,
        guardians_count: localGuardians.length,
        tasks_count: selectedTaskIds.length,
        review_mode: isReviewMode,
      });

      await refreshProfile();

      if (isReviewMode) {
        router.back();
      } else {
        router.replace('/parent');
      }
    } catch (err: unknown) {
      Alert.alert('Erro', (err as Error)?.message || t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const formatKidAge = (kid: LocalChild) => {
    if (kid.birthday) {
      const age = yearsSince(kid.birthday);
      return lang === 'en' ? `${age} yrs` : `${age} anos`;
    }
    return kid.age != null ? (lang === 'en' ? `${kid.age} yrs` : `${kid.age} anos`) : '';
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <AppLogo size={88} containerStyle={{ marginBottom: 6 }} />
        <Text style={s.stepLabel}>{t.stepOf(step, TOTAL_STEPS)}</Text>

        <View style={s.progressWrap}>
          <ProgressBar progress={progressPct} height={6} bg="rgba(255,255,255,0.25)" color="#fff" />
        </View>

        <View style={s.stepperRow}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((idx) => (
            <View
              key={idx}
              style={[s.stepDot, step === idx && s.stepDotActive, step > idx && s.stepDotDone]}
            />
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, isTablet && s.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* PASSO 1 — Boas-vindas */}
        {step === 1 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{t.welcome}</Text>
            <Text style={s.subtitle}>{t.welcomeSub}</Text>

            <View style={[s.grid, isTablet && s.gridTablet]}>
              {FEATURE_KEYS.map((key) => {
                const meta = featureMeta(key, t)!;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.featureCard, isTablet && s.featureCardTablet]}
                    activeOpacity={0.85}
                    onPress={() => openFeatureInfo(key)}
                  >
                    <Text style={s.featureIcon}>{meta.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.featureTitle}>{meta.title}</Text>
                      <Text style={s.featureDesc}>{meta.desc}</Text>
                      <Text style={s.learnMore}>{t.learnMore} ›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <PrimaryButton label={t.start} onPress={nextStep} icon="🚀" />
          </View>
        )}

        {/* PASSO 2 — Filhos */}
        {step === 2 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{t.childrenTitle}</Text>
            <Text style={s.subtitle}>{t.childrenSub}</Text>

            {localKids.length > 0 && (
              <View style={s.kidsContainer}>
                <Text style={s.sectionLabel}>{t.registeredKids}</Text>
                {localKids.map((k) => (
                  <View key={k.id} style={s.kidRow}>
                    <UserAvatar
                      avatarPreset={k.avatar_preset}
                      name={k.name}
                      size={40}
                      bordered={false}
                      backgroundColor={`${k.color}15`}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.kidRowName}>{k.name}</Text>
                      <Text style={s.kidRowSub}>
                        {k.nickname} · {formatKidAge(k)}
                        {k.hasPhone ? ' · 📱' : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {showKidForm && (
              <View style={s.cardForm}>
                <Text style={s.formHeader}>{t.addKidForm}</Text>

                <Text style={s.label}>{t.kidName}</Text>
                <TextInput
                  style={s.input}
                  value={kidForm.name}
                  onChangeText={(v) => setKidForm((p) => ({ ...p, name: v }))}
                  placeholder={lang === 'en' ? 'e.g. John' : 'Ex: Joãozinho'}
                  placeholderTextColor={Colors.textMuted}
                />

                <Text style={s.label}>{t.kidBirth}</Text>
                <TextInput
                  style={s.input}
                  value={kidForm.birth}
                  onChangeText={(v) => setKidForm((p) => ({ ...p, birth: maskDate(v) }))}
                  placeholder={t.kidBirthPlaceholder}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                />

                <Text style={s.label}>{t.kidRelation}</Text>
                <View style={s.chipRow}>
                  {relationPresets.map((rel) => (
                    <TouchableOpacity
                      key={rel}
                      style={[s.chip, kidForm.relation === rel && s.chipActive]}
                      onPress={() => setKidForm((p) => ({ ...p, relation: rel, customRelation: '' }))}
                    >
                      <Text style={[s.chipText, kidForm.relation === rel && s.chipTextActive]}>{rel}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[s.chip, kidForm.relation === '__custom__' && s.chipActive]}
                    onPress={() => setKidForm((p) => ({ ...p, relation: '__custom__' }))}
                  >
                    <Text style={[s.chipText, kidForm.relation === '__custom__' && s.chipTextActive]}>
                      {t.kidRelationCustom}
                    </Text>
                  </TouchableOpacity>
                </View>
                {kidForm.relation === '__custom__' && (
                  <TextInput
                    style={s.input}
                    value={kidForm.customRelation}
                    onChangeText={(v) => setKidForm((p) => ({ ...p, customRelation: v }))}
                    placeholder={lang === 'en' ? 'e.g. Grandchild' : 'Ex: Neto'}
                    placeholderTextColor={Colors.textMuted}
                  />
                )}

                <Text style={s.label}>{t.kidAvatar}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.avatarRow}>
                  {AVATAR_OPTIONS.slice(0, 12).map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[s.avatarItem, kidForm.avatarPreset === opt.id && s.avatarItemActive]}
                      onPress={() => setKidForm((p) => ({ ...p, avatarPreset: opt.id }))}
                    >
                      <Image source={opt.source} style={s.avatarImg} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchLabel}>{t.hasPhone}</Text>
                    <Text style={s.switchSub}>{t.hasPhoneSub}</Text>
                  </View>
                  <Switch
                    value={kidForm.hasPhone}
                    onValueChange={(v) => setKidForm((p) => ({ ...p, hasPhone: v }))}
                    trackColor={{ false: Colors.border, true: Colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                {kidForm.hasPhone && (
                  <View style={s.nestedFields}>
                    <Text style={s.label}>{t.kidEmail}</Text>
                    <TextInput
                      style={s.input}
                      value={kidForm.email}
                      onChangeText={(v) => setKidForm((p) => ({ ...p, email: v }))}
                      placeholder="filho@email.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <Text style={s.label}>{t.kidPass}</Text>
                    <TextInput
                      style={s.input}
                      value={kidForm.password}
                      onChangeText={(v) => setKidForm((p) => ({ ...p, password: v }))}
                      placeholder={lang === 'en' ? 'Min. 6 characters' : 'Mínimo 6 caracteres'}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                )}

                <Text style={s.label}>{t.favColor}</Text>
                <View style={s.colorRow}>
                  {COLOR_PRESETS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[s.colorDot, { backgroundColor: c }, kidForm.color === c && s.colorDotActive]}
                      onPress={() => setKidForm((p) => ({ ...p, color: c }))}
                    />
                  ))}
                </View>

                <PrimaryButton
                  label={t.saveKid}
                  onPress={() => handleAddChild(true)}
                  loading={submitting}
                  icon="➕"
                  style={{ marginTop: 12 }}
                />
              </View>
            )}

            {localKids.length > 0 && (
              <PrimaryButton
                label={t.finishKids}
                onPress={nextStep}
                variant="secondary"
                icon="✓"
                style={{ marginBottom: 12 }}
              />
            )}

            <TouchableOpacity style={s.skipBtn} onPress={nextStep}>
              <Text style={s.skipBtnText}>{t.skip}</Text>
            </TouchableOpacity>

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={prevStep}>
                <Text style={s.btnGhostText}>‹ {t.back}</Text>
              </TouchableOpacity>
              {localKids.length > 0 && !showKidForm && (
                <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={nextStep}>
                  <Text style={s.btnPrimaryText}>{t.next} ›</Text>
                </TouchableOpacity>
              )}
              {localKids.length > 0 && showKidForm && (
                <TouchableOpacity
                  style={[s.btn, s.btnPrimary]}
                  onPress={() => handleAddChild(false)}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.btnPrimaryText}>{t.addNextKid}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* PASSO 3 — Responsável */}
        {step === 3 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{t.guardianTitle}</Text>
            <Text style={s.subtitle}>{t.guardianSub}</Text>

            {localGuardians.length > 0 && (
              <View style={s.kidsContainer}>
                {localGuardians.map((g, i) => (
                  <View key={i} style={s.kidRow}>
                    <Text style={{ fontSize: 28 }}>{g.emoji || '👤'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.kidRowName}>{g.name}</Text>
                      <Text style={s.kidRowSub}>{g.role === 'gestor' ? '👑 Gestor' : '🙋 Auxiliar'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={s.cardForm}>
              <Text style={s.label}>{t.gName}</Text>
              <TextInput
                style={s.input}
                value={gForm.name}
                onChangeText={(v) => setGForm((p) => ({ ...p, name: v }))}
                placeholder={lang === 'en' ? 'Partner name' : 'Nome do cônjuge/parceiro'}
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={s.label}>{t.gEmail}</Text>
              <TextInput
                style={s.input}
                value={gForm.email}
                onChangeText={(v) => setGForm((p) => ({ ...p, email: v }))}
                placeholder="email@parceiro.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={s.label}>{t.gPass}</Text>
              <TextInput
                style={s.input}
                value={gForm.password}
                onChangeText={(v) => setGForm((p) => ({ ...p, password: v }))}
                placeholder={lang === 'en' ? 'Initial password' : 'Senha inicial'}
                secureTextEntry
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={s.label}>{t.gAvatar}</Text>
              <View style={s.emojiRow}>
                {GUARDIAN_EMOJI_PRESETS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[s.emojiDot, gForm.emoji === e && s.emojiDotActive]}
                    onPress={() => setGForm((p) => ({ ...p, emoji: e }))}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t.gRole}</Text>
              <View style={s.selectorGroup}>
                <TouchableOpacity
                  style={[s.selectorOption, gForm.role === 'gestor' && s.selectorOptionActive]}
                  onPress={() => setGForm((p) => ({ ...p, role: 'gestor' }))}
                >
                  <Text style={[s.selectorOptionText, gForm.role === 'gestor' && s.selectorOptionTextActive]}>
                    👑 Gestor
                  </Text>
                  <Text style={s.selectorOptionDesc}>{t.gRoleGestor}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.selectorOption, gForm.role === 'auxiliar' && s.selectorOptionActive]}
                  onPress={() => setGForm((p) => ({ ...p, role: 'auxiliar' }))}
                >
                  <Text style={[s.selectorOptionText, gForm.role === 'auxiliar' && s.selectorOptionTextActive]}>
                    🙋 Auxiliar
                  </Text>
                  <Text style={s.selectorOptionDesc}>{t.gRoleAux}</Text>
                </TouchableOpacity>
              </View>

              <PrimaryButton
                label={t.inviteGuardian}
                onPress={handleAddGuardian}
                loading={submitting}
                icon="👥"
                style={{ marginTop: 14 }}
              />
            </View>

            <TouchableOpacity style={s.skipBtn} onPress={nextStep}>
              <Text style={s.skipBtnText}>{t.skip}</Text>
            </TouchableOpacity>

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={prevStep}>
                <Text style={s.btnGhostText}>‹ {t.back}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* PASSO 4 — Tarefas */}
        {step === 4 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{t.tasksTitle}</Text>
            <Text style={s.subtitle}>{t.tasksSub}</Text>

            <TouchableOpacity style={s.infoBanner} onPress={() => setTasksInfoOpen(true)} activeOpacity={0.85}>
              <Text style={s.infoBannerIcon}>💡</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.infoBannerTitle}>{t.tasksExplainTitle}</Text>
                <Text style={s.infoBannerSub}>{t.learnMore} ›</Text>
              </View>
            </TouchableOpacity>

            <Text style={s.sectionLabel}>{t.selectTasks}</Text>
            <View style={s.tasksList}>
              {SUGGESTED_TASKS.map((task) => {
                const active = selectedTaskIds.includes(task.id);
                const title = t[task.titleKey as keyof typeof t] as string;
                const desc = t[task.descKey as keyof typeof t] as string;
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={[s.taskCard, active && s.taskCardActive]}
                    activeOpacity={0.8}
                    onPress={() =>
                      setSelectedTaskIds((prev) =>
                        prev.includes(task.id) ? prev.filter((x) => x !== task.id) : [...prev, task.id],
                      )
                    }
                  >
                    <View style={s.taskCheck}>
                      <View style={[s.checkbox, active && s.checkboxActive]}>
                        {active && <Text style={s.checkMark}>✓</Text>}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.taskCardTitle}>
                        {task.emoji} {title}
                      </Text>
                      <Text style={s.taskCardDesc}>{desc}</Text>
                      <View style={s.taskBadges}>
                        <Badge label={`⭐ +${task.points} XP`} color="#5B21B6" />
                        <Badge label={`💰 R$ ${task.bonus.toFixed(2)}`} color="#0D9488" />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={s.skipBtn} onPress={nextStep}>
              <Text style={s.skipBtnText}>{t.skip}</Text>
            </TouchableOpacity>

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={prevStep}>
                <Text style={s.btnGhostText}>‹ {t.back}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleCreateTasks} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnPrimaryText}>{t.next} ›</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* PASSO 5 — Resumo */}
        {step === 5 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{t.finishTitle}</Text>
            <Text style={s.subtitle}>{t.finishSub}</Text>

            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>👨‍👩‍👧 {family?.name || 'Base Familiar'}</Text>

              <Text style={s.summaryLabel}>{t.children}</Text>
              {localKids.length === 0 ? (
                <Text style={s.summaryVal}>{t.none}</Text>
              ) : (
                localKids.map((k) => (
                  <Text key={k.id} style={s.summaryVal}>
                    • {k.name} ({k.nickname}, {formatKidAge(k)})
                  </Text>
                ))
              )}

              <Text style={s.summaryLabel}>{t.guardians}</Text>
              <Text style={s.summaryVal}>
                • 👑 {user?.name} ({t.you})
              </Text>
              {localGuardians.map((g, i) => (
                <Text key={i} style={s.summaryVal}>
                  • {g.emoji} {g.name} ({g.role === 'gestor' ? 'Gestor' : 'Auxiliar'})
                </Text>
              ))}

              <Text style={s.summaryLabel}>{t.tasksAdded}</Text>
              {selectedTaskIds.length === 0 ? (
                <Text style={s.summaryVal}>{t.none}</Text>
              ) : (
                SUGGESTED_TASKS.filter((task) => selectedTaskIds.includes(task.id)).map((task) => (
                  <Text key={task.id} style={s.summaryVal}>
                    • {task.emoji} {t[task.titleKey as keyof typeof t]}
                  </Text>
                ))
              )}
            </View>

            <PrimaryButton
              label={isReviewMode ? t.reviewFinishBtn : t.finishBtn}
              onPress={handleFinish}
              loading={submitting}
              icon="🚀"
            />
          </View>
        )}
      </ScrollView>

      {/* Modal explicativo de funcionalidades */}
      <Modal visible={!!infoModal} transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{infoModal?.title}</Text>
            <Text style={s.modalBody}>{infoModal?.body}</Text>
            <PrimaryButton label={t.ok} onPress={() => setInfoModal(null)} size="md" />
          </View>
        </View>
      </Modal>

      {/* Modal explicativo de tarefas */}
      <Modal visible={tasksInfoOpen} transparent animationType="fade" onRequestClose={() => setTasksInfoOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t.tasksExplainTitle}</Text>
            <Text style={s.modalBody}>{t.tasksExplainBody}</Text>
            <PrimaryButton label={t.ok} onPress={() => setTasksInfoOpen(false)} size="md" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: `${color}12`, borderColor: `${color}25` }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  hero: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...Shadow.md,
  },
  heroTitle: { fontSize: FontSize.lg, fontWeight: '900', color: '#fff' },
  stepLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '600' },
  progressWrap: { width: '72%', marginTop: 12 },
  stepperRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  stepDotActive: { width: 22, backgroundColor: '#fff' },
  stepDotDone: { backgroundColor: Colors.greenMid },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  scrollContentTablet: { maxWidth: 640, alignSelf: 'center', width: '100%' },

  stepWrap: { width: '100%' },
  title: {
    fontSize: FontSize.lg + 2,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },

  grid: { gap: 10, marginBottom: 28 },
  gridTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  featureCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  featureCardTablet: { width: '48%' },
  featureIcon: { fontSize: 24, alignSelf: 'flex-start', marginTop: 2 },
  featureTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text },
  featureDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  learnMore: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', marginTop: 6 },

  cardForm: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
    marginBottom: 16,
  },
  formHeader: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: 8,
  },
  label: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.text, marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    backgroundColor: Colors.bg,
    marginBottom: 4,
    color: Colors.text,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  chipText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.primaryDark },

  avatarRow: { gap: 10, paddingVertical: 6 },
  avatarItem: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  avatarItemActive: { borderColor: Colors.primary, borderWidth: 3 },
  avatarImg: { width: '100%', height: '100%' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
    marginVertical: 10,
  },
  switchLabel: { fontSize: FontSize.xs + 1, fontWeight: '800', color: Colors.text },
  switchSub: { fontSize: FontSize.xs - 1, color: Colors.textSecondary, marginTop: 2 },
  nestedFields: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primaryLighter,
    marginVertical: 8,
  },

  colorRow: { flexDirection: 'row', gap: 8, marginVertical: 4, flexWrap: 'wrap' },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'transparent' },
  colorDotActive: { borderWidth: 3, borderColor: Colors.text },

  emojiRow: { flexDirection: 'row', gap: 8, marginVertical: 4, flexWrap: 'wrap' },
  emojiDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  emojiDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },

  kidsContainer: { gap: 8, marginBottom: 16 },
  kidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kidRowName: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  kidRowSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

  selectorGroup: { flexDirection: 'column', gap: 8 },
  selectorOption: {
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  selectorOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  selectorOptionText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textSecondary },
  selectorOptionTextActive: { color: Colors.primary },
  selectorOptionDesc: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 2 },

  skipBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, marginBottom: 12 },
  skipBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs + 1, fontWeight: '700' },

  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.primaryLighter,
    padding: 14,
    borderRadius: Radii.md,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoBannerIcon: { fontSize: 24 },
  infoBannerTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.primaryDark },
  infoBannerSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', marginTop: 4 },

  tasksList: { gap: 10, marginBottom: 20 },
  taskCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  taskCardActive: { borderColor: Colors.primary, backgroundColor: '#FAF9FF' },
  taskCheck: { justifyContent: 'center' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '900' },
  taskCardTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text },
  taskCardDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  taskBadges: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.xs, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
    marginBottom: 28,
  },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: '900',
    color: Colors.primary,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.borderLight,
    paddingBottom: 10,
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  summaryVal: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, marginLeft: 4 },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: Radii.full, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border },
  btnGhostText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '700' },
  btnPrimary: { backgroundColor: Colors.primary, ...Shadow.btn },
  btnPrimaryText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '800' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...Shadow.lg,
  },
  modalTitle: { fontSize: FontSize.md, fontWeight: '900', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  modalBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, marginBottom: 20, textAlign: 'center' },
});
