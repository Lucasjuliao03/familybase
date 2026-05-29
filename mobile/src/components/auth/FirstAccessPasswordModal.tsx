import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Radii, FontSize } from '../../theme';
import api from '../../services/api';

export function FirstAccessPasswordModal() {
  const { mustChangePassword, clearMustChangePassword, refreshProfile } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (!mustChangePassword) return null;

  const submit = async () => {
    setErr('');
    if (pw.length < 4) return setErr('Senha muito curta (mín. 4 caracteres).');
    if (pw !== pw2) return setErr('As senhas não coincidem.');
    setLoading(true);
    try {
      await api.put('/auth/password/first-access', { newPassword: pw });
      clearMustChangePassword();
      await refreshProfile();
      setPw('');
      setPw2('');
    } catch (ex: any) {
      setErr(ex?.message || 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Defina sua nova senha</Text>
          <Text style={styles.hint}>Por segurança, troque a senha temporária antes de continuar.</Text>
          {!!err && <Text style={styles.err}>{err}</Text>}
          <Text style={styles.label}>Nova senha</Text>
          <TextInput style={styles.input} secureTextEntry value={pw} onChangeText={setPw} />
          <Text style={styles.label}>Confirmar senha</Text>
          <TextInput style={styles.input} secureTextEntry value={pw2} onChangeText={setPw2} />
          <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Salvar senha</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 20 },
  title: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 16, lineHeight: 20 },
  err: { color: Colors.danger, marginBottom: 10, fontSize: FontSize.sm },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, backgroundColor: Colors.bg },
  btn: { backgroundColor: Colors.primary, borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnText: { color: Colors.white, fontWeight: '800' },
});
