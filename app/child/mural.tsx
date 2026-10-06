import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Radii, Shadow, FontSize } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import api from '../../src/services/api';
export default function ChildMuralScreen() {
  const router = useRouter();
  const { childProfile } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [notices, setNotices] = useState<any[]>([]);

  // Filtros
  const [filterType, setFilterType] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const params: any = {};
      if (filterType) params.type = filterType;
      if (filterPriority) params.priority = filterPriority;

      const { data } = await api.get('/mural/notices', { params });
      
      // Ordenar por fixados (is_pinned = true) primeiro
      const sorted = [...(data || [])].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      setNotices(sorted);
    } catch (err) {
      console.error('[ChildMural] Erro ao carregar mural:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterType, filterPriority]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Confirmar leitura do aviso
  const handleConfirmRead = async (id: string) => {
    try {
      setLoading(true);
      await api.post(`/mural/notices/${id}/confirm`);
      Alert.alert('Sucesso 👍', 'Você confirmou a leitura deste comunicado.');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível confirmar a leitura.');
    } finally {
      setLoading(false);
    }
  };

  // Concluir tarefa rápida
  const handleCompleteTask = async (id: string) => {
    try {
      setLoading(true);
      await api.post(`/mural/notices/${id}/complete`);
      Alert.alert('Parabéns! 🎉', 'Você completou a tarefa rápida do mural.');
      loadData(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível concluir a tarefa.');
    } finally {
      setLoading(false);
    }
  };

  // Registrar leitura simples ao exibir
  const handleMarkRead = async (id: string) => {
    try {
      await api.post(`/mural/notices/${id}/read`);
    } catch {
      // Ignora erro silenciosamente
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ──────────────────────────────── */}
      <LinearGradient
        colors={['#F59E0B', '#FBBF24', '#D97706']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Mural de Recados 📌</Text>
            <Text style={styles.headerSub}>Fique por dentro de tudo na família! 📢</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      {/* Filtros Rápidos */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {/* Tipos */}
          <TouchableOpacity
            style={[styles.filterChip, filterType === '' && styles.filterChipActive]}
            onPress={() => setFilterType('')}
          >
            <Text style={[styles.filterChipText, filterType === '' && styles.filterChipTextActive]}>Todos Tipos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'notice' && styles.filterChipActive]}
            onPress={() => setFilterType('notice')}
          >
            <Text style={[styles.filterChipText, filterType === 'notice' && styles.filterChipTextActive]}>📢 Avisos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'reminder' && styles.filterChipActive]}
            onPress={() => setFilterType('reminder')}
          >
            <Text style={[styles.filterChipText, filterType === 'reminder' && styles.filterChipTextActive]}>⏰ Lembretes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'quick_task' && styles.filterChipActive]}
            onPress={() => setFilterType('quick_task')}
          >
            <Text style={[styles.filterChipText, filterType === 'quick_task' && styles.filterChipTextActive]}>⚡ Tarefas Rápidas</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Prioridades */}
          <TouchableOpacity
            style={[styles.filterChip, filterPriority === '' && styles.filterChipActive]}
            onPress={() => setFilterPriority('')}
          >
            <Text style={[styles.filterChipText, filterPriority === '' && styles.filterChipTextActive]}>Todas Prioridades</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterPriority === 'urgent' && styles.filterChipActive]}
            onPress={() => setFilterPriority('urgent')}
          >
            <Text style={[styles.filterChipText, filterPriority === 'urgent' && styles.filterChipTextActive]}>🔥 Urgente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterPriority === 'high' && styles.filterChipActive]}
            onPress={() => setFilterPriority('high')}
          >
            <Text style={[styles.filterChipText, filterPriority === 'high' && styles.filterChipTextActive]}>⚠️ Alta</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={styles.loadingText}>Carregando comunicados do mural...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F59E0B']} />
          }
        >
          {notices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 44, marginBottom: 8 }}>📌</Text>
              <Text style={styles.emptyTextTitle}>Mural vazio!</Text>
              <Text style={styles.emptyTextSub}>Não há recados ou avisos pendentes por enquanto.</Text>
            </View>
          ) : (
            notices.map((n) => {
              const isUrgent = n.priority === 'urgent';
              const isHigh = n.priority === 'high';
              const cardBorderColor = isUrgent ? '#E17055' : isHigh ? '#FDCB6E' : Colors.border;

              return (
                <Card
                  key={n.id}
                  style={[styles.muralCard, { borderLeftColor: cardBorderColor }]}
                  onLayout={() => handleMarkRead(n.id)}
                >
                  <View style={styles.flexRowBetween}>
                    <View style={styles.badgeRow}>
                      {n.is_pinned ? <Badge label="Fixado 📌" variant="warning" /> : null}
                      <Badge label={n.type === 'quick_task' ? 'Tarefa Rápida' : n.type === 'reminder' ? 'Lembrete' : 'Aviso'} variant="primary" />
                      <Badge label={n.priority === 'urgent' ? 'Urgente' : n.priority === 'high' ? 'Alta' : 'Normal'} variant="ghost" />
                    </View>
                    {n.due_datetime ? (
                      <Text style={styles.dueDate}>Até: {new Date(n.due_datetime).toLocaleDateString('pt-BR')}</Text>
                    ) : null}
                  </View>

                  <Text style={styles.noticeTitle}>{n.title}</Text>
                  {n.description ? <Text style={styles.noticeDesc}>{n.description}</Text> : null}

                  <Text style={styles.noticeAuthor}>✍️ Autor: {n.author_name || 'Pais'}</Text>

                  {/* Confirmação de Leitura Exigida */}
                  {n.requires_read_confirmation && (
                    <View style={styles.confirmBox}>
                      {!n.myRead?.confirmed_at ? (
                        <TouchableOpacity
                          style={styles.btnConfirm}
                          onPress={() => handleConfirmRead(n.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.btnConfirmText}>Confirmar Leitura 👍</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.readConfirmedBadge}>
                          <Text style={styles.readConfirmedText}>✓ Leitura Confirmada</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Conclusão de Tarefa Rápida */}
                  {n.type === 'quick_task' && n.status === 'active' && (
                    <TouchableOpacity
                      style={styles.btnComplete}
                      onPress={() => handleCompleteTask(n.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnCompleteText}>Marcar como Concluída ✅</Text>
                    </TouchableOpacity>
                  )}
                  {n.type === 'quick_task' && n.status === 'completed' && (
                    <View style={styles.taskCompletedBadge}>
                      <Text style={styles.taskCompletedText}>🎉 Tarefa Concluída!</Text>
                    </View>
                  )}
                </Card>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg, paddingBottom: 72 },
  header:  { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26, marginTop: -2 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  filterBar: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  filterChip: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#F59E0B12',
    borderColor: '#F59E0B',
  },
  filterChipText: {
    fontSize: FontSize.xs - 1,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#D97706',
    fontWeight: '800',
  },
  divider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },

  scroll:   { flex: 1 },
  content:  { padding: 16, paddingBottom: 110 },

  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    ...Shadow.sm,
  },
  emptyTextTitle: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  emptyTextSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  muralCard: {
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.border,
  },
  flexRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  dueDate: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  noticeTitle: {
    fontSize: FontSize.base - 1,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 6,
  },
  noticeDesc: {
    fontSize: FontSize.xs + 1,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  noticeAuthor: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 10,
  },

  confirmBox: {
    marginTop: 6,
  },
  btnConfirm: {
    backgroundColor: '#F59E0B',
    borderRadius: Radii.full,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  btnConfirmText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  readConfirmedBadge: {
    backgroundColor: '#d1fae5',
    borderRadius: Radii.full,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  readConfirmedText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '800',
  },

  btnComplete: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
    marginTop: 8,
  },
  btnCompleteText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  taskCompletedBadge: {
    backgroundColor: Colors.primaryLighter,
    borderRadius: Radii.full,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginTop: 8,
  },
  taskCompletedText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
});
