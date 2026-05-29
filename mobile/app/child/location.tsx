import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Shadow, Radii, FontSize } from '../../src/theme';
import { supabase } from '../../src/lib/supabase';
import { useGeolocation, sendLocationForceUpdate } from '../../src/hooks/useGeolocation';
import { useFamilyLocations } from '../../src/hooks/useFamilyLocations';
import {
  FamilyMapView,
  formatLastSeen,
  MEMBER_COLORS,
} from '../../src/components/location/FamilyMapView';
import { UserAvatar } from '../../src/components/profile/UserAvatar';

interface SafeZone {
  id: string; type: string; latitude: number; longitude: number;
  radius_meters: number; color?: string;
}

export default function ChildLocationScreen() {
  const { user } = useAuth();
  const familyId = user?.family_id;
  const accent = '#EF4444';

  const [zones, setZones] = useState<SafeZone[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

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
    shareWithChildren: true,
  });

  const { locations, loading, refresh: refreshLocs } = useFamilyLocations({
    familyId,
    enabled: !!familyId,
    viewerRole: 'child',
    viewerUserId: user?.id,
  });

  const loadZones = useCallback(async () => {
    if (!familyId) return;
    const { data } = await supabase
      .from('safe_zones')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true);
    setZones(data || []);
  }, [familyId]);

  useEffect(() => { loadZones(); }, [loadZones]);

  const handleRefresh = async () => {
    try {
      await forceRefresh();
      await refreshLocs();
      await loadZones();
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a localização.');
    }
  };

  const focusMember = (userId: string) => {
    setSelectedUser(userId);
    if (userId !== user?.id && familyId) {
      sendLocationForceUpdate(familyId, userId);
    }
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={accent} />

      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>📍 Localização</Text>
          <Text style={s.headerSub}>Veja onde sua família está agora</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
          {refreshing ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={{ fontSize: 18 }}>🔄</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.infoBanner}>
        <Text style={s.infoText}>📡 Sua localização está sempre compartilhada com seus responsáveis</Text>
      </View>

      {!permissionReady ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[s.permDesc, { marginTop: 12 }]}>A pedir permissão de localização...</Text>
        </View>
      ) : permissionDenied ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📍</Text>
          <Text style={s.permTitle}>Permissão de Localização</Text>
          <Text style={s.permDesc}>Para ver o mapa, permita o acesso à localização.</Text>
          <TouchableOpacity style={[s.permBtn, { backgroundColor: accent }]} onPress={requestPermissions}>
            <Text style={s.permBtnText}>Permitir Localização</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.mapArea}>
          <FamilyMapView
            locations={locations}
            zones={zones}
            selectedUserId={selectedUser}
            currentUserId={user?.id}
            userPosition={position ? { lat: position.lat, lng: position.lng } : null}
            accentColor={accent}
            onSelectUser={focusMember}
            mapPaddingBottom={100}
          />

          {loading && (
            <View style={s.mapLoadingBadge}>
              <ActivityIndicator size="small" color={accent} />
              <Text style={s.mapLoadingText}>A actualizar posições...</Text>
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
                  backgroundColor={loc.user_id === user?.id ? accent : MEMBER_COLORS[idx % MEMBER_COLORS.length]}
                />
                <View>
                  <Text style={s.memberName}>{loc.user_id === user?.id ? 'Eu' : (loc.users?.name?.split(' ')[0] || 'Membro')}</Text>
                  <Text style={s.memberTime}>{formatLastSeen(loc.updated_at)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 44, paddingBottom: 12, backgroundColor: '#EF4444' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  infoBanner: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FEF2F2', borderBottomWidth: 1, borderBottomColor: '#FECACA' },
  infoText: { fontSize: 11, color: '#B91C1C', fontWeight: '600', textAlign: 'center' },
  mapArea: { flex: 1, position: 'relative' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  permDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 24 },
  permBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: Radii.full, ...Shadow.btn },
  permBtnText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
  memberStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.borderLight, maxHeight: 88 },
  memberStripContent: { paddingHorizontal: 16, gap: 10, paddingVertical: 10 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: Colors.border },
  memberChipActive: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: Colors.white, fontWeight: '800', fontSize: 12 },
  memberName: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
  memberTime: { fontSize: 10, color: Colors.textMuted },
  mapLoadingBadge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radii.full, ...Shadow.sm,
  },
  mapLoadingText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
}) as any;
