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
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Dimensions,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize, Spacing } from '../../src/theme';
import { ShoppingModuleHeader } from '../../src/components/shopping/ShoppingModuleHeader';
import api from '../../src/services/api';

const SCREEN_W = Dimensions.get('window').width;
const COMMON_SUGGESTIONS = [
  'Leite', 'Pão', 'Ovos', 'Carne', 'Frango',
  'Frutas', 'Legumes', 'Arroz', 'Feijão',
  'Café', 'Papel Higiênico', 'Sabonete', 'Detergente',
];
const ESTABLISHMENTS = ['Supermercado', 'Padaria', 'Açougue', 'Hortifruti', 'Farmácia'];
const CHART_COLORS = ['#6366F1', '#10B981', '#F97316', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B'];

interface ShoppingItem {
  id: string; name: string; description?: string; quantity?: string;
  establishment?: string; price?: number; is_urgent: boolean; is_bought: boolean;
  registered_by: string; registered_by_name?: string;
  bought_by?: string; bought_by_name?: string; bought_at?: string; created_at: string;
}
interface ShoppingData { pending: ShoppingItem[]; history: ShoppingItem[]; }
interface ItemForm { name: string; description: string; quantity: string; establishment: string; price: string; is_urgent: boolean; }

const INIT_FORM: ItemForm = { name: '', description: '', quantity: '', establishment: '', price: '', is_urgent: false };

// ─── Mini Bar Chart (nativo, sem lib) ────────────────────────────────────────
function MiniBarChart({ data, color = Colors.primary }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(8, Math.floor((SCREEN_W - 80) / Math.max(data.length, 1)) - 4);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 3, paddingTop: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={{ alignItems: 'center', flex: 1 }}>
          <View style={{ width: barW, height: Math.max(4, (d.value / max) * 64), backgroundColor: color, borderRadius: 4 }} />
          <Text style={{ fontSize: 8, color: Colors.textMuted, marginTop: 2 }} numberOfLines={1}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ParentShoppingScreen() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent' || user?.role === 'master';

  const [tab, setTab] = useState<'pending' | 'history' | 'dashboard'>('pending');
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<ShoppingData>({ pending: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(INIT_FORM);
  const [saving, setSaving] = useState(false);

  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyItem, setBuyItem] = useState<ShoppingItem | null>(null);
  const [buyPrice, setBuyPrice] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/shopping');
      setItems(res.data ?? { pending: [], history: [] });
    } catch { if (!silent) Alert.alert('Erro', 'Não foi possível carregar a lista.'); }
    finally { if (!silent) setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Grouping ────────────────────────────────────────────────────────────
  const groupedPending = useMemo(() =>
    items.pending.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
      const k = item.establishment?.trim() || 'Geral';
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {}), [items.pending]);

  const sortedEst = useMemo(() =>
    Object.keys(groupedPending).sort((a, b) => a === 'Geral' ? 1 : b === 'Geral' ? -1 : a.localeCompare(b)),
    [groupedPending]);

  // ─── Quick stats ─────────────────────────────────────────────────────────
  const quickStats = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthSpent = items.history
      .filter(i => (i.bought_at || i.created_at).startsWith(thisMonth))
      .reduce((s, i) => s + (i.price || 0), 0);
    return { pending: items.pending.length, urgent: items.pending.filter(i => i.is_urgent).length, monthSpent };
  }, [items]);

  // ─── Dashboard data ───────────────────────────────────────────────────────
  const dashboard = useMemo(() => {
    const [refY, refM] = filterMonth.split('-');
    const daysInMonth = new Date(Number(refY), Number(refM), 0).getDate();
    const daily: Record<number, number> = {};
    for (let d = 1; d <= daysInMonth; d++) daily[d] = 0;

    let totalMonth = 0, totalYear = 0, totalItems = 0;
    const estMap: Record<string, number> = {};
    const userMap: Record<string, number> = {};
    const prodMap: Record<string, number> = {};
    const monthlyMap: Record<string, number> = {};
    const itemCount: Record<string, number> = {};
    let mostBought = { name: '-', count: 0 };

    items.history.forEach(item => {
      const price = item.price || 0;
      if (!price) return;
      const d = new Date(item.bought_at || item.created_at);
      const month = d.toISOString().slice(0, 7);
      const year = d.toISOString().slice(0, 4);
      monthlyMap[month] = (monthlyMap[month] || 0) + price;
      if (year === refY) totalYear += price;
      if (month === filterMonth) {
        totalMonth += price;
        totalItems += 1;
        const est = item.establishment?.trim() || 'Outros';
        estMap[est] = (estMap[est] || 0) + price;
        const u = item.bought_by_name || 'Desconhecido';
        userMap[u] = (userMap[u] || 0) + price;
        prodMap[item.name] = (prodMap[item.name] || 0) + price;
        itemCount[item.name] = (itemCount[item.name] || 0) + 1;
        if (itemCount[item.name] > mostBought.count) mostBought = { name: item.name, count: itemCount[item.name] };
        daily[d.getDate()] = (daily[d.getDate()] || 0) + price;
      }
    });

    const avgTicket = totalItems > 0 ? totalMonth / totalItems : 0;
    const dailyData = Object.keys(daily).map(day => ({ label: day, value: daily[Number(day)] }));
    const monthlyData = Object.keys(monthlyMap).sort().slice(-6).map(m => {
      const [y, mo] = m.split('-');
      return { label: `${mo}/${y.slice(2)}`, value: monthlyMap[m] };
    });
    const topProducts = Object.keys(prodMap).map(k => ({ name: k, value: prodMap[k] })).sort((a, b) => b.value - a.value).slice(0, 5);
    const estData = Object.keys(estMap).map(k => ({ name: k, value: estMap[k] })).sort((a, b) => b.value - a.value);

    return { totalMonth, totalYear, totalItems, avgTicket, mostBought, dailyData, monthlyData, topProducts, estData, urgentCount: quickStats.urgent };
  }, [items.history, filterMonth, quickStats.urgent]);

  // ─── CRUD ────────────────────────────────────────────────────────────────
  const openAdd = () => { setForm(INIT_FORM); setEditId(null); setShowModal(true); };
  const openEdit = (item: ShoppingItem) => {
    setForm({ name: item.name, description: item.description || '', quantity: item.quantity || '', establishment: item.establishment || '', price: item.price ? String(item.price) : '', is_urgent: !!item.is_urgent });
    setEditId(item.id); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return Alert.alert('Atenção', 'O nome do produto é obrigatório.');
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description || null, quantity: form.quantity || null, establishment: form.establishment || null, price: parseFloat(form.price) || 0, is_urgent: form.is_urgent };
      editId ? await api.put(`/shopping/${editId}`, payload) : await api.post('/shopping', payload);
      setShowModal(false); fetchData(true);
    } catch { Alert.alert('Erro', 'Não foi possível salvar o item.'); }
    finally { setSaving(false); }
  };

  const handleBuyClick = (item: ShoppingItem) => { setBuyItem(item); setBuyPrice(item.price ? String(item.price) : ''); setShowBuyModal(true); };
  const confirmBuy = async () => {
    if (!buyItem) return; setSaving(true);
    try { await api.put(`/shopping/${buyItem.id}/buy`, { price: parseFloat(buyPrice) || 0 }); setShowBuyModal(false); setBuyItem(null); fetchData(true); }
    catch { Alert.alert('Erro', 'Não foi possível marcar como comprado.'); }
    finally { setSaving(false); }
  };

  const handleUnbuy = (item: ShoppingItem) => Alert.alert('Desfazer compra', `Retornar "${item.name}" para pendentes?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', onPress: async () => { try { await api.put(`/shopping/${item.id}/unbuy`); fetchData(true); } catch { Alert.alert('Erro', 'Não foi possível desfazer.'); } } },
  ]);

  const handleDelete = (item: ShoppingItem) => Alert.alert('Excluir', `Excluir "${item.name}"?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: async () => { try { await api.delete(`/shopping/${item.id}`); fetchData(true); } catch { Alert.alert('Erro', 'Não foi possível excluir.'); } } },
  ]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradStart} />

      <ShoppingModuleHeader
        backgroundColor={Colors.gradStart}
        title="Lista de Compras"
        subtitle="Gerencie compras e gastos da família"
        showAdd={tab !== 'dashboard'}
        onAdd={openAdd}
      />

      {/* Quick stats bar */}
      <View style={s.statsRow}>
        <View style={[s.chip, { backgroundColor: Colors.primaryLighter }]}>
          <Text style={s.chipVal}>{quickStats.pending}</Text>
          <Text style={s.chipLabel}>Pendentes</Text>
        </View>
        {quickStats.urgent > 0 && (
          <View style={[s.chip, { backgroundColor: '#FEF2F2' }]}>
            <Text style={[s.chipVal, { color: Colors.danger }]}>⚠️ {quickStats.urgent}</Text>
            <Text style={[s.chipLabel, { color: Colors.danger }]}>Urgentes</Text>
          </View>
        )}
        <View style={[s.chip, { backgroundColor: Colors.greenLight }]}>
          <Text style={[s.chipVal, { color: '#16A34A' }]}>R$ {quickStats.monthSpent.toFixed(2)}</Text>
          <Text style={[s.chipLabel, { color: '#16A34A' }]}>Mês</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {(['pending', 'history', ...(isParent ? ['dashboard'] as const : [])] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive, isParent && { flex: 1 }]}
            onPress={() => setTab(t as typeof tab)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]} numberOfLines={1}>
              {t === 'pending' ? '📋 Pendentes' : t === 'history' ? '✅ Histórico' : '📊 Painel'}
            </Text>
            {t === 'pending' && quickStats.pending > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{quickStats.pending}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.body}>
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} colors={[Colors.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── PENDING ── */}
          {tab === 'pending' && (
            sortedEst.length === 0 ? <EmptyState emoji="🛒" title="Lista vazia!" sub="Toque em ＋ para adicionar." /> :
            sortedEst.map(est => (
              <View key={est} style={s.estCard}>
                <View style={s.estHeader}>
                  <Text style={s.estName}>🏪 {est}</Text>
                  <Text style={s.estCount}>{groupedPending[est].length} {groupedPending[est].length === 1 ? 'item' : 'itens'}</Text>
                </View>
                {groupedPending[est].map((item, idx) => (
                  <View key={item.id} style={[s.itemRow, item.is_urgent && s.itemRowUrgent, idx === groupedPending[est].length - 1 && s.itemRowLast]}>
                    <TouchableOpacity style={s.checkbox} onPress={() => handleBuyClick(item)} activeOpacity={0.7} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {item.is_urgent && <Text style={s.urgentTag}>⚠️ URGENTE</Text>}
                      <Text style={[s.itemName, item.is_urgent && { color: Colors.danger }]} numberOfLines={2}>
                        {item.name}{item.quantity ? <Text style={s.itemQty}> ×{item.quantity}</Text> : null}
                      </Text>
                      {item.description ? <Text style={s.itemDesc} numberOfLines={1}>{item.description}</Text> : null}
                      <Text style={s.itemMeta}>👤 {item.registered_by_name || 'Família'} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</Text>
                    </View>
                    <View style={s.itemActions}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(item)}><Text>✏️</Text></TouchableOpacity>
                      <TouchableOpacity style={s.actionBtn} onPress={() => handleDelete(item)}><Text>🗑️</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            items.history.length === 0 ? <EmptyState emoji="✅" title="Sem histórico" sub="Itens comprados aparecerão aqui." /> :
            items.history.map(item => (
              <View key={item.id} style={s.histCard}>
                <TouchableOpacity style={s.undoBtn} onPress={() => handleUnbuy(item)}><Text style={{ fontSize: 18 }}>↩️</Text></TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={s.histName} numberOfLines={1}>{item.name}{item.quantity ? <Text style={s.itemQty}> ×{item.quantity}</Text> : null}</Text>
                  <View style={s.histMeta}>
                    {item.establishment ? <Text style={s.metaText}>🏪 {item.establishment}</Text> : null}
                    <Text style={s.metaText}>👤 {item.bought_by_name || 'Família'}</Text>
                    {item.bought_at ? <Text style={s.metaText}>📅 {new Date(item.bought_at).toLocaleDateString('pt-BR')}</Text> : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {(item.price || 0) > 0 && <View style={s.priceBadge}><Text style={s.priceText}>R$ {(item.price || 0).toFixed(2)}</Text></View>}
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(item)}><Text>✏️</Text></TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => handleDelete(item)}><Text>🗑️</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && isParent && (
            <View style={{ gap: 16 }}>
              {/* Month picker */}
              <View style={s.monthRow}>
                <Text style={s.monthLabel}>📅 Mês de referência:</Text>
                <TouchableOpacity style={s.monthBtn}
                  onPress={() => {
                    const [y, m] = filterMonth.split('-').map(Number);
                    const prev = new Date(y, m - 2, 1);
                    setFilterMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                  }}>
                  <Text style={s.monthArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={s.monthVal}>{filterMonth.split('-').reverse().join('/')}</Text>
                <TouchableOpacity style={s.monthBtn}
                  onPress={() => {
                    const [y, m] = filterMonth.split('-').map(Number);
                    const next = new Date(y, m, 1);
                    const now = new Date();
                    if (next <= now) setFilterMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                  }}>
                  <Text style={s.monthArrow}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Hero */}
              <View style={s.dashHero}>
                <View>
                  <Text style={s.dashHeroLabel}>Total gasto em {filterMonth.split('-').reverse().join('/')}</Text>
                  <Text style={s.dashHeroVal}>R$ {dashboard.totalMonth.toFixed(2)}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <View style={s.heroPill}><Text style={s.heroPillText}>📅 Ano: R$ {dashboard.totalYear.toFixed(2)}</Text></View>
                    <View style={s.heroPill}><Text style={s.heroPillText}>🧾 {dashboard.totalItems} itens</Text></View>
                  </View>
                </View>
                <Text style={{ fontSize: 48 }}>🛒</Text>
              </View>

              {/* KPIs */}
              <View style={s.kpiRow}>
                {[
                  { icon: '🧾', label: 'Comprados', val: String(dashboard.totalItems), color: '#6366F1', bg: '#EEF2FF' },
                  { icon: '🚨', label: 'Urgentes', val: String(dashboard.urgentCount), color: Colors.danger, bg: '#FEF2F2' },
                  { icon: '💰', label: 'Ticket Médio', val: `R$${dashboard.avgTicket.toFixed(2)}`, color: Colors.blue, bg: Colors.blueLight },
                  { icon: '⭐', label: 'Mais comprado', val: dashboard.mostBought.name.slice(0, 8), color: '#059669', bg: Colors.greenLight },
                ].map((k, i) => (
                  <View key={i} style={[s.kpiCard, { backgroundColor: k.bg }]}>
                    <Text style={s.kpiIcon}>{k.icon}</Text>
                    <Text style={[s.kpiVal, { color: k.color }]}>{k.val}</Text>
                    <Text style={s.kpiLabel}>{k.label}</Text>
                  </View>
                ))}
              </View>

              {/* Gastos diários */}
              <View style={s.chartCard}>
                <Text style={s.chartTitle}>📅 Gastos Diários</Text>
                {dashboard.dailyData.some(d => d.value > 0) ? (
                  <MiniBarChart data={dashboard.dailyData} color="#6366F1" />
                ) : <Text style={s.chartEmpty}>📭 Sem compras neste mês</Text>}
              </View>

              {/* Evolução mensal */}
              <View style={s.chartCard}>
                <Text style={s.chartTitle}>📈 Últimos 6 Meses</Text>
                {dashboard.monthlyData.some(d => d.value > 0) ? (
                  <MiniBarChart data={dashboard.monthlyData} color="#10B981" />
                ) : <Text style={s.chartEmpty}>📭 Sem histórico</Text>}
              </View>

              {/* Por estabelecimento */}
              {dashboard.estData.length > 0 && (
                <View style={s.chartCard}>
                  <Text style={s.chartTitle}>🏬 Por Estabelecimento</Text>
                  {dashboard.estData.map((e, i) => {
                    const pct = dashboard.totalMonth > 0 ? (e.value / dashboard.totalMonth) * 100 : 0;
                    return (
                      <View key={i} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: FontSize.xs, color: Colors.text, fontWeight: '600' }}>{e.name}</Text>
                          <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary }}>R$ {e.value.toFixed(2)} · {pct.toFixed(0)}%</Text>
                        </View>
                        <View style={{ height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: 8, width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 4 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Top 5 Produtos */}
              {dashboard.topProducts.length > 0 && (
                <View style={s.chartCard}>
                  <Text style={s.chartTitle}>🏆 Top 5 Produtos</Text>
                  {dashboard.topProducts.map((p, i) => (
                    <View key={i} style={s.topProdRow}>
                      <View style={[s.topProdRank, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>#{i + 1}</Text>
                      </View>
                      <Text style={s.topProdName} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.topProdVal}>R$ {p.value.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      </View>

      {/* ── Modal Add/Edit ── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>{editId ? '✏️ Editar Item' : '➕ Adicionar Item'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!editId && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.fieldLabel}>Sugestões rápidas</Text>
                  <View style={s.suggestWrap}>
                    {COMMON_SUGGESTIONS.map(sg => (
                      <TouchableOpacity key={sg} style={[s.chip2, form.name === sg && s.chip2Active]} onPress={() => setForm(p => ({ ...p, name: sg }))}>
                        <Text style={[s.chip2Text, form.name === sg && { color: Colors.primary, fontWeight: '700' }]}>{sg}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <Text style={s.fieldLabel}>Nome do Produto *</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={form.name} onChangeText={t => setForm(p => ({ ...p, name: t }))} placeholder="Ex: Leite, Pão..." placeholderTextColor={Colors.textMuted} />
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Quantidade</Text>
                  <TextInput style={s.input} value={form.quantity} onChangeText={t => setForm(p => ({ ...p, quantity: t }))} placeholder="2, 1kg..." placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Preço (R$)</Text>
                  <TextInput style={s.input} value={form.price} onChangeText={t => setForm(p => ({ ...p, price: t }))} placeholder="0,00" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                </View>
              </View>
              <Text style={s.fieldLabel}>Estabelecimento</Text>
              <TextInput style={[s.input, { marginBottom: 8 }]} value={form.establishment} onChangeText={t => setForm(p => ({ ...p, establishment: t }))} placeholder="Supermercado, Padaria..." placeholderTextColor={Colors.textMuted} />
              <View style={[s.suggestWrap, { marginBottom: 14 }]}>
                {ESTABLISHMENTS.map(e => (
                  <TouchableOpacity key={e} style={[s.chip2, form.establishment === e && s.chip2Active]} onPress={() => setForm(p => ({ ...p, establishment: e }))}>
                    <Text style={[s.chip2Text, form.establishment === e && { color: Colors.primary, fontWeight: '700' }]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>Descrição / Observação</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={form.description} onChangeText={t => setForm(p => ({ ...p, description: t }))} placeholder="Marca, tamanho..." placeholderTextColor={Colors.textMuted} />
              <View style={s.urgentRow}>
                <View>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: Colors.text }}>⚠️ Marcar como Urgente</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 }}>Destaca o item na lista</Text>
                </View>
                <Switch value={form.is_urgent} onValueChange={v => setForm(p => ({ ...p, is_urgent: v }))} trackColor={{ false: Colors.border, true: Colors.danger }} thumbColor={Colors.white} />
              </View>
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveText}>{editId ? 'Salvar' : 'Adicionar'}</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Confirmar Compra ── */}
      <Modal visible={showBuyModal} animationType="slide" transparent onRequestClose={() => setShowBuyModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.sheet, { maxHeight: 360 }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>✅ Confirmar Compra</Text>
            <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>
              Marcando <Text style={{ fontWeight: '700', color: Colors.primary }}>{buyItem?.name}</Text> como comprado.
            </Text>
            <Text style={s.fieldLabel}>Valor pago (Opcional — R$)</Text>
            <TextInput style={[s.input, { marginBottom: 8 }]} value={buyPrice} onChangeText={setBuyPrice} placeholder="Ex: 10,50" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} autoFocus />
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 16 }}>Registrar ajuda a acompanhar gastos no Painel.</Text>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowBuyModal(false)}><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: Colors.success }]} onPress={confirmBuy} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveText}>Confirmar ✅</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <View style={s.emptyCard}>
      <Text style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</Text>
      <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: Colors.text }}>{title}</Text>
      <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.full },
  chipVal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  chipLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },

  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: Radii.md,
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 44,
  },
  tabBtnActive: { backgroundColor: Colors.primaryLighter, borderColor: Colors.primary },
  tabBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, flexShrink: 1 },
  tabBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  tabBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  body: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 110 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 40, alignItems: 'center', gap: 8, ...Shadow.sm },

  estCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, overflow: 'hidden', ...Shadow.sm },
  estHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primaryLighter, borderBottomWidth: 1, borderBottomColor: Colors.border },
  estName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  estCount: { fontSize: FontSize.xs, color: Colors.textSecondary },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemRowLast: { borderBottomWidth: 0 },
  itemRowUrgent: { backgroundColor: 'rgba(239,68,68,0.04)' },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: Colors.border, backgroundColor: 'transparent' },
  urgentTag: { fontSize: 9, color: Colors.danger, fontWeight: '800', marginBottom: 2 },
  itemName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  itemQty: { fontSize: FontSize.xs, fontWeight: '400', color: Colors.textSecondary },
  itemDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  itemMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  itemActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },

  histCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 14, ...Shadow.sm },
  undoBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  histName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  histMeta: { flexDirection: 'row', gap: 10, marginTop: 3, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: Colors.textSecondary },
  priceBadge: { backgroundColor: Colors.primaryLighter, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.full },
  priceText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  // Dashboard
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 14, ...Shadow.sm },
  monthLabel: { flex: 1, fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  monthBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLighter, alignItems: 'center', justifyContent: 'center' },
  monthArrow: { fontSize: 18, color: Colors.primary, fontWeight: '700' },
  monthVal: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.primary },

  dashHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primary, borderRadius: Radii.xl, padding: 20, ...Shadow.btn },
  dashHeroLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  dashHeroVal: { fontSize: FontSize.xxxl, fontWeight: '900', color: Colors.white, lineHeight: 44 },
  heroPill: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  heroPillText: { fontSize: 11, color: Colors.white, fontWeight: '600' },

  kpiRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kpiCard: { flex: 1, minWidth: '45%', borderRadius: Radii.lg, padding: 14, alignItems: 'center', gap: 4, ...Shadow.sm },
  kpiIcon: { fontSize: 22 },
  kpiVal: { fontSize: FontSize.md, fontWeight: '900' },
  kpiLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600', textAlign: 'center' },

  chartCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 16, ...Shadow.sm },
  chartTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  chartEmpty: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },

  topProdRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  topProdRank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  topProdName: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  topProdVal: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  // Modal / Sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,11,75,0.45)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 24, maxHeight: '92%', ...Shadow.lg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderRadius: Radii.sm, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.sm, color: Colors.text },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip2: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.full, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border },
  chip2Active: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  chip2Text: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  urgentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg, borderRadius: Radii.md, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: Colors.borderLight },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radii.md, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  saveBtn: { flex: 1.5, paddingVertical: 14, borderRadius: Radii.md, backgroundColor: Colors.primary, alignItems: 'center', ...Shadow.btn },
  saveText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.white },
}) as any;
