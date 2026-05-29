import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors } from '../../theme';

export interface MapLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  updated_at?: string;
  users?: { name?: string };
}

export interface MapZone {
  id: string;
  name?: string;
  type: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  color?: string;
}

export interface UserPosition {
  lat: number;
  lng: number;
}

const ZONE_ICONS: Record<string, string> = { home: '🏠', school: '🏫', work: '💼', other: '📍' };
const MEMBER_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

const DEFAULT_REGION: Region = {
  latitude: -23.5505,
  longitude: -46.6333,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

interface FamilyMapViewProps {
  locations: MapLocation[];
  zones?: MapZone[];
  selectedUserId?: string | null;
  currentUserId?: string;
  userPosition?: UserPosition | null;
  accentColor?: string;
  onSelectUser?: (userId: string) => void;
  mapPaddingBottom?: number;
}

function buildRegionFromPoints(
  points: { latitude: number; longitude: number }[],
  fallback: Region,
): Region {
  if (!points.length) return fallback;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 0.012;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + pad * 2, 0.025),
    longitudeDelta: Math.max(maxLng - minLng + pad * 2, 0.025),
  };
}

export function FamilyMapView({
  locations,
  zones = [],
  selectedUserId,
  currentUserId,
  userPosition,
  accentColor = Colors.primary,
  onSelectUser,
  mapPaddingBottom = 90,
}: FamilyMapViewProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);

  const fallbackRegion: Region = useMemo(() => {
    const mine = locations.find((l) => l.user_id === currentUserId);
    const first = mine || locations[0];
    if (first) {
      return {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    if (userPosition) {
      return {
        latitude: userPosition.lat,
        longitude: userPosition.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    return DEFAULT_REGION;
  }, [locations, currentUserId, userPosition]);

  const [region, setRegion] = useState<Region>(fallbackRegion);

  useEffect(() => {
    setRegion(fallbackRegion);
  }, [fallbackRegion.latitude, fallbackRegion.longitude]);

  const fitAll = useCallback(() => {
    const pts = [
      ...locations.map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
      ...zones.map((z) => ({ latitude: z.latitude, longitude: z.longitude })),
    ];
    if (userPosition) {
      pts.push({ latitude: userPosition.lat, longitude: userPosition.lng });
    }
    const next = buildRegionFromPoints(pts, fallbackRegion);
    setRegion(next);
    mapRef.current?.animateToRegion(next, 500);
  }, [locations, zones, userPosition, fallbackRegion]);

  useEffect(() => {
    if (mapReady && (locations.length > 0 || userPosition)) {
      const t = setTimeout(fitAll, 300);
      return () => clearTimeout(t);
    }
  }, [mapReady, locations.length, userPosition?.lat, userPosition?.lng, fitAll]);

  const focusUser = useCallback((userId: string) => {
    const loc = locations.find((l) => l.user_id === userId);
    if (!loc) return;
    const next = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 500);
  }, [locations]);

  useEffect(() => {
    if (selectedUserId) focusUser(selectedUserId);
  }, [selectedUserId, focusUser]);

  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={mapProvider}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={Platform.OS === 'android'}
        showsCompass
        showsScale
        mapType="standard"
        loadingEnabled
        loadingIndicatorColor={accentColor}
        mapPadding={{ bottom: mapPaddingBottom, top: 12, left: 12, right: 12 }}
        onMapReady={() => {
          setMapReady(true);
          fitAll();
        }}
      >
        {zones.map((zone) => (
          <React.Fragment key={zone.id}>
            <Circle
              center={{ latitude: zone.latitude, longitude: zone.longitude }}
              radius={zone.radius_meters}
              fillColor={`${zone.color || accentColor}33`}
              strokeColor={zone.color || accentColor}
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: zone.latitude, longitude: zone.longitude }}
              tracksViewChanges={false}
            >
              <View style={[s.zoneMarker, { backgroundColor: zone.color || accentColor }]}>
                <Text style={{ fontSize: 14 }}>{ZONE_ICONS[zone.type] || '📍'}</Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}

        {locations.map((loc, idx) => {
          const isMe = loc.user_id === currentUserId;
          const color = isMe ? accentColor : MEMBER_COLORS[idx % MEMBER_COLORS.length];
          const selected = selectedUserId === loc.user_id;
          const label = isMe ? 'Eu' : (loc.users?.name?.split(' ')[0] || 'Membro');
          return (
            <Marker
              key={`${loc.user_id}-${idx}`}
              coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
              onPress={() => onSelectUser?.(loc.user_id)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[s.memberMarker, {
                backgroundColor: color,
                borderWidth: selected ? 3 : 2,
                borderColor: selected ? Colors.white : 'rgba(255,255,255,0.85)',
              }]}>
                <Text style={s.memberMarkerText}>{(loc.users?.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={s.memberLabel}>
                <Text style={s.memberLabelText} numberOfLines={1}>{label}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {!mapReady && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={s.loadingText}>A carregar mapa...</Text>
        </View>
      )}
    </View>
  );
}

export { MEMBER_COLORS, ZONE_ICONS };

const s = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 280,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  map: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  memberMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 6 },
    }),
  },
  memberMarkerText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  memberLabel: {
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'center',
    marginTop: 4,
  },
  memberLabelText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  zoneMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
});

export function formatLastSeen(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Agora';
  if (diff < 60) return `${diff} min atrás`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
  return `${Math.floor(diff / 1440)}d atrás`;
}
