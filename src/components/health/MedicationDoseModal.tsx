import { useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import api from '../../services/api';
import { localDate, localDateTime, localTime } from '../../lib/medicationSchedule';
import { Colors, Radii } from '../../theme';

export function MedicationDoseModal({ medication, dose, onClose, onSaved }: {
  medication: { id: string; name: string };
  dose: { date: string; time: string };
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [takenDate, setTakenDate] = useState(() => localDate().split('-').reverse().join('/'));
  const [takenTime, setTakenTime] = useState(() => localTime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveRef = useRef(false);
  const inputStyle = { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.md, padding: 12, color: Colors.text, marginTop: 6, marginBottom: 12 };
  const save = async () => {
    if (saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    setError('');
    try {
      const day = /^\d{2}\/\d{2}\/\d{4}$/.test(takenDate) ? takenDate.split('/').reverse().join('-') : takenDate;
      const instant = localDateTime(day, takenTime);
      await api.post('/health/medication-logs', {
        medication_id: medication.id, taken_at: instant.toISOString(), status: 'taken',
        scheduled_date: dose.time ? dose.date : null, scheduled_time: dose.time || null,
      });
      await onSaved();
      onClose();
    } catch (err: any) { setError(err.message || 'Não foi possível registrar a dose.'); }
    finally { saveRef.current = false; setSaving(false); }
  };
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, maxHeight: '85%', backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }} contentContainerStyle={{ padding: 24 }}>
        <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 18 }}>Registrar tomada · {medication.name}</Text>
        {dose.time ? <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>Dose prevista: {dose.date.split('-').reverse().join('/')} às {dose.time}</Text> : null}
        <Text style={{ color: Colors.textSecondary, marginTop: 12, marginBottom: 12 }}>Informe quando realmente tomou. Você pode registrar mesmo depois do horário previsto.</Text>
        {error ? <Text accessibilityRole="alert" style={{ color: Colors.danger, marginBottom: 12 }}>{error}</Text> : null}
        <Text style={{ color: Colors.text, fontWeight: '700' }}>Data da tomada (DD/MM/AAAA)</Text>
        <TextInput accessibilityLabel="Data real da tomada" style={inputStyle} value={takenDate} onChangeText={setTakenDate} placeholder="DD/MM/AAAA" editable={!saving} />
        <Text style={{ color: Colors.text, fontWeight: '700' }}>Hora da tomada (HH:MM)</Text>
        <TextInput accessibilityLabel="Hora real da tomada" style={inputStyle} value={takenTime} onChangeText={setTakenTime} placeholder="HH:MM" maxLength={5} editable={!saving} />
        <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => { void save(); }} style={{ backgroundColor: Colors.primary, padding: 14, alignItems: 'center', borderRadius: Radii.md }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{saving ? 'Salvando...' : 'Confirmar: já tomou'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={onClose} style={{ padding: 14, alignItems: 'center' }}><Text style={{ color: Colors.textSecondary }}>Cancelar</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
