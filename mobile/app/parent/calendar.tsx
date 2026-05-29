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
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import api from '../../src/services/api';
import {
  FamilyCalendarBoard,
  CalendarEventItem,
  CalendarViewMode,
} from '../../src/components/calendar/FamilyCalendarBoard';
import { deriveCalendarRange, normalizeAnchorMidday, formatDateBR, parseDateBR, todayLocalYMD } from '../../src/shared/lib/familyCalendarRange';

function resetFormFields() {
  return {
    editingId: null as string | null,
    title: '',
    date: '',
    time: '',
    type: 'school',
    childId: '',
    description: '',
  };
}

export default function ParentCalendarScreen() {
  const router = useRouter();

  const [initialLoading, setInitialLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEventItem[]>([]);
  const [children, setChildren] = useState<{ id: string; name: string; color?: string }[]>([]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => normalizeAnchorMidday(new Date()));
  const [filterChildId, setFilterChildId] = useState('all');

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventType, setEventType] = useState('school');
  const [eventChildId, setEventChildId] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  const todayStr = useMemo(() => todayLocalYMD(), []);

  const upcomingParams = useMemo(() => {
    const y = new Date().getFullYear();
    return { from: todayStr, to: `${y + 1}-12-31` };
  }, [todayStr]);

  const calendarParams = useMemo(() => {
    const { from, to } = deriveCalendarRange(viewMode, anchorDate);
    const p: Record<string, string> = { from, to };
    if (filterChildId && filterChildId !== 'all') p.filter_child_id = filterChildId;
    return p;
  }, [viewMode, anchorDate, filterChildId]);

  const loadChildren = useCallback(async () => {
    try {
      const res = await api.get('/families/children');
      setChildren(res?.data || []);
    } catch {
      setChildren([]);
    }
  }, []);

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
      console.error('[ParentCalendar] Erro ao carregar calendário:', err);
    } finally {
      setInitialLoading(false);
      setCalendarLoading(false);
    }
  }, [calendarParams, upcomingParams]);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    loadEvents(initialLoading);
  }, [calendarParams]);

  const openCreateModal = (dateStr?: string) => {
    const f = resetFormFields();
    setEditingId(f.editingId);
    setEventTitle(f.title);
    setEventDate(dateStr ? formatDateBR(dateStr) : formatDateBR(todayStr));
    setEventTime(f.time);
    setEventType(f.type);
    setEventChildId(f.childId);
    setEventDescription(f.description);
    setShowEventModal(true);
  };

  const openEditModal = (ev: CalendarEventItem) => {
    setEditingId(ev.id);
    setEventTitle(ev.title);
    setEventDate(formatDateBR(ev.date));
    setEventTime(ev.time ? ev.time.slice(0, 5) : '');
    setEventType(ev.type || 'school');
    setEventChildId(ev.child_id || '');
    setEventDescription(ev.description || '');
    setShowEventModal(true);
  };

  const closeModal = () => {
    setShowEventModal(false);
    const f = resetFormFields();
    setEditingId(f.editingId);
    setEventTitle(f.title);
    setEventDate(f.date);
    setEventTime(f.time);
    setEventType(f.type);
    setEventChildId(f.childId);
    setEventDescription(f.description);
  };

  const handleSaveEvent = async () => {
    if (!eventTitle.trim() || !eventDate.trim()) {
      Alert.alert('Aviso', 'Preencha o título e a data do compromisso.');
      return;
    }
    const parsedDate = parseDateBR(eventDate);
    if (!parsedDate) {
      Alert.alert('Data Inválida', 'Informe a data no formato DD/MM/AAAA.');
      return;
    }

    const payload = {
      title: eventTitle.trim(),
      description: eventDescription.trim() || null,
      date: parsedDate,
      time: eventTime ? `${eventTime}:00` : null,
      type: eventType,
      child_id: eventChildId || null,
    };

    try {
      setCalendarLoading(true);
      if (editingId) {
        await api.put(`/calendar/${editingId}`, payload);
        Alert.alert('Sucesso!', 'Compromisso atualizado.');
      } else {
        await api.post('/calendar', payload);
        Alert.alert('Sucesso!', 'Compromisso agendado com sucesso!');
      }
      closeModal();
      await loadEvents();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o compromisso.');
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleDeleteEvent = () => {
    if (!editingId) return;
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja desmarcar o compromisso "${eventTitle}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setCalendarLoading(true);
              await api.delete(`/calendar/${editingId}`);
              Alert.alert('Sucesso!', 'Compromisso desmarcado.');
              closeModal();
              await loadEvents();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Não foi possível desmarcar.');
            } finally {
              setCalendarLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      <ModuleHeader
        title="Calendário Familiar"
        emoji="📅"
        onBack={() => router.back()}
        right={(
          <TouchableOpacity style={styles.addBtn} onPress={() => openCreateModal()} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+ Novo</Text>
          </TouchableOpacity>
        )}
      />

      {initialLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando agenda...</Text>
        </View>
      ) : (
        <FamilyCalendarBoard
          mode="parent"
          events={events}
          loading={calendarLoading}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          anchorDate={anchorDate}
          onAnchorChange={setAnchorDate}
          filterChildId={filterChildId}
          onFilterChildIdChange={setFilterChildId}
          childrenOptions={children}
          showUserFilter
          upcomingEvents={upcomingEvents}
          onEditEvent={openEditModal}
          onCreateOnDay={openCreateModal}
        />
      )}

      <Modal visible={showEventModal} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Editar Compromisso' : 'Agendar Compromisso'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>O que vai acontecer? *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Consulta Odontológica"
                placeholderTextColor={Colors.textMuted}
                value={eventTitle}
                onChangeText={setEventTitle}
              />

              <Text style={styles.label}>Data (DD/MM/AAAA) *</Text>
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
                placeholder="Ex: 14:30"
                placeholderTextColor={Colors.textMuted}
                value={eventTime}
                onChangeText={setEventTime}
                maxLength={5}
              />

              <Text style={styles.label}>Tipo de Compromisso</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                {[
                  { key: 'school', label: '📚 Escolar' },
                  { key: 'health', label: '💊 Saúde' },
                  { key: 'family', label: '🏠 Família' },
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
              </ScrollView>

              <Text style={styles.label}>Para qual filho? (Opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typePickerBtn, eventChildId === '' && styles.typePickerBtnActive]}
                  onPress={() => setEventChildId('')}
                >
                  <Text style={[styles.typePickerBtnText, eventChildId === '' && styles.typePickerBtnTextActive]}>
                    🏠 Geral
                  </Text>
                </TouchableOpacity>
                {children.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.typePickerBtn, eventChildId === c.id && styles.typePickerBtnActive]}
                    onPress={() => setEventChildId(c.id)}
                  >
                    <Text style={[styles.typePickerBtnText, eventChildId === c.id && styles.typePickerBtnTextActive]}>
                      👦 {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Mais detalhes (opcional)</Text>
              <TextInput
                style={[styles.textarea, { height: 60 }]}
                placeholder="Ex: Levar a caderneta de vacinação."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={eventDescription}
                onChangeText={setEventDescription}
              />

              <TouchableOpacity style={styles.btnSubmitModal} onPress={handleSaveEvent} activeOpacity={0.8}>
                <Text style={styles.btnSubmitModalText}>
                  {editingId ? 'Salvar Alterações' : 'Agendar Evento'}
                </Text>
              </TouchableOpacity>

              {editingId ? (
                <TouchableOpacity style={styles.btnDeleteModal} onPress={handleDeleteEvent}>
                  <Text style={styles.btnDeleteModalText}>Excluir Compromisso</Text>
                </TouchableOpacity>
              ) : null}
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
    gap: 8,
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
    marginTop: 4,
    ...Shadow.sm,
  },
  btnSubmitModalText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  btnDeleteModal: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  btnDeleteModalText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
