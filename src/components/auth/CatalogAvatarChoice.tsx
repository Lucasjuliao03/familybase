import { Image, Text, TouchableOpacity, View } from 'react-native';
import { ADULT_AVATAR_IDS, CHILD_AVATAR_IDS } from '../../lib/familyIdentity';
import { getAvatarPresetPortraitSource } from '../../lib/avatarCatalog';
import { Colors } from '../../theme';

export function CatalogAvatarChoice({ kind = 'adult', value, onChange, disabled = false, showcase = false }: { kind?: 'adult' | 'child'; value?: string | null; onChange: (id: string) => void; disabled?: boolean; showcase?: boolean }) {
  const ids = kind === 'adult' ? ADULT_AVATAR_IDS : CHILD_AVATAR_IDS;
  const labels: Record<string, string> = { homem1: 'Adulto 1', homem2: 'Adulto 2', menina2: 'Adulta' };
  return <View>
    {showcase && <View style={{ height: 228, borderRadius: 24, backgroundColor: Colors.primaryLighter, alignItems: 'center', justifyContent: 'center' }}><Image source={getAvatarPresetPortraitSource(value || ids[0])} style={{ width: 210, height: 210 }} resizeMode="contain" accessibilityLabel={labels[value || ids[0]] || 'Prévia do avatar'} /></View>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: showcase ? 'center' : 'flex-start', gap: 10, marginVertical: 8 }}>
    {ids.map((id: string) => <TouchableOpacity key={id} disabled={disabled} onPress={() => onChange(id)} accessibilityRole="radio" accessibilityState={{ selected: value === id, disabled }} accessibilityLabel={labels[id] || id}
      style={{ alignItems: 'center', borderRadius: 16, padding: 7, borderWidth: 2, borderColor: value === id ? Colors.primary : Colors.border, backgroundColor: value === id ? Colors.primaryLighter : Colors.bg }}>
      <Image source={getAvatarPresetPortraitSource(id)} style={{ width: 54, height: 54 }} resizeMode="contain" />
      <Text style={{ fontSize: 11, color: Colors.text, textTransform: 'capitalize' }}>{labels[id] || id}</Text>
    </TouchableOpacity>)}
    </View>
  </View>;
}
