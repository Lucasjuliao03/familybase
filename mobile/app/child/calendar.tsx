import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { useRouter } from 'expo-router';
import api from '../../src/services/api';
import {
  FamilyCalendarBoard,
  CalendarEventItem,
  CalendarViewMode,
} from '../../src/components/calendar/FamilyCalendarBoard';
import { deriveCalendarRange, normalizeAnchorMidday, formatDateBR, parseDateBR, todayLocalYMD } from '../../src/shared/lib/familyCalendarRange';

export default function ChildCalendarScreen() {
  const router = useRouter();

  const [initialLoading, setInitialLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEventItem[]>([]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => normalizeAnchorMidday(new Date()));

  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventType, setEventType] = useState('school');
  const [eventDescription, setEventDescription] = useState('');

  const todayStr = useMemo(() => todayLocalYMD(), []);

  const upcomingParams = useMemo(() => {
    const y = new Date().getFullYear();
    return { from: todayStr, to: `${y + 1}-12-31` };
  }, [todayStr]);

  const calendarParams = useMemo(() => {
    const { from, to } = deriveCalendarRange(viewMode, anchorDate);
    return { from, to };
  }, [viewMode, anchorDate]);

  const loadEvents = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      else setCalendarLoading(true);
      const [calendarRes, upcomingRes] = await Promise.all([
        api.get('/calendar', { params: calendarParams }),
        api.get('/calendar', { params: upcomingParams }),
      ]);
      setEvents(calendarRes?.data || []);
      setUpcomingEvents(upcomingRes?.data || []);
    } catch (err) {
      console.error('[ChildCalendar] Erro ao carregar calendário:', err);
    } finally {
      setInitialLoading(false);
      setCalendarLoading(false);
    }
  }, [calendarParams, upcomingParams]);

  useEffect(() => {
    loadEvents(initialLoading);
  }, [calendarParams]);

  const openCreateModal = (dateStr?: string) => {
    setEventTitle('');
    setEventDate(dateStr ? formatDateBR(dateStr) : formatDateBR(todayStr));
    setEventTime('');
    setEventType('school');
    setEventDescription('');
    setShowEventModal(true);
  };

  const closeModal = () => {
    setShowEventModal(false);
    setEventTitle('');
    setEventDate('');
    setEventTime('');
    setEventType('school');
    setEventDescription('');
  };

  const handleSaveEvent = async () => {
    if (!eventTitle.trim() || !eventDate.trim()) {
      Alert.alert('Aviso', 'Preencha o título e a data do compromisso.');
      return;
    }
    const parsedDate = parseDateBR(eventDate);
    if (!parsedDate) {
      Alert.alert('Data Inválida', 'Escreva a data no formato DD/MM/AAAA.');
      return;
    }

    try {
      setCalendarLoading(true);
      await api.post('/calendar', {
        title: eventTitle.trim(),
        description: eventDescription.trim() || null,
        date: parsedDate,
        time: eventTime ? `${eventTime}:00` : null,
        type: eventType,
      });
      Alert.alert('Sucesso!', 'Seu compromisso foi adicionado à agenda!');
      closeModal();
      await loadEvents();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível agendar o compromisso.');
    } finally {
      setCalendarLoading(false);
    }
  };

  const showEventDetail = (ev: CalendarEventItem) => {
    const timeLine = ev.time ? `\nHorário: ${ev.time.slice(0, 5)}` : '';
    const descLine = ev.description ? `\n\n${ev.description}` : '';
    Alert.alert(ev.title, `Data: ${formatDateBR(ev.date)}${timeLine}${descLine}`);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      <View style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Meu Calendário</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => openCreateModal()} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+ Novo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {initialLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando minha agenda...</Text>
        </View>
      ) : (
        <FamilyCalendarBoard
          mode="child"
          events={events}
          loading={calendarLoading}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          anchorDate={anchorDate}
          onAnchorChange={setAnchorDate}
          upcomingEvents={upcomingEvents}
          onEditEvent={showEventDetail}
          onCreateOnDay={openCreateModal}
        />
      )}

      <Modal visible={showEventModal} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Compromisso</Text>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>O que vai fazer? *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Estudar para prova"
                placeholderTextColor={Colors.textMuted}
                value={eventTitle}
                onChangeText={setEventTitle}
              />

              <Text style={styles.label}>Qual o dia? (DD/MM/AAAA) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 27/05/2026"
                placeholderTextColor={Colors.textMuted}
                value={eventDate}
                onChangeText={setEventDate}
                maxLength={10}
              />

              <Text style={styles.label}>Horário (Opcional - HH:MM)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 15:00"
                placeholderTextColor={Colors.textMuted}
                value={eventTime}
                onChangeText={setEventTime}
                maxLength={5}
              />

              <Text style={styles.label}>Tipo de Atividade</Text>
              <View style={styles.typeRow}>
                {[
                  { key: 'school', label: '📚 Estudos' },
                  { key: 'leisure', label: '🎪 Lazer' },
                ].map((item) => {
                  const active = eventType === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.typePickerBtn, active && styles.typePickerBtnActive]}
                      onPress={() => setEventType(item.key)}
                    >
                      <Text style={[styles.typePickerBtnText, active && styles.typePickerBtnTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Recado / Detalhes (opcional)</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Estudar cap 3 do livro."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={eventDescription}
                onChangeText={setEventDescription}
              />

              <TouchableOpacity style={styles.btnSubmitModal} onPress={handleSaveEvent} activeOpacity={0.8}>
                <Text style={styles.btnSubmitModalText}>Adicionar Compromisso</Text>
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
    paddingBottom: 110,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 45,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
    marginLeft: 12,
    flex: 1,
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
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    ...Shadow.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '900',
    color: Colors.text,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
    paddingBottom: 32,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: 12,
  },
  textarea: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  typePickerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  typePickerBtnActive: {
    backgroundColor: Colors.primaryLighter,
    borderColor: Colors.primary,
  },
  typePickerBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  typePickerBtnTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  btnSubmitModal: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    ...Shadow.sm,
  },
  btnSubmitModalText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
