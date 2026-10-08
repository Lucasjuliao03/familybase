import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Switch, Modal, TextInput,
  ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { ModuleHeader } from '../../src/components/ui/ModuleHeader';
import { supabase } from '../../src/lib/supabase';
import { useGeolocation, sendLocationForceUpdate } from '../../src/hooks/useGeolocation';
import { useFamilyLocations } from '../../src/hooks/useFamilyLocations';
import {
  FamilyMapView,
  formatLastSeen,
  MEMBER_COLORS,
  ZONE_ICONS,
} from '../../src/components/location/FamilyMapView';
import { UserAvatar } from '../../src/components/profile/UserAvatar';

const ZONE_COLORS: Record<string, string> = { home: '#10B981', school: '#3B82F6', work: '#F97316', other: '#8B5CF6' };

interface SafeZone {
  id: string; name: string; type: string; latitude: number; longitude: number;
  radius_meters: number; color?: string;
}

export default function ParentLocationScreen() {
  const router = useRouter();
  const { family, user } = useAuth();
  const familyId = family?.id || user?.family_id;

  const [tab, setTab] = useState<'map' | 'zones' | 'alerts'>('map');
  const [zones, setZones] = useState<SafeZone[]>([]);
  const [zoneAlerts, setZoneAlerts] = useState<any[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', type: 'home', radius_meters: '200', latitude: '', longitude: '' });
  const [savingZone, setSavingZone] = useState(false);

  const {
    position,
    permissionGranted,
    permissionDenied,
    permissionReady,
    requestPermissions,
    forceRefresh,
    refreshing,
  } = useGeolocation({
    familyId,
    userId: user?.id,
    enabled: !!familyId && !!user?.id,
    shareWithChildren: isSharing,
  });

  const { locations, loading: locsLoading, refresh: refreshLocs } = useFamilyLocations({
    familyId,
    enabled: !!familyId,
    viewerRole: user?.role,
    viewerUserId: user?.id,
  });

  const loadZones = useCallback(async () => {
    if (!familyId) return;
    setZonesLoading(true);
    try {
      const { data, error } = await supabase
        .from('safe_zones')
        .select('*')
        .eq('family_id', familyId)
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      setZones(data || []);
      const myLoc = locations.find((l) => l.user_id === user?.id);
      if (myLoc && myLoc.share_with_children === false) setIsSharing(false);
    } catch (e) {
      console.warn('[Location] zones error:', e);
    } finally {
      setZonesLoading(false);
    }
  }, [familyId, locations, user?.id]);

  useEffect(() => { loadZones(); }, [loadZones]);

  const loadAlerts = useCallback(async () => {
    if (!familyId || !user?.id) return;
    const { data, error } = await supabase.from('notifications')
      .select('id,title,message,type,is_read,created_at,data')
      .eq('family_id', familyId).eq('user_id', user.id)
      .in('type', ['zone_enter', 'zone_exit'])
      .order('created_at', { ascending: false }).limit(50);
    if (!error) setZoneAlerts(data || []);
  }, [familyId, user?.id]);

  useEffect(() => {
    void loadAlerts();
    const interval = setInterval(() => { void loadAlerts(); }, 20_000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const handleRefresh = async () => {
    try {
      await forceRefresh();
      await refreshLocs();
      await loadZones();
      await loadAlerts();
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a localização.');
    }
  };

  const toggleSharing = async (val: boolean) => {
    setIsSharing(val);
    if (!user?.id) return;
    await supabase.from('family_locations').update({ share_with_children: val }).eq('user_id', user.id);
    await forceRefresh().catch(() => {});
  };

  const focusMember = (userId: string) => {
    setSelectedUser(userId);
    if (userId !== user?.id && familyId) {
      sendLocationForceUpdate(familyId, userId);
    }
  };

  const selectedLocation = locations.find((loc) => loc.user_id === selectedUser);

  const openEditZone = (zone: SafeZone) => {
    setEditingZoneId(zone.id);
    setZoneForm({ name: zone.name, type: zone.type, radius_meters: String(zone.radius_meters), latitude: String(zone.latitude), longitude: String(zone.longitude) });
    setShowZoneModal(true);
  };

  const handleCreateZone = async () => {
    const latitude = Number(zoneForm.latitude.replace(',', '.'));
    const longitude = Number(zoneForm.longitude.replace(',', '.'));
    const radius = Number(zoneForm.radius_meters.replace(',', '.'));
    if (!zoneForm.name.trim() || !Number.isFinite(latitude) || Math.abs(latitude) > 90
      || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || !Number.isFinite(radius) || radius < 30 || radius > 5000) {
      return Alert.alert('Dados inválidos', 'Informe nome, coordenadas válidas e raio entre 30 e 5000 metros.');
    }
    setSavingZone(true);
    try {
      const values = {
        name: zoneForm.name.trim(),
        type: zoneForm.type, icon: ZONE_ICONS[zoneForm.type],
        latitude, longitude, radius_meters: radius,
        color: ZONE_COLORS[zoneForm.type],
      };
      const query = editingZoneId
        ? supabase.from('safe_zones').update(values).eq('id', editingZoneId).eq('family_id', familyId)
        : supabase.from('safe_zones').insert({ ...values, family_id: familyId, user_id: user?.id, created_by: user?.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      setZones((z) => editingZoneId ? z.map((item) => item.id === editingZoneId ? data : item) : [...z, data]);
      setShowZoneModal(false);
      setEditingZoneId(null);
      setZoneForm({ name: '', type: 'home', radius_meters: '200', latitude: '', longitude: '' });
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Não foi possível salvar a zona.');
    } finally {
      setSavingZone(false);
    }
  };

  const deleteZone = (zoneId: string) => Alert.alert('Excluir Zona', 'Remover esta zona segura?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: async () => {
      const { error } = await supabase.from('safe_zones').delete().eq('id', zoneId).eq('family_id', familyId);
      if (error) return Alert.alert('Erro', error.message);
      setZones((z) => z.filter((z2) => z2.id !== zoneId));
    }},
  ]);

  const myLoc = locations.find((l) => l.user_id === user?.id);

  return (
    <View style={s.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      <ModuleHeader
        title="Localização"
        emoji="📍"
        subtitle="Rastreamento da família em tempo real"
        onBack={() => router.back()}
        right={(
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
            {refreshing ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={{ fontSize: 18 }}>🔄</Text>}
          </TouchableOpacity>
        )}
      />

      <View style={s.sharingRow}>
        <View>
          <Text style={s.sharingLabel}>👁️ Visível para os filhos</Text>
          <Text style={s.sharingSub}>{isSharing ? 'Sua localização está sendo compartilhada' : 'Sua localização está oculta'}</Text>
        </View>
        <Switch value={isSharing} onValueChange={toggleSharing} trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor={Colors.white} />
      </View>

      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tabBtn, tab === 'map' && s.tabBtnActive]} onPress={() => setTab('map')}>
          <Text style={[s.tabText, tab === 'map' && s.tabTextActive]}>🗺️ Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'zones' && s.tabBtnActive]} onPress={() => setTab('zones')}>
          <Text style={[s.tabText, tab === 'zones' && s.tabTextActive]}>🛡️ Zonas Seguras</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'alerts' && s.tabBtnActive]} onPress={() => { setTab('alerts'); void loadAlerts(); }}>
          <Text style={[s.tabText, tab === 'alerts' && s.tabTextActive]}>🔔 Alertas{zoneAlerts.some((alert) => !alert.is_read) ? ' •' : ''}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'map' ? (
        <View style={s.mapArea}>
              <FamilyMapView
                locations={locations}
                zones={zones}
                selectedUserId={selectedUser}
                currentUserId={user?.id}
                currentUser={{
                  name: user?.name,
                  avatar_url: user?.avatar_url,
                  avatar_preset: user?.avatar_preset,
                }}
                userPosition={position ? { lat: position.lat, lng: position.lng } : null}
                onSelectUser={focusMember}
                mapPaddingBottom={100}
                isDrawingMode={isDrawingMode}
                onMapClick={(lat, lng) => {
                  setZoneForm({
                    name: '',
                    type: 'home',
                    radius_meters: '200',
                    latitude: String(lat),
                    longitude: String(lng),
                  });
                  setIsDrawingMode(false);
                  setShowZoneModal(true);
                }}
                draftZone={showZoneModal && zoneForm.latitude && zoneForm.longitude ? {
                  latitude: parseFloat(zoneForm.latitude),
                  longitude: parseFloat(zoneForm.longitude),
                  radius_meters: parseInt(zoneForm.radius_meters, 10) || 200
                } : null}
              />

              {permissionDenied && (
                <TouchableOpacity style={s.permissionNotice} onPress={requestPermissions}>
                  <Text style={s.positionText}>Permita o GPS para transmitir sua posição. As últimas posições da família continuam visíveis. Toque para permitir.</Text>
                </TouchableOpacity>
              )}

              {isDrawingMode && (
                <View style={s.drawingBanner}>
                  <Text style={s.drawingBannerText}>🎯 Toque no mapa para definir o local seguro</Text>
                  <TouchableOpacity style={s.cancelDrawingBtn} onPress={() => setIsDrawingMode(false)}>
                    <Text style={s.cancelDrawingText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {(locsLoading || zonesLoading) && (
                <View style={s.mapLoadingBadge}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={s.mapLoadingText}>A actualizar posições...</Text>
                </View>
              )}

              {selectedLocation && (
                <View style={s.positionCard}>
                  <Text style={s.positionTitle}>{selectedLocation.users?.name || 'Membro'}</Text>
                  <Text style={s.positionText}>Última posição: {new Date(selectedLocation.updated_at).toLocaleString('pt-BR')}</Text>
                  <Text style={s.positionText}>Se o aparelho estiver sem sinal, esta posição permanece até chegar uma nova atualização.</Text>
                  <TouchableOpacity onPress={() => setSelectedUser(null)}><Text style={{ color: Colors.primary, fontWeight: '700' }}>Fechar</Text></TouchableOpacity>
                </View>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.memberStrip} contentContainerStyle={s.memberStripContent}>
                {locations.map((loc, idx) => (
                  <TouchableOpacity key={loc.user_id} style={[s.memberChip, selectedUser === loc.user_id && s.memberChipActive]} onPress={() => focusMember(loc.user_id)}>
                    <UserAvatar
                      avatarUrl={loc.users?.avatar_url}
                      avatarPreset={loc.users?.avatar_preset}
                      name={loc.users?.name}
                      size={36}
                      bordered={false}
                      backgroundColor={MEMBER_COLORS[idx % MEMBER_COLORS.length]}
                    />
                    <View>
                      <Text style={s.memberName} numberOfLines={1}>{loc.users?.name?.split(' ')[0] || 'Membro'}</Text>
                      <Text style={s.memberTime}>{formatLastSeen(loc.updated_at)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
        </View>
      ) : tab === 'zones' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <TouchableOpacity style={s.addZoneBtn} onPress={() => {
            setEditingZoneId(null);
            Alert.alert(
              '🛡️ Nova Zona Segura',
              'Como deseja definir a localização da nova zona?',
              [
                {
                  text: 'Marcar no Mapa 🗺️',
                  onPress: () => {
                    setTab('map');
                    setIsDrawingMode(true);
                  }
                },
                {
                  text: 'Usar minha localização atual 📍',
                  onPress: () => {
                    setZoneForm({
                      name: '', type: 'home', radius_meters: '200',
                      latitude: myLoc ? String(myLoc.latitude) : '',
                      longitude: myLoc ? String(myLoc.longitude) : '',
                    });
                    setShowZoneModal(true);
                  }
                },
                { text: 'Cancelar', style: 'cancel' }
              ]
            );
          }}>
            <Text style={s.addZoneBtnText}>＋ Adicionar Zona Segura</Text>
          </TouchableOpacity>
          {zones.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={{ fontSize: 48, marginBottom: 8 }}>🛡️</Text>
              <Text style={s.emptyTitle}>Nenhuma zona cadastrada</Text>
              <Text style={s.emptyDesc}>Crie zonas seguras como casa, escola e trabalho.</Text>
            </View>
          ) : zones.map((zone) => (
            <View key={zone.id} style={s.zoneCard}>
              <View style={[s.zoneIcon, { backgroundColor: zone.color || Colors.primary }]}>
                <Text style={{ fontSize: 20 }}>{ZONE_ICONS[zone.type] || '📍'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{zone.name}</Text>
                <Text style={s.zoneMeta}>📏 {zone.radius_meters}m · 📍 {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)}</Text>
              </View>
              <TouchableOpacity onPress={() => openEditZone(zone)} style={{ padding: 8 }}>
                <Text style={{ fontSize: 18 }}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteZone(zone.id)}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}>
          {zoneAlerts.length === 0 ? <Text style={s.emptyDesc}>Nenhum alerta de zona segura ainda.</Text> : zoneAlerts.map((item) => (
            <TouchableOpacity key={item.id} style={[s.zoneCard, !item.is_read && { borderWidth: 1, borderColor: Colors.primary }]}
              onPress={async () => {
                if (!item.is_read) {
                  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', item.id).eq('user_id', user?.id);
                  if (!error) setZoneAlerts((items) => items.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
                }
              }}>
              <Text style={{ fontSize: 24 }}>{item.type === 'zone_enter' ? '🏠' : '🚶'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{item.message}</Text>
                <Text style={s.zoneMeta}>{new Date(item.created_at).toLocaleString('pt-BR')}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={showZoneModal} animationType="slide" transparent onRequestClose={() => setShowZoneModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>{editingZoneId ? '✏️ Editar Zona Segura' : '🛡️ Nova Zona Segura'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Nome da Zona</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={zoneForm.name} onChangeText={(t) => setZoneForm((f) => ({ ...f, name: t }))} placeholder="Ex: Casa, Escola..." placeholderTextColor={Colors.textMuted} />
              <Text style={s.fieldLabel}>Tipo</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {Object.entries(ZONE_ICONS).map(([type, icon]) => (
                  <TouchableOpacity key={type} style={[s.typeBtn, zoneForm.type === type && { backgroundColor: ZONE_COLORS[type], borderColor: ZONE_COLORS[type] }]} onPress={() => setZoneForm((f) => ({ ...f, type }))}>
                    <Text style={{ fontSize: 20 }}>{icon}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Latitude</Text>
                  <TextInput style={s.input} value={zoneForm.latitude} onChangeText={(t) => setZoneForm((f) => ({ ...f, latitude: t }))} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Longitude</Text>
                  <TextInput style={s.input} value={zoneForm.longitude} onChangeText={(t) => setZoneForm((f) => ({ ...f, longitude: t }))} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                </View>
              </View>
              <Text style={s.fieldLabel}>Raio da zona (metros)</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={zoneForm.radius_meters}
                onChangeText={(t) => setZoneForm((f) => ({ ...f, radius_meters: t }))}
                keyboardType="number-pad" placeholder="200" placeholderTextColor={Colors.textMuted} />
              {myLoc && (
                <TouchableOpacity style={s.useMyLocBtn} onPress={() => setZoneForm((f) => ({ ...f, latitude: String(myLoc.latitude), longitude: String(myLoc.longitude) }))}>
                  <Text style={s.useMyLocText}>📍 Usar minha localização atual</Text>
                </TouchableOpacity>
              )}
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowZoneModal(false)}><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleCreateZone} disabled={savingZone}>
                  {savingZone ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveText}>{editingZoneId ? 'Salvar' : 'Criar Zona'}</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryLighter, alignItems: 'center', justifyContent: 'center' },
  sharingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sharingLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  sharingSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: Radii.md, alignItems: 'center', backgroundColor: Colors.bg },
  tabBtnActive: { backgroundColor: Colors.primaryLighter, borderWidth: 1.5, borderColor: Colors.primary },
  tabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  mapArea: { flex: 1, position: 'relative' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  permDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 24 },
  permBtn: { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: Radii.full, ...Shadow.btn },
  permBtnText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
  memberStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.borderLight, maxHeight: 88 },
  memberStripContent: { paddingHorizontal: 16, gap: 10, paddingVertical: 10 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: Colors.border },
  memberChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: Colors.white, fontWeight: '800', fontSize: 12 },
  memberName: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
  memberTime: { fontSize: 10, color: Colors.textMuted },
  addZoneBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radii.lg, alignItems: 'center', ...Shadow.btn },
  addZoneBtnText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
  emptyCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 40, alignItems: 'center', ...Shadow.sm },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: 8 },
  zoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 14, ...Shadow.sm },
  zoneIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  zoneName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  zoneMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,11,75,0.45)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%', ...Shadow.lg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderRadius: Radii.sm, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.sm, color: Colors.text },
  typeBtn: { padding: 12, borderRadius: Radii.md, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border },
  useMyLocBtn: { backgroundColor: Colors.primaryLighter, borderRadius: Radii.md, paddingVertical: 10, alignItems: 'center', marginBottom: 14 },
  useMyLocText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radii.md, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  saveBtn: { flex: 1.5, paddingVertical: 14, borderRadius: Radii.md, backgroundColor: Colors.primary, alignItems: 'center', ...Shadow.btn },
  saveText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.white },
  mapLoadingBadge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radii.full, ...Shadow.sm,
  },
  mapLoadingText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  drawingBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: Radii.lg,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    ...Shadow.md,
    zIndex: 999,
  },
  drawingBannerText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '700',
    flex: 1,
  },
  cancelDrawingBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radii.full,
  },
  cancelDrawingText: {
    color: Colors.white,
    fontSize: FontSize.xs - 1,
    fontWeight: '800',
  },
  positionCard: {
    position: 'absolute', top: 12, left: 16, right: 16,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: 14, gap: 4, ...Shadow.md,
  },
  positionTitle: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '800' },
  positionText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  permissionNotice: { position: 'absolute', top: 12, left: 16, right: 16, backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 12, ...Shadow.sm },
}) as any;
