import { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { localToday } from '../../lib/familyIdentity';
import { Colors } from '../../theme';
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function BirthDatePicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear() - 30);
  const [month, setMonth] = useState(0);
  const [choosing, setChoosing] = useState<'year' | 'month' | null>(null);
  const today = localToday();
  const enter = () => {
    if (value) { const [y,m] = value.split('-').map(Number); setYear(y); setMonth(m-1); }
    setChoosing(null); setOpen(true);
  };
  const chip = { padding: 10, borderRadius: 10, backgroundColor: Colors.bg, margin: 3 };
  return <>
    <TouchableOpacity onPress={enter} disabled={disabled} accessibilityRole="button" accessibilityLabel="Escolher data de nascimento" style={{ padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.bg }}>
      <Text style={{ color: value ? Colors.text : Colors.textMuted }}>📅 {value ? value.split('-').reverse().join('/') : 'DD/MM/AAAA'}</Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.4)', padding: 20 }}>
        <View style={{ backgroundColor: Colors.surface, borderRadius: 22, padding: 18, maxHeight: '85%' }}>
          <Text style={{ fontWeight: '800', color: Colors.text, fontSize: 18, marginBottom: 10 }}>Data de nascimento</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={chip} onPress={() => setChoosing(choosing === 'month' ? null : 'month')} accessibilityLabel="Escolher mês"><Text>{MONTHS[month]} ▾</Text></TouchableOpacity>
            <TouchableOpacity style={chip} onPress={() => setChoosing(choosing === 'year' ? null : 'year')} accessibilityLabel="Escolher ano"><Text>{year} ▾</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginVertical: 12 }}>
              {choosing === 'year' ? Array.from({ length: new Date().getFullYear()-1899 }, (_, i) => new Date().getFullYear()-i).map(y =>
                <TouchableOpacity key={y} style={chip} onPress={() => { setYear(y); setChoosing(null); }}><Text>{y}</Text></TouchableOpacity>) : choosing === 'month' ? MONTHS.map((m,i) =>
                <TouchableOpacity key={m} style={chip} onPress={() => { setMonth(i); setChoosing(null); }}><Text>{m}</Text></TouchableOpacity>) : Array.from({ length: new Date(year,month+1,0).getDate() }, (_, i) => i+1).map(day => {
                  const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  return <TouchableOpacity key={day} disabled={iso>today} style={{ ...chip, width: 38, alignItems: 'center', opacity: iso>today ? .3 : 1 }} onPress={() => { onChange(iso); setOpen(false); }} accessibilityLabel={`Selecionar ${day} de ${MONTHS[month]} de ${year}`}><Text>{day}</Text></TouchableOpacity>;
                })}
            </View>
          </ScrollView>
          <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 12, alignSelf: 'flex-end' }}><Text style={{ color: Colors.primary }}>Cancelar</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>;
}
