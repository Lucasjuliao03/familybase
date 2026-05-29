import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import api from '../../src/services/api';
import { UserAvatar } from '../../src/components/profile/UserAvatar';

type MasterTab = 'overview' | 'families' | 'users' | 'subscriptions';

interface MasterStats {
  totalFamilies: number;
  activeFamilies: number;
  totalUsers: number;
  activeUsers: number;
}

export default function MasterHomeScreen() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<MasterTab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [families, setFamilies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [st, fam, usr, subs] = await Promise.all([
        api.get('/master/stats'),
        api.get('/master/families'),
        api.get('/master/users'),
        api.get('/master/subscriptions'),
      ]);
      setStats(st.data ?? null);
      setFamilies(Array.isArray(fam.data) ? fam.data : []);
      setUsers(Array.isArray(usr.data) ? usr.data : []);
      setSubscriptions(Array.isArray(subs.data) ? subs.data : []);
    } catch {
      if (!silent) Alert.alert('Erro', 'Não foi possível carregar o painel master.');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleUserStatus = (id: string, current?: string) => {
    const next = current === 'active' ? 'inactive' : 'active';
    Alert.alert('Alterar utilizador', `Mudar estado para ${next}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try { await api.put(`/master/users/${id}/status`, { status: next }); loadData(true); }
        catch (err: any) { Alert.alert('Erro', err?.message || 'Falha.'); }
      }},
    ]);
  };

  const toggleSubscription = (familyId: string) => {
    Alert.alert('Alterar plano', 'Definir plano premium ativo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Premium', onPress: async () => {
        try { await api.put(`/master/subscriptions/${familyId}`, { plan: 'premium', status: 'active' }); loadData(true); }
        catch (err: any) { Alert.alert('Erro', err?.message || 'Falha.'); }
      }},
    ]);
  };

  const toggleFamilyStatus = (id: string, current?: string) => {
    const next = current === 'active' ? 'inactive' : 'active';
    Alert.alert('Alterar família', `Mudar estado para ${next}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          try {
            await api.put(`/master/families/${id}/status`, { status: next });
            loadData(true);
          } catch (err: any) {
            Alert.alert('Erro', err?.message || 'Falha ao atualizar.');
          }
        },
      },
    ]);
  };

  const tabs: { id: MasterTab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'families', label: 'Famílias' },
    { id: 'users', label: 'Utilizadores' },
    { id: 'subscriptions', label: 'Planos' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#fff" />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.name || 'Master'}</Text>
          <Text style={styles.familyName}>Painel global SaaS</Text>
        </View>
        <UserAvatar
          avatarUrl={user?.avatar_url as string | undefined}
          avatarPreset={user?.avatar_preset as string | undefined}
          name={user?.name}
          size={44}
          bordered={false}
          backgroundColor="#1E3A5F"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#93C5FD" size="large" style={{ marginTop: 40 }} />
      ) : (
        <>
          {tab === 'overview' && stats && (
            <View style={styles.statsGrid}>
              {[
                { label: 'Famílias', value: stats.totalFamilies, sub: `${stats.activeFamilies} ativas` },
                { label: 'Utilizadores', value: stats.totalUsers, sub: `${stats.activeUsers} ativos` },
              ].map((s) => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statVal}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={styles.statSub}>{s.sub}</Text>
                </View>
              ))}
            </View>
          )}

          {tab === 'families' && families.map((f) => (
            <View key={f.id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{f.name || 'Família'}</Text>
                <Text style={styles.listMeta}>Estado: {f.status || '—'} · Plano: {f.plan || '—'}</Text>
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={() => toggleFamilyStatus(f.id, f.status)}>
                <Text style={styles.actionBtnText}>{f.status === 'active' ? 'Desativar' : 'Ativar'}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {tab === 'users' && users.slice(0, 50).map((u) => (
            <View key={u.id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{u.name || u.email || 'Utilizador'}</Text>
                <Text style={styles.listMeta}>{u.role} · {u.status || '—'}</Text>
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={() => toggleUserStatus(u.id, u.status)}>
                <Text style={styles.actionBtnText}>{u.status === 'active' ? 'Desativar' : 'Ativar'}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {tab === 'subscriptions' && subscriptions.map((sub) => (
            <View key={sub.family_id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{sub.family_name || 'Família'}</Text>
                <Text style={styles.listMeta}>Plano: {sub.plan || '—'} · {sub.status || '—'}</Text>
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={() => toggleSubscription(sub.family_id)}>
                <Text style={styles.actionBtnText}>Premium</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  familyName: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  avatarBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E293B',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155',
  },
  avatarText: { color: '#93C5FD', fontWeight: '800', fontSize: 18 },
  tabRow: { gap: 8, marginBottom: 16 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#1E293B' },
  tabBtnActive: { backgroundColor: '#2563EB' },
  tabText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  statCard: {
    flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  statVal: { fontSize: 28, fontWeight: '900', color: '#F8FAFC' },
  statLabel: { fontSize: 13, color: '#CBD5E1', marginTop: 4, fontWeight: '700' },
  statSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#334155',
  },
  listTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 14 },
  listMeta: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  actionBtn: { backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  logoutBtn: {
    marginTop: 24, backgroundColor: '#1E293B', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#EF4444',
  },
  logoutText: { color: '#FCA5A5', fontWeight: '800' },
});
