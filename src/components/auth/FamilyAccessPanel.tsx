import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { loadFamilyAccessMembers, type FamilyAccessMember } from '../../lib/familyAccess';
import { Colors, FontSize, Radii } from '../../theme';
import { useWindowSafeAreaInsets } from '../ui/AppSafeArea';
import { PrimaryButton } from '../ui/PrimaryButton';
import { FamilyAccessMessage } from './FamilyAccessMessage';

type Family = { id: string; name?: string; family_code?: string };

export function FamilyAccessPanel({ family }: { family: Family }) {
  const insets = useWindowSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [members, setMembers] = useState<FamilyAccessMember[]>([]);
  const [selected, setSelected] = useState<FamilyAccessMember | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const close = useCallback(() => {
    generation.current++; setVisible(false); setSelected(null); setMembers([]); setError(''); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => () => { close(); }, [close]));

  const load = async () => {
    const current = ++generation.current;
    setLoading(true); setError(''); setMembers([]); setSelected(null);
    try {
      const rows = await loadFamilyAccessMembers(supabase, family.id, family.family_code || '');
      if (generation.current === current) setMembers(rows);
    } catch (err) {
      if (generation.current === current) setError((err as Error).message);
    } finally { if (generation.current === current) setLoading(false); }
  };

  return <>
    <TouchableOpacity accessibilityRole="button" style={s.entry} onPress={() => { setVisible(true); void load(); }}>
      <Text style={s.title}>Acessos da família</Text>
      <Text style={s.help}>Consulte, copie e compartilhe o acesso dos filhos e responsáveis. A mensagem não contém senha.</Text>
      <Text style={s.link}>Ver mensagens de acesso ›</Text>
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={[s.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text accessibilityRole="header" style={s.title}>{selected ? 'Mensagem de acesso' : 'Acessos da família'}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar mensagens de acesso" onPress={close} style={s.close}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.body}>
            {loading ? <ActivityIndicator accessibilityLabel="Carregando acessos" color={Colors.primary}/> : error ? <>
              <Text accessibilityRole="alert" style={s.help}>{error}</Text>
              <PrimaryButton label="Tentar novamente" onPress={load}/>
            </> : selected ? <>
              <TouchableOpacity accessibilityRole="button" style={s.back} onPress={() => setSelected(null)}>
                <Text style={s.link}>‹ Escolher outro membro</Text>
              </TouchableOpacity>
              <FamilyAccessMessage key={selected.id} data={{name:selected.name,familyName:family.name || 'Minha família',familyCode:family.family_code || '',username:selected.username}}/>
            </> : <>
              <Text style={s.help}>Escolha a pessoa para abrir sua mensagem. Compartilhe somente com ela ou com seu responsável.</Text>
              {members.map(member => <TouchableOpacity key={member.id} accessibilityRole="button" accessibilityLabel={`Abrir acesso de ${member.name}`} style={s.member} onPress={() => setSelected(member)}>
                <View style={{flex:1}}>
                  <Text style={s.memberName}>{member.name}</Text>
                  <Text style={s.help}>{member.role === 'child' ? 'Filho(a)' : member.role === 'parent' ? 'Responsável' : 'Familiar'} · Usuário: {member.username}</Text>
                </View>
                <Text style={s.link}>›</Text>
              </TouchableOpacity>)}
              {!members.length && <Text style={s.help}>Ainda não há acessos ativos disponíveis. Cadastre os membros na administração da família.</Text>}
            </>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  entry:{padding:18,borderRadius:Radii.md,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,marginBottom:24,gap:8},
  title:{fontSize:FontSize.md,fontWeight:'800',color:Colors.text,flexShrink:1},
  help:{fontSize:FontSize.sm,lineHeight:21,color:Colors.textSecondary},
  link:{fontSize:FontSize.sm,fontWeight:'700',color:Colors.primary},
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',paddingHorizontal:16},
  sheet:{maxHeight:'100%',width:'100%',maxWidth:600,alignSelf:'center',backgroundColor:'#FFFFFF',borderRadius:22,overflow:'hidden',flexShrink:1},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderColor:Colors.border,gap:12},
  close:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'},
  closeText:{fontSize:22,color:Colors.primary},
  body:{padding:16,gap:12},
  back:{paddingVertical:12},
  member:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,backgroundColor:Colors.bg},
  memberName:{fontWeight:'800',fontSize:FontSize.base,color:Colors.text,marginBottom:4},
});
