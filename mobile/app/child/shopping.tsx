import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
  RefreshControl, ActivityIndicator, Modal, TextInput, Alert,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize, Spacing } from '../../src/theme';
import { ShoppingModuleHeader } from '../../src/components/shopping/ShoppingModuleHeader';
import api from '../../src/services/api';

const COMMON_SUGGESTIONS = ['Leite', 'Pão', 'Ovos', 'Carne', 'Frango', 'Frutas', 'Legumes', 'Arroz', 'Feijão', 'Café'];
const ESTABLISHMENTS = ['Supermercado', 'Padaria', 'Açougue', 'Hortifruti', 'Farmácia'];

interface ShoppingItem {
  id: string; name: string; description?: string; quantity?: string;
  establishment?: string; price?: number; is_urgent: boolean; is_bought: boolean;
  registered_by: string; registered_by_name?: string;
  bought_by?: string; bought_by_name?: string; bought_at?: string; created_at: string;
}
interface ShoppingData { pending: ShoppingItem[]; history: ShoppingItem[]; }
interface ItemForm { name: string; quantity: string; establishment: string; price: string; is_urgent: boolean; }
const INIT_FORM: ItemForm = { name: '', quantity: '', establishment: '', price: '', is_urgent: false };

export default function ChildShoppingScreen() {
  const { user } = useAuth();

  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [items, setItems] = useState<ShoppingData>({ pending: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal adicionar
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<ItemForm>(INIT_FORM);
  const [saving, setSaving] = useState(false);

  // Modal comprar
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

  // Agrupamento
  const grouped = useMemo(() =>
    items.pending.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
      const k = item.establishment?.trim() || 'Geral';
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {}), [items.pending]);

  const sortedEst = useMemo(() =>
    Object.keys(grouped).sort((a, b) => a === 'Geral' ? 1 : b === 'Geral' ? -1 : a.localeCompare(b)),
    [grouped]);

  // ─── Adicionar item ───────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.name.trim()) return Alert.alert('Atenção', 'O nome do produto é obrigatório.');
    setSaving(true);
    try {
      await api.post('/shopping', {
        name: form.name.trim(),
        quantity: form.quantity || null,
        establishment: form.establishment || null,
        price: parseFloat(form.price) || 0,
        is_urgent: form.is_urgent,
      });
      setShowAddModal(false);
      setForm(INIT_FORM);
      fetchData(true);
    } catch { Alert.alert('Erro', 'Não foi possível adicionar o item.'); }
    finally { setSaving(false); }
  };

  // ─── Comprar ──────────────────────────────────────────────────────────────
  const handleBuyClick = (item: ShoppingItem) => {
    setBuyItem(item);
    setBuyPrice(item.price ? String(item.price) : '');
    setShowBuyModal(true);
  };

  const confirmBuy = async () => {
    if (!buyItem) return; setSaving(true);
    try {
      await api.put(`/shopping/${buyItem.id}/buy`, { price: parseFloat(buyPrice) || 0 });
      setShowBuyModal(false); setBuyItem(null); fetchData(true);
    } catch { Alert.alert('Erro', 'Não foi possível marcar como comprado.'); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#059669" />

      <ShoppingModuleHeader
        backgroundColor="#059669"
        title="Lista de Compras"
        subtitle="Veja e contribua com as compras da família"
        onAdd={() => { setForm(INIT_FORM); setShowAddModal(true); }}
      />

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.chip}><Text style={s.chipVal}>{items.pending.length}</Text><Text style={s.chipLabel}>Pendentes</Text></View>
        <View style={[s.chip, { backgroundColor: Colors.greenLight }]}>
          <Text style={[s.chipVal, { color: '#16A34A' }]}>{items.history.length}</Text>
          <Text style={[s.chipLabel, { color: '#16A34A' }]}>Comprados</Text>
        </View>
        {items.pending.filter(i => i.is_urgent).length > 0 && (
          <View style={[s.chip, { backgroundColor: '#FEF2F2' }]}>
            <Text style={[s.chipVal, { color: Colors.danger }]}>⚠️ {items.pending.filter(i => i.is_urgent).length}</Text>
            <Text style={[s.chipLabel, { color: Colors.danger }]}>Urgentes</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {(['pending', 'history'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive, { flex: 1 }]} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]} numberOfLines={1}>
              {t === 'pending' ? '📋 Pendentes' : '✅ Histórico'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.body}>
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color="#10B981" /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} colors={['#10B981']} />}
          showsVerticalScrollIndicator={false}
        >
          {tab === 'pending' ? (
            sortedEst.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 48, marginBottom: 8 }}>🛒</Text>
                <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: Colors.text }}>Lista vazia!</Text>
                <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' }}>Toque em ＋ para sugerir um item.</Text>
              </View>
            ) : (
              sortedEst.map(est => (
                <View key={est} style={s.estCard}>
                  <View style={s.estHeader}>
                    <Text style={s.estName}>🏪 {est}</Text>
                    <Text style={s.estCount}>{grouped[est].length} {grouped[est].length === 1 ? 'item' : 'itens'}</Text>
                  </View>
                  {grouped[est].map((item, idx) => (
                    <View key={item.id} style={[s.itemRow, item.is_urgent && s.itemRowUrgent, idx === grouped[est].length - 1 && s.itemRowLast]}>
                      <TouchableOpacity style={s.checkbox} onPress={() => handleBuyClick(item)} activeOpacity={0.7} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        {item.is_urgent && <Text style={s.urgentTag}>⚠️ URGENTE</Text>}
                        <Text style={[s.itemName, item.is_urgent && { color: Colors.danger }]} numberOfLines={2}>
                          {item.name}{item.quantity ? <Text style={s.itemQty}> ×{item.quantity}</Text> : null}
                        </Text>
                        {item.description ? <Text style={s.itemDesc} numberOfLines={1}>{item.description}</Text> : null}
                        <Text style={s.itemMeta}>👤 {item.registered_by_name || 'Família'} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</Text>
                      </View>
                      <TouchableOpacity style={s.buyBtn} onPress={() => handleBuyClick(item)} activeOpacity={0.8}>
                        <Text style={s.buyBtnText}>Comprei</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))
            )
          ) : (
            items.history.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 48, marginBottom: 8 }}>✅</Text>
                <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: Colors.text }}>Nenhum item comprado</Text>
                <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' }}>Os itens que você marcar aparecerão aqui.</Text>
              </View>
            ) : (
              items.history.map(item => (
                <View key={item.id} style={s.histCard}>
                  <View style={s.histCheck}><Text style={{ fontSize: 18 }}>✅</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histName} numberOfLines={1}>{item.name}{item.quantity ? <Text style={s.itemQty}> ×{item.quantity}</Text> : null}</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                      {item.establishment ? <Text style={s.metaText}>🏪 {item.establishment}</Text> : null}
                      <Text style={s.metaText}>👤 {item.bought_by_name || 'Família'}</Text>
                      {item.bought_at ? <Text style={s.metaText}>📅 {new Date(item.bought_at).toLocaleDateString('pt-BR')}</Text> : null}
                    </View>
                  </View>
                  {(item.price || 0) > 0 && (
                    <View style={s.priceBadge}><Text style={s.priceText}>R$ {(item.price || 0).toFixed(2)}</Text></View>
                  )}
                </View>
              ))
            )
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      </View>

      {/* ── Modal Adicionar ── */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>🛒 Sugerir Item</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Sugestões rápidas</Text>
              <View style={[s.suggestWrap, { marginBottom: 14 }]}>
                {COMMON_SUGGESTIONS.map(sg => (
                  <TouchableOpacity key={sg} style={[s.chip2, form.name === sg && s.chip2Active]} onPress={() => setForm(p => ({ ...p, name: sg }))}>
                    <Text style={[s.chip2Text, form.name === sg && { color: '#10B981', fontWeight: '700' }]}>{sg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>Nome do Produto *</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={form.name} onChangeText={t => setForm(p => ({ ...p, name: t }))} placeholder="Ex: Leite, Pão..." placeholderTextColor={Colors.textMuted} />
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Quantidade</Text>
                  <TextInput style={s.input} value={form.quantity} onChangeText={t => setForm(p => ({ ...p, quantity: t }))} placeholder="2, 1kg..." placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Preço estimado (R$)</Text>
                  <TextInput style={s.input} value={form.price} onChangeText={t => setForm(p => ({ ...p, price: t }))} placeholder="0,00" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                </View>
              </View>
              <Text style={s.fieldLabel}>Onde comprar?</Text>
              <View style={[s.suggestWrap, { marginBottom: 14 }]}>
                {ESTABLISHMENTS.map(e => (
                  <TouchableOpacity key={e} style={[s.chip2, form.establishment === e && s.chip2Active]} onPress={() => setForm(p => ({ ...p, establishment: e }))}>
                    <Text style={[s.chip2Text, form.establishment === e && { color: '#10B981', fontWeight: '700' }]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[s.urgentRow, { borderColor: '#D1FAE5' }]}>
                <View>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: Colors.text }}>⚠️ É Urgente?</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 }}>Avisa a família que é prioridade</Text>
                </View>
                <Switch value={form.is_urgent} onValueChange={v => setForm(p => ({ ...p, is_urgent: v }))} trackColor={{ false: Colors.border, true: '#10B981' }} thumbColor={Colors.white} />
              </View>
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAddModal(false)}><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: '#10B981' }]} onPress={handleAdd} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveText}>Adicionar 🛒</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Comprar ── */}
      <Modal visible={showBuyModal} animationType="slide" transparent onRequestClose={() => setShowBuyModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.sheet, { maxHeight: 360 }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>🛍️ Marcar como Comprado</Text>
            <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>
              Você comprou <Text style={{ fontWeight: '700', color: '#10B981' }}>{buyItem?.name}</Text>?
            </Text>
            <Text style={s.fieldLabel}>Quanto custou? (Opcional — R$)</Text>
            <TextInput style={[s.input, { marginBottom: 8 }]} value={buyPrice} onChangeText={setBuyPrice} placeholder="Ex: 5,90" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} autoFocus />
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 16 }}>Informar o preço ajuda a família a acompanhar os gastos 💪</Text>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowBuyModal(false)}><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: '#10B981' }]} onPress={confirmBuy} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveText}>Confirmar ✅</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.full, backgroundColor: Colors.primaryLighter },
  chipVal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  chipLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: Radii.md, alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: 'transparent' },
  tabBtnActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  tabBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  tabBtnTextActive: { color: '#059669', fontWeight: '700' },
  
  body: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 110 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 40, alignItems: 'center', gap: 8, ...Shadow.sm },

  estCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, overflow: 'hidden', ...Shadow.sm },
  estHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ECFDF5', borderBottomWidth: 1, borderBottomColor: '#D1FAE5' },
  estName: { fontSize: FontSize.sm, fontWeight: '700', color: '#059669' },
  estCount: { fontSize: FontSize.xs, color: Colors.textSecondary },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemRowLast: { borderBottomWidth: 0 },
  itemRowUrgent: { backgroundColor: 'rgba(239,68,68,0.04)' },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#10B981', backgroundColor: 'transparent' },
  urgentTag: { fontSize: 9, color: Colors.danger, fontWeight: '800', marginBottom: 2 },
  itemName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  itemQty: { fontSize: FontSize.xs, fontWeight: '400', color: Colors.textSecondary },
  itemDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  itemMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  buyBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radii.md, backgroundColor: '#10B981' },
  buyBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.white },

  histCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 14, ...Shadow.sm },
  histCheck: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  histName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  metaText: { fontSize: 11, color: Colors.textSecondary },
  priceBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.full },
  priceText: { fontSize: FontSize.xs, fontWeight: '700', color: '#059669' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,11,75,0.45)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 24, maxHeight: '92%', ...Shadow.lg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderRadius: Radii.sm, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.sm, color: Colors.text },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip2: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.full, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border },
  chip2Active: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  chip2Text: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  urgentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg, borderRadius: Radii.md, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: Colors.borderLight },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radii.md, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  saveBtn: { flex: 1.5, paddingVertical: 14, borderRadius: Radii.md, backgroundColor: Colors.primary, alignItems: 'center', ...Shadow.btn },
  saveText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.white },
}) as any;
