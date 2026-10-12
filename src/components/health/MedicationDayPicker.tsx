import { View, Text, TouchableOpacity } from 'react-native';
import { localDate, localDateTime } from '../../lib/medicationSchedule';
import { Colors } from '../../theme';

export function MedicationDayPicker({ date, today, onChange }: { date: string; today: string; onChange: (date: string | null) => void }) {
  const move = (delta: number) => {
    const next = localDateTime(date, '12:00');
    next.setDate(next.getDate() + delta);
    const day = localDate(next);
    onChange(day === today ? null : day);
  };
  return <View style={{ marginBottom: 12, gap: 8 }}>
    <Text style={{ color: Colors.text, fontWeight: '700' }}>Doses de {date.split('-').reverse().join('/')}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <TouchableOpacity accessibilityRole="button" onPress={() => move(-1)}><Text style={{ color: Colors.primary }}>‹ Dia anterior</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => onChange(null)}><Text style={{ color: Colors.primary }}>Hoje</Text></TouchableOpacity>
      {date < today && <TouchableOpacity accessibilityRole="button" onPress={() => move(1)}><Text style={{ color: Colors.primary }}>Próximo dia ›</Text></TouchableOpacity>}
    </View>
  </View>;
}
