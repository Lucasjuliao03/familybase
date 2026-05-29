import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { UserAvatar } from '../../src/components/profile/UserAvatar';
import api from '../../src/services/api';
import { supabase } from '../../src/lib/supabase';

const COLOR_PRESETS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];
const EMOJI_PRESETS = ['👦', '👧', '👶', '🐱', '🐶', '🦁', '🦊', '🐨', '🐼'];

const SUGGESTED_TASKS = [
  { id: 't1', emoji: '🛏️', title: 'Arrumar a cama', points: 10, bonus: 0.5, desc: 'Manter o quarto organizado logo pela manhã.' },
  { id: 't2', emoji: '🦷', title: 'Escovar os dentes', points: 5, bonus: 0.2, desc: 'Cuidar da saúde bucal após as refeições.' },
  { id: 't3', emoji: '📚', title: 'Revisar dever de casa', points: 20, bonus: 1.0, desc: 'Estudar e fazer as tarefas da escola.' },
  { id: 't4', emoji: '🗑️', title: 'Levar o lixo', points: 10, bonus: 0.5, desc: 'Ajudar a manter a casa limpa jogando o lixo fora.' },
  { id: 't5', emoji: '🍽️', title: 'Ajudar com a louça', points: 15, bonus: 0.8, desc: 'Ajudar a limpar a mesa ou organizar pratos.' },
];

const translations = {
  pt: {
    welcome: 'Bem-vindo ao Tudo de Casa!',
    welcomeSub: 'Organizar sua família e incentivar bons hábitos ficou mais fácil e divertido.',
    tasksIntro: '📋 Tarefas & Rotinas',
    tasksDesc: 'Crie e acompanhe deveres diários para as crianças.',
    allowanceIntro: '💰 Mesada & Bônus',
    allowanceDesc: 'Recompense bom comportamento com moedas e bônus reais.',
    gradesIntro: '📚 Notas Escolares',
    gradesDesc: 'Gerencie boletins e acompanhe a evolução estudantil.',
    locationIntro: '📍 Localização Familiar',
    locationDesc: 'Saiba onde sua família está em tempo real com segurança.',
    muralIntro: '📌 Mural & Calendário',
    muralDesc: 'Centralize recados importantes e datas especiais.',
    statsIntro: '📈 Histórico & Evolução',
    statsDesc: 'Veja relatórios detalhados do desempenho dos filhos.',
    next: 'Avançar',
    back: 'Voltar',
    skip: 'Pular esta etapa',
    addKid: 'Adicionar Filho(a) 👶',
    kidName: 'Nome do filho(a) *',
    kidAge: 'Idade *',
    hasPhone: 'Tem celular próprio? (Acesso ao app)',
    kidEmail: 'Email do filho *',
    kidPass: 'Senha de acesso *',
    favColor: 'Cor favorita',
    favEmoji: 'Emoji favorito',
    saving: 'Salvando...',
    addGuardian: 'Adicionar Responsável 👥',
    gName: 'Nome completo *',
    gEmail: 'Email *',
    gPass: 'Senha inicial *',
    gRole: 'Permissão',
    gRoleGestor: 'Gestor (Pode pagar e editar tudo)',
    gRoleAux: 'Auxiliar (Apenas visualiza e ajuda)',
    selectTasks: 'Escolha as primeiras tarefas',
    selectTasksSub: 'Selecione os hábitos que deseja incentivar. Elas serão criadas para todos os filhos.',
    finishTitle: 'Seu Lar está Pronto! 🏠✨',
    finishSub: 'Configuração concluída com sucesso. Veja o resumo:',
    children: 'Filhos cadastrados:',
    guardians: 'Responsáveis ativos:',
    tasksAdded: 'Tarefas configuradas:',
    none: 'Nenhum',
    finishBtn: 'Ir para o painel principal 🚀',
  },
  en: {
    welcome: 'Welcome to Tudo de Casa!',
    welcomeSub: 'Organizing your family and encouraging good habits is now easy and fun.',
    tasksIntro: '📋 Chores & Routines',
    tasksDesc: 'Create and track daily chores for children.',
    allowanceIntro: '💰 Allowance & Bonuses',
    allowanceDesc: 'Reward good behavior with coins and real bonuses.',
    gradesIntro: '📚 School Grades',
    gradesDesc: 'Manage school report cards and track academic progress.',
    locationIntro: '📍 Family Location',
    locationDesc: 'Know where your family is in real-time securely.',
    muralIntro: '📌 Bulletin Board & Calendar',
    muralDesc: 'Centralize important notes and special events.',
    statsIntro: '📈 History & Progress',
    statsDesc: 'View detailed performance reports of your children.',
    next: 'Next',
    back: 'Back',
    skip: 'Skip this step',
    addKid: 'Add Child 👶',
    kidName: "Child's name *",
    kidAge: 'Age *',
    hasPhone: 'Has own smartphone? (App access)',
    kidEmail: "Child's email *",
    kidPass: 'Access password *',
    favColor: 'Favorite color',
    favEmoji: 'Favorite emoji',
    saving: 'Saving...',
    addGuardian: 'Add Co-guardian 👥',
    gName: 'Full name *',
    gEmail: 'Email *',
    gPass: 'Initial password *',
    gRole: 'Permission',
    gRoleGestor: 'Manager (Can pay and edit everything)',
    gRoleAux: 'Helper (Can only view and help)',
    selectTasks: 'Select first chores',
    selectTasksSub: 'Choose the habits you want to encourage. They will be created for all children.',
    finishTitle: 'Your Home is Ready! 🏠✨',
    finishSub: 'Setup completed successfully. See the summary:',
    children: 'Registered Children:',
    guardians: 'Active Guardians:',
    tasksAdded: 'Configured Chores:',
    none: 'None',
    finishBtn: 'Go to main dashboard 🚀',
  }
};

export default function ParentOnboardingScreen() {
  const router = useRouter();
  const { user, family, refreshProfile } = useAuth();

  const lang = (family?.language === 'en' ? 'en' : 'pt') as 'pt' | 'en';
  const text = translations[lang];

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Cadastrados localmente para resumo
  const [localKids, setLocalKids] = useState<any[]>([]);
  const [localGuardians, setLocalGuardians] = useState<any[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(['t1', 't2', 't3']);

  // Formulário Filho
  const [kidForm, setKidForm] = useState({
    name: '',
    nickname: '',
    age: '',
    hasPhone: false,
    email: '',
    password: '',
    color: '#7C3AED',
    emoji: '👦',
  });

  // Formulário Responsável
  const [gForm, setGForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'auxiliar' as 'gestor' | 'auxiliar',
  });

  const nextStep = () => setStep(p => Math.min(5, p + 1));
  const prevStep = () => setStep(p => Math.max(1, p - 1));

  // Cadastrar Filho
  const handleAddChild = async () => {
    if (!kidForm.name.trim()) return Alert.alert('Erro', text.kidName);
    if (!kidForm.age.trim() || isNaN(Number(kidForm.age))) return Alert.alert('Erro', text.kidAge);
    
    if (kidForm.hasPhone) {
      if (!kidForm.email.trim() || !kidForm.email.includes('@')) {
        return Alert.alert('Erro', 'Por favor insira um email válido para o filho.');
      }
      if (kidForm.password.length < 6) {
        return Alert.alert('Erro', 'A senha deve ter no mínimo 6 caracteres.');
      }
    }

    setSubmitting(true);
    try {
      // Se não tem celular, geramos e-mail fictício e senha para satisfazer a API
      const safeEmail = kidForm.hasPhone 
        ? kidForm.email.trim().toLowerCase() 
        : `filho.${kidForm.name.trim().toLowerCase().replace(/\s+/g, '')}@family.mock`;
      const safePassword = kidForm.hasPhone 
        ? kidForm.password 
        : '123456';

      const payload = {
        name: kidForm.name.trim(),
        nickname: kidForm.nickname.trim() || undefined,
        age: Number(kidForm.age),
        color: kidForm.color,
        emoji: kidForm.emoji,
        email: safeEmail,
        password: safePassword,
        must_change_password: false,
      };

      const res = await api.post('/families/children', payload);
      setLocalKids(p => [...p, { id: res.data?.id || Math.random().toString(), ...payload }]);
      
      Alert.alert('Sucesso', 'Filho adicionado com sucesso!');
      
      // Limpa formulário
      setKidForm({
        name: '',
        nickname: '',
        age: '',
        hasPhone: false,
        email: '',
        password: '',
        color: '#7C3AED',
        emoji: '👦',
      });
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao cadastrar filho.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cadastrar Cônjuge/Responsável
  const handleAddGuardian = async () => {
    if (!gForm.name.trim()) return Alert.alert('Erro', text.gName);
    if (!gForm.email.trim() || !gForm.email.includes('@')) return Alert.alert('Erro', text.gEmail);
    if (gForm.password.length < 6) return Alert.alert('Erro', text.gPass);

    setSubmitting(true);
    try {
      const payload = {
        name: gForm.name.trim(),
        email: gForm.email.trim().toLowerCase(),
        password: gForm.password,
        access_profile: gForm.role,
        display_color: '#3B82F6',
        emoji: '🧔',
        must_change_password: true,
      };

      await api.post('/families/members', payload);
      setLocalGuardians(p => [...p, payload]);

      Alert.alert('Sucesso', 'Responsável convidado!');

      setGForm({
        name: '',
        email: '',
        password: '',
        role: 'auxiliar',
      });
      nextStep();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao cadastrar responsável.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cadastrar Tarefas Selecionadas
  const handleCreateTasks = async () => {
    if (localKids.length === 0 || selectedTaskIds.length === 0) {
      nextStep();
      return;
    }

    setSubmitting(true);
    try {
      const tasksToCreate = SUGGESTED_TASKS.filter(t => selectedTaskIds.includes(t.id));
      const todayStr = new Date().toISOString().split('T')[0];

      // Cria tarefas para cada filho cadastrado
      for (const kid of localKids) {
        for (const task of tasksToCreate) {
          const payload = {
            title: `${task.emoji} ${task.title}`,
            description: task.desc,
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
            }
          };
          await api.post('/tasks', payload);
        }
      }
      nextStep();
    } catch (err: any) {
      Alert.alert('Erro', 'Ocorreu um erro ao criar as tarefas sugeridas.');
      nextStep();
    } finally {
      setSubmitting(false);
    }
  };

  // Finalizar Onboarding
  const handleFinish = async () => {
    setSubmitting(true);
    try {
      // 1. Atualizar flag has_onboarded no banco de dados
      const { error } = await supabase
        .from('users')
        .update({ has_onboarded: true })
        .eq('id', user?.id);

      if (error) throw error;

      try {
        await supabase.from('audit_logs').insert({
          family_id: user?.family_id,
          user_id: user?.id,
          action: 'parent_onboarding_completed',
          details: { kidsCount: localKids.length, guardiansCount: localGuardians.length },
        });
      } catch (logErr) {
        console.warn('[Onboarding] Failed to write completion audit log:', logErr);
      }

      // 3. Atualizar contexto local de auth
      await refreshProfile();
      
      // 4. layout redirecionará de volta para o dashboard parent
      router.replace('/parent');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao concluir onboarding.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho de Progresso */}
      <LinearGradient
        colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.logoCircle}>
          <Text style={s.logoEmoji}>🏠</Text>
        </View>
        <Text style={s.heroTitle}>Tudo de Casa</Text>
        
        {/* Stepper Dots */}
        <View style={s.stepperRow}>
          {[1, 2, 3, 4, 5].map((idx) => (
            <View 
              key={idx} 
              style={[
                s.stepDot, 
                step === idx && s.stepDotActive,
                step > idx && s.stepDotDone
              ]} 
            />
          ))}
        </View>
      </LinearGradient>

      <ScrollView 
        style={s.scroll} 
        contentContainerStyle={s.scrollContent} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── PASSO 1: BOAS VINDAS ── */}
        {step === 1 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{text.welcome}</Text>
            <Text style={s.subtitle}>{text.welcomeSub}</Text>

            <View style={s.grid}>
              <View style={s.featureCard}>
                <Text style={s.featureIcon}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{text.tasksIntro}</Text>
                  <Text style={s.featureDesc}>{text.tasksDesc}</Text>
                </View>
              </View>

              <View style={s.featureCard}>
                <Text style={s.featureIcon}>💰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{text.allowanceIntro}</Text>
                  <Text style={s.featureDesc}>{text.allowanceDesc}</Text>
                </View>
              </View>

              <View style={s.featureCard}>
                <Text style={s.featureIcon}>📚</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{text.gradesIntro}</Text>
                  <Text style={s.featureDesc}>{text.gradesDesc}</Text>
                </View>
              </View>

              <View style={s.featureCard}>
                <Text style={s.featureIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{text.locationIntro}</Text>
                  <Text style={s.featureDesc}>{text.locationDesc}</Text>
                </View>
              </View>

              <View style={s.featureCard}>
                <Text style={s.featureIcon}>📌</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{text.muralIntro}</Text>
                  <Text style={s.featureDesc}>{text.muralDesc}</Text>
                </View>
              </View>

              <View style={s.featureCard}>
                <Text style={s.featureIcon}>📊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{text.statsIntro}</Text>
                  <Text style={s.featureDesc}>{text.statsDesc}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={s.primaryBtn} onPress={nextStep}>
              <Text style={s.primaryBtnText}>{text.next} ➡️</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PASSO 2: FILHOS ── */}
        {step === 2 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>Cadastrar Filhos 👦👧</Text>
            <Text style={s.subtitle}>Adicione as crianças que farão parte do Tudo de Casa.</Text>

            {/* Listagem de cadastrados */}
            {localKids.length > 0 && (
              <View style={s.kidsContainer}>
                {localKids.map((k, index) => (
                  <View key={k.id || index} style={s.kidRow}>
                    <UserAvatar name={k.name} size={36} bordered={false} backgroundColor={`${k.color}15`} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.kidRowName}>{k.name}</Text>
                      <Text style={s.kidRowSub}>Idade: {k.age} anos {k.nickname ? `(${k.nickname})` : ''}</Text>
                    </View>
                    <Text style={{ fontSize: 18 }}>{k.emoji}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.cardForm}>
              <Text style={s.formHeader}>Cadastrar novo filho(a)</Text>

              <Text style={s.label}>{text.kidName}</Text>
              <TextInput 
                style={s.input} 
                value={kidForm.name} 
                onChangeText={v => setKidForm(p => ({ ...p, name: v }))} 
                placeholder="Ex: Joãozinho" 
                placeholderTextColor={Colors.textMuted}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1.2 }}>
                  <Text style={s.label}>Apelido / Grau</Text>
                  <TextInput 
                    style={s.input} 
                    value={kidForm.nickname} 
                    onChangeText={v => setKidForm(p => ({ ...p, nickname: v }))} 
                    placeholder="Ex: Filho caçula" 
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 0.8 }}>
                  <Text style={s.label}>{text.kidAge}</Text>
                  <TextInput 
                    style={s.input} 
                    value={kidForm.age} 
                    onChangeText={v => setKidForm(p => ({ ...p, age: v }))} 
                    placeholder="10" 
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              {/* Tem celular */}
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>{text.hasPhone}</Text>
                  <Text style={s.switchSub}>Dá login ao filho para ver e marcar tarefas.</Text>
                </View>
                <Switch 
                  value={kidForm.hasPhone} 
                  onValueChange={v => setKidForm(p => ({ ...p, hasPhone: v }))}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              {kidForm.hasPhone && (
                <View style={s.animatedFields}>
                  <Text style={s.label}>{text.kidEmail}</Text>
                  <TextInput 
                    style={s.input} 
                    value={kidForm.email} 
                    onChangeText={v => setKidForm(p => ({ ...p, email: v }))} 
                    placeholder="filho@email.com" 
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <Text style={s.label}>{text.kidPass}</Text>
                  <TextInput 
                    style={s.input} 
                    value={kidForm.password} 
                    onChangeText={v => setKidForm(p => ({ ...p, password: v }))} 
                    placeholder="Mínimo 6 caracteres" 
                    secureTextEntry
                    autoCapitalize="none"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              )}

              {/* Cor Favorita */}
              <Text style={s.label}>{text.favColor}</Text>
              <View style={s.colorRow}>
                {COLOR_PRESETS.map(c => (
                  <TouchableOpacity 
                    key={c} 
                    style={[s.colorDot, { backgroundColor: c }, kidForm.color === c && s.colorDotActive]} 
                    onPress={() => setKidForm(p => ({ ...p, color: c }))}
                  />
                ))}
              </View>

              {/* Emoji Favorito */}
              <Text style={s.label}>{text.favEmoji}</Text>
              <View style={s.emojiRow}>
                {EMOJI_PRESETS.map(e => (
                  <TouchableOpacity 
                    key={e} 
                    style={[s.emojiDot, kidForm.emoji === e && s.emojiDotActive]} 
                    onPress={() => setKidForm(p => ({ ...p, emoji: e }))}
                  >
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={[s.addBtn, submitting && { opacity: 0.7 }]} onPress={handleAddChild} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.addBtnText}>+ Salvar Filho</Text>}
              </TouchableOpacity>
            </View>

            {/* Ações */}
            <View style={s.actionRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={prevStep}><Text style={s.btnGhostText}>⬅️ {text.back}</Text></TouchableOpacity>
              <TouchableOpacity 
                style={[s.btn, s.btnPrimary, localKids.length === 0 && { opacity: 0.6 }]} 
                onPress={nextStep}
                disabled={localKids.length === 0}
              >
                <Text style={s.btnPrimaryText}>{text.next} ➡️</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PASSO 3: CO-RESPONSÁVEL ── */}
        {step === 3 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>Adicionar Responsável 👩‍🦰👨‍🦰</Text>
            <Text style={s.subtitle}>Convide outro responsável, parceiro ou cuidador para co-gerenciar a família.</Text>

            <View style={s.cardForm}>
              <Text style={s.label}>{text.gName}</Text>
              <TextInput 
                style={s.input} 
                value={gForm.name} 
                onChangeText={v => setGForm(p => ({ ...p, name: v }))} 
                placeholder="Nome do cônjuge/parceiro" 
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={s.label}>{text.gEmail}</Text>
              <TextInput 
                style={s.input} 
                value={gForm.email} 
                onChangeText={v => setGForm(p => ({ ...p, email: v }))} 
                placeholder="email@parceiro.com" 
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={s.label}>{text.gPass}</Text>
              <TextInput 
                style={s.input} 
                value={gForm.password} 
                onChangeText={v => setGForm(p => ({ ...p, password: v }))} 
                placeholder="Senha inicial do responsável" 
                secureTextEntry
                placeholderTextColor={Colors.textMuted}
              />

              {/* Cargo */}
              <Text style={s.label}>{text.gRole}</Text>
              <View style={s.selectorGroup}>
                <TouchableOpacity 
                  style={[s.selectorOption, gForm.role === 'gestor' && s.selectorOptionActive]} 
                  onPress={() => setGForm(p => ({ ...p, role: 'gestor' }))}
                >
                  <Text style={[s.selectorOptionText, gForm.role === 'gestor' && s.selectorOptionTextActive]}>👑 Gestor</Text>
                  <Text style={s.selectorOptionDesc}>{text.gRoleGestor}</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[s.selectorOption, gForm.role === 'auxiliar' && s.selectorOptionActive]} 
                  onPress={() => setGForm(p => ({ ...p, role: 'auxiliar' }))}
                >
                  <Text style={[s.selectorOptionText, gForm.role === 'auxiliar' && s.selectorOptionTextActive]}>🙋 Auxiliar</Text>
                  <Text style={s.selectorOptionDesc}>{text.gRoleAux}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.addBtn} onPress={handleAddGuardian} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.addBtnText}>+ Convidar Responsável</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.skipBtn} onPress={nextStep}><Text style={s.skipBtnText}>{text.skip} ⏭️</Text></TouchableOpacity>

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={prevStep}><Text style={s.btnGhostText}>⬅️ {text.back}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PASSO 4: TAREFAS INICIAIS ── */}
        {step === 4 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{text.selectTasks}</Text>
            <Text style={s.subtitle}>{text.selectTasksSub}</Text>

            <View style={s.tasksList}>
              {SUGGESTED_TASKS.map((task) => {
                const active = selectedTaskIds.includes(task.id);
                return (
                  <TouchableOpacity 
                    key={task.id} 
                    style={[s.taskCard, active && s.taskCardActive]} 
                    activeOpacity={0.8}
                    onPress={() => setSelectedTaskIds(prev => prev.includes(task.id) ? prev.filter(x => x !== task.id) : [...prev, task.id])}
                  >
                    <View style={s.taskCheck}>
                      <View style={[s.checkbox, active && s.checkboxActive]}>
                        {active && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.taskCardTitle}>{task.emoji} {task.title}</Text>
                      <Text style={s.taskCardDesc}>{task.desc}</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                        <Badge label={`⭐ +${task.points} XP`} color="#5B21B6" />
                        <Badge label={`💰 R$ ${task.bonus.toFixed(2)}`} color="#0D9488" />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={prevStep}><Text style={s.btnGhostText}>⬅️ {text.back}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleCreateTasks} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>{text.next} ➡️</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PASSO 5: CONCLUÍDO ── */}
        {step === 5 && (
          <View style={s.stepWrap}>
            <Text style={s.title}>{text.finishTitle}</Text>
            <Text style={s.subtitle}>{text.finishSub}</Text>

            <Card style={s.summaryCard}>
              <Text style={s.summaryTitle}>👨‍👩‍👧 {family?.name || 'Base Familiar'}</Text>
              
              <Text style={s.summaryLabel}>{text.children}</Text>
              {localKids.length === 0 ? (
                <Text style={s.summaryVal}>{text.none}</Text>
              ) : (
                localKids.map((k, i) => (
                  <Text key={k.id || i} style={s.summaryVal}>• {k.emoji} {k.name} ({k.age} anos)</Text>
                ))
              )}

              <Text style={s.summaryLabel}>{text.guardians}</Text>
              <Text style={s.summaryVal}>• 👑 {user?.name} (Você)</Text>
              {localGuardians.map((g, i) => (
                <Text key={i} style={s.summaryVal}>• {g.role === 'gestor' ? '👑' : '🙋'} {g.name}</Text>
              ))}

              <Text style={s.summaryLabel}>{text.tasksAdded}</Text>
              {selectedTaskIds.length === 0 ? (
                <Text style={s.summaryVal}>{text.none}</Text>
              ) : (
                SUGGESTED_TASKS.filter(t => selectedTaskIds.includes(t.id)).map((t, i) => (
                  <Text key={i} style={s.summaryVal}>• {t.emoji} {t.title}</Text>
                ))
              )}
            </Card>

            <TouchableOpacity style={s.primaryBtn} onPress={handleFinish} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{text.finishBtn}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Card({ style, children }: { style?: any; children: React.ReactNode }) {
  return <View style={[s.card, style]}>{children}</View>;
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
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...Shadow.md,
  },
  logoCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  logoEmoji: { fontSize: 30 },
  heroTitle: { fontSize: FontSize.lg, fontWeight: '900', color: '#fff' },
  stepperRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  stepDotActive: { width: 22, backgroundColor: '#fff' },
  stepDotDone: { backgroundColor: Colors.greenMid },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },

  stepWrap: { width: '100%' },
  title: { fontSize: FontSize.lg + 2, fontWeight: '900', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 24, paddingHorizontal: 10 },

  grid: { gap: 12, marginBottom: 28 },
  featureCard: {
    flexDirection: 'row', gap: 12, backgroundColor: Colors.surface,
    padding: 14, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  featureIcon: { fontSize: 24, alignSelf: 'center' },
  featureTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text },
  featureDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },

  // Forms
  cardForm: { backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 18, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, marginBottom: 20 },
  formHeader: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingBottom: 8 },
  label: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.text, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSize.sm, backgroundColor: Colors.bg, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.borderLight, marginVertical: 10 },
  switchLabel: { fontSize: FontSize.xs + 1, fontWeight: '800', color: Colors.text },
  switchSub: { fontSize: FontSize.xs - 1, color: Colors.textSecondary, marginTop: 2 },
  animatedFields: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: Colors.primaryLighter, marginVertical: 8 },

  colorRow: { flexDirection: 'row', gap: 8, marginVertical: 4, flexWrap: 'wrap' },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'transparent' },
  colorDotActive: { borderWidth: 3, borderColor: Colors.text },

  emojiRow: { flexDirection: 'row', gap: 8, marginVertical: 4, flexWrap: 'wrap' },
  emojiDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  emojiDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },

  addBtn: { backgroundColor: Colors.primary, borderRadius: Radii.full, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14, ...Shadow.btn },
  addBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },

  // Listagem de filhos cadastrados
  kidsContainer: { gap: 10, marginBottom: 16 },
  kidRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, padding: 12, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border },
  kidRowName: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  kidRowSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

  // Co-responsável
  selectorGroup: { flexDirection: 'column', gap: 8 },
  selectorOption: { padding: 12, borderRadius: Radii.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg },
  selectorOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  selectorOptionText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textSecondary },
  selectorOptionTextActive: { color: Colors.primary },
  selectorOptionDesc: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 2 },
  skipBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, marginBottom: 20 },
  skipBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs + 1, fontWeight: '700' },

  // Tarefas Sugeridas
  tasksList: { gap: 10, marginBottom: 24 },
  taskCard: { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 14, borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm },
  taskCardActive: { borderColor: Colors.primary, backgroundColor: '#FAF9FF' },
  taskCheck: { justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  taskCardTitle: { fontSize: FontSize.sm + 1, fontWeight: '800', color: Colors.text },
  taskCardDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },

  // Badges
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.xs, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  // Resumo
  summaryCard: { backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, marginBottom: 28 },
  summaryTitle: { fontSize: FontSize.md, fontWeight: '900', color: Colors.primary, borderBottomWidth: 1.5, borderBottomColor: Colors.borderLight, paddingBottom: 10, marginBottom: 14 },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.text, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1.1 },
  summaryVal: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginLeft: 4 },

  card: { backgroundColor: Colors.surface, ...Shadow.sm },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: Radii.full, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border },
  btnGhostText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '700' },
  btnPrimary: { backgroundColor: Colors.primary, ...Shadow.btn },
  btnPrimaryText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '800' },

  primaryBtn: { backgroundColor: Colors.primary, borderRadius: Radii.full, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', ...Shadow.btn, width: '100%' },
  primaryBtnText: { color: '#fff', fontSize: FontSize.sm + 1, fontWeight: '800' },
});
