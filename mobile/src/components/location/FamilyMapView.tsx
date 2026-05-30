import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { publicAssetUrl } from '../../lib/api';
import { Colors } from '../../theme';

export interface MapLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  updated_at?: string;
  users?: {
    name?: string;
    avatar_url?: string | null;
    avatar_preset?: string | null;
    display_color?: string;
  };
  device?: {
    device_type?: string;
  };
}

export interface MapZone {
  id: string;
  name?: string;
  type: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  color?: string;
  icon?: string;
}

export interface UserPosition {
  lat: number;
  lng: number;
}

const ZONE_ICONS: Record<string, string> = { home: '🏠', school: '🏫', work: '💼', other: '📍' };
const MEMBER_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

interface FamilyMapViewProps {
  locations: MapLocation[];
  zones?: MapZone[];
  selectedUserId?: string | null;
  currentUserId?: string;
  userPosition?: UserPosition | null;
  currentUser?: {
    name?: string | null;
    avatar_url?: string | null;
    avatar_preset?: string | null;
    display_color?: string;
  } | null;
  accentColor?: string;
  onSelectUser?: (userId: string) => void;
  mapPaddingBottom?: number;
  isDrawingMode?: boolean;
  onMapClick?: (latitude: number, longitude: number) => void;
  draftZone?: { latitude: number; longitude: number; radius_meters: number } | null;
}

const mapHtmlSource = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    body { padding: 0; margin: 0; background-color: #f8fafc; }
    html, body, #map { height: 100%; width: 100vw; }
    
    /* Estilos Premium de Marcadores de Membros */
    .location-marker-container {
      background: none !important;
      border: none !important;
    }
    .location-marker-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    .location-marker-avatar {
      width: 42px;
      height: 42px;
      border-radius: 21px;
      border-width: 3px;
      border-style: solid;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 4px 8px rgba(0,0,0,0.18);
      background-color: #ffffff;
      overflow: visible;
    }
    .location-marker-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }
    .location-marker-avatar span {
      font-size: 20px;
      line-height: 1;
    }
    .location-marker-device {
      position: absolute;
      bottom: -3px;
      right: -3px;
      font-size: 9px;
      background: #ffffff;
      border-radius: 50%;
      border: 1px solid #cbd5e1;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .location-marker-name {
      font-size: 10px;
      font-weight: 800;
      color: #1e293b;
      background: rgba(255,255,255,0.92);
      padding: 2px 6px;
      border-radius: 5px;
      border: 1px solid #e2e8f0;
      margin-top: 4px;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    /* Animações e Destaques */
    .location-marker-pulse {
      animation: pulse-scale 2s infinite;
    }
    @keyframes pulse-scale {
      0% { transform: scale(1); }
      50% { transform: scale(1.06); }
      100% { transform: scale(1); }
    }
    .location-marker-selected .location-marker-avatar {
      border-color: #4f46e5 !important;
      box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.25), 0 4px 8px rgba(0,0,0,0.2);
    }
    
    /* Estilos Premium de Zonas Seguras */
    .location-zone-tooltip {
      background: rgba(255, 255, 255, 0.94);
      border: 1.5px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      color: #1e293b;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-tooltip-pane { z-index: 500 !important; }
    .leaflet-bar { border: none !important; box-shadow: 0 2px 6px rgba(0,0,0,0.12) !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var PRESET_EMOJIS = {
      astronaut: '🚀', explorer: '🗺️', artist: '🎨', scientist: '🔬',
      athlete: '⚽', musician: '🎵', chef: '🍳', reader: '📚',
      gamer: '🎮', ninja: '🥷', princess: '👸', superhero: '🦸',
      parent_male: '👨', parent_female: '👩', robot: '🤖', dragon: '🐉',
    };

    var map = L.map('map', { zoomControl: false }).setView([-23.5505, -46.6333], 14);
    var hasCenteredOnGPS = false;
    var hasCenteredFallback = false;

    // Light theme clean tiles (CartoDB Positron)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '© OSM © CARTO'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    var markers = {};
    var circles = {};
    var isDrawingMode = false;

    // Clique no mapa para Drawing Mode
    map.on('click', function(e) {
      if (isDrawingMode) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'map_click',
          latitude: e.latlng.lat,
          longitude: e.latlng.lng
        }));
      }
    });

    window.addEventListener('message', function(event) {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'update') {
          isDrawingMode = !!data.isDrawingMode;
          document.getElementById('map').style.cursor = isDrawingMode ? 'crosshair' : '';

          // Limpar camadas anteriores
          Object.values(markers).forEach(m => map.removeLayer(m));
          Object.values(circles).forEach(c => map.removeLayer(c));
          markers = {};
          circles = {};

          const points = [];

          // 1) Renderizar Zonas Seguras
          data.zones.forEach(zone => {
            const color = zone.color || '#10B981';
            const c = L.circle([zone.latitude, zone.longitude], {
              radius: zone.radius_meters || 200,
              color: color,
              fillColor: color,
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '6 4'
            }).addTo(map);
            circles['zone-' + zone.id] = c;
            points.push([zone.latitude, zone.longitude]);

            c.bindTooltip('<span style="display:flex;align-items:center;gap:4px;">' + (zone.icon || '📍') + ' ' + zone.name + '</span>', {
              permanent: true,
              direction: 'center',
              className: 'location-zone-tooltip'
            }).openTooltip();
          });

          // 2) Renderizar Rascunho de Zona (Draft Zone)
          if (data.draftZone) {
            const dz = data.draftZone;
            const c = L.circle([dz.latitude, dz.longitude], {
              radius: dz.radius_meters,
              color: '#10B981',
              fillColor: '#10B981',
              fillOpacity: 0.18,
              weight: 3,
              dashArray: '4 4'
            }).addTo(map);
            circles['draft-zone'] = c;
            points.push([dz.latitude, dz.longitude]);

            c.bindTooltip('🛡️ Rascunho Zona (' + dz.radius_meters + 'm)', {
              permanent: true,
              direction: 'center',
              className: 'location-zone-tooltip'
            }).openTooltip();
          }

          // 3) Renderizar Membros da Família
          data.locations.forEach(loc => {
            const color = loc.color;
            const isMe = loc.user_id === data.currentUserId;
            const isSelected = data.selectedUserId === loc.user_id;

            // Se for o próprio usuário e houver GPS em tempo real, prioriza as coordenadas do GPS próprio
            let lat = loc.latitude;
            let lng = loc.longitude;
            if (isMe && data.userPosition) {
              lat = data.userPosition.latitude;
              lng = data.userPosition.longitude;
            }

            // Determinar o conteúdo visual do avatar
            let avatarHtml = '';
            if (loc.avatar_url) {
              avatarHtml = '<img src="' + loc.avatar_url + '" alt="" />';
            } else {
              const emoji = PRESET_EMOJIS[loc.avatar_preset] || loc.name[0].toUpperCase() || '👤';
              avatarHtml = '<span>' + emoji + '</span>';
            }

            const deviceIcon = loc.device_type === 'mobile' ? '📱' : loc.device_type === 'tablet' ? '💊' : '💻';

            const pulseClass = isSelected || isMe ? 'location-marker-pulse' : '';
            const selectedClass = isSelected ? 'location-marker-selected' : '';

            const html = 
              '<div class="location-marker-wrapper ' + pulseClass + ' ' + selectedClass + '">' +
                '<div class="location-marker-avatar" style="border-color:' + color + '; background-color:' + color + '15;">' +
                  avatarHtml +
                  '<div class="location-marker-device">' + deviceIcon + '</div>' +
                '</div>' +
                '<div class="location-marker-name">' + loc.name.split(' ')[0] + '</div>' +
              '</div>';
            
            const icon = L.divIcon({
              html: html,
              className: 'location-marker-container',
              iconSize: [56, 64],
              iconAnchor: [28, 54]
            });
            
            const m = L.marker([lat, lng], { icon: icon }).addTo(map);
            markers['user-' + loc.user_id] = m;
            points.push([lat, lng]);

            m.on('click', function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'click_user', userId: loc.user_id }));
            });
          });

          // 4) Posição do Usuário Local (GPS do aparelho) se disponível e não listado na lista de membros
          if (data.userPosition && !markers['user-' + data.currentUserId]) {
            const up = data.userPosition;
            const icon = L.divIcon({
              html: 
                '<div class="location-marker-wrapper location-marker-pulse">' +
                  '<div class="location-marker-avatar" style="border-color:#3B82F6; background-color:#3B82F615;">' +
                    '<span>📱</span>' +
                  '</div>' +
                  '<div class="location-marker-name">Meu Aparelho</div>' +
                '</div>',
              className: 'location-marker-container',
              iconSize: [56, 64],
              iconAnchor: [28, 54]
            });
            const m = L.marker([up.latitude, up.longitude], { icon: icon }).addTo(map);
            markers['user-device'] = m;
            points.push([up.latitude, up.longitude]);
          }

          // Centralizar mapa de forma inteligente na primeira inicialização bem-sucedida
          if (!hasCenteredOnGPS) {
            if (data.userPosition) {
              map.setView([data.userPosition.latitude, data.userPosition.longitude], 15);
              hasCenteredOnGPS = true;
            } else if (!hasCenteredFallback && points.length > 0) {
              map.fitBounds(points, { padding: [45, 45] });
              hasCenteredFallback = true;
            }
          }
          
          // Se for solicitado autoFit explícito (pelo React Native)
          if (data.autoFit && points.length > 0) {
            map.fitBounds(points, { padding: [45, 45] });
          }
        } else if (data.type === 'center') {
          map.setView([data.latitude, data.longitude], 16, { animate: true });
        }
      } catch (err) {
        console.error('Erro na WebView do Mapa:', err);
      }
    });
  </script>
</body>
</html>
`;

export function FamilyMapView({
  locations,
  zones = [],
  selectedUserId,
  currentUserId,
  userPosition,
  currentUser = null,
  accentColor = Colors.primary,
  onSelectUser,
  mapPaddingBottom = 90,
  isDrawingMode = false,
  onMapClick,
  draftZone = null,
}: FamilyMapViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);

  const serializedLocations = useMemo(() => {
    const list = locations.map((loc, idx) => {
      const isMe = loc.user_id === currentUserId;
      
      const name = isMe && currentUser?.name ? currentUser.name : (loc.users?.name || 'Membro');
      const avatar_url = isMe && currentUser?.avatar_url !== undefined
        ? currentUser.avatar_url
        : (loc.users?.avatar_url || null);
      const avatar_preset = isMe && currentUser?.avatar_preset !== undefined
        ? currentUser.avatar_preset
        : (loc.users?.avatar_preset || null);
      
      const color = isMe && currentUser?.display_color
        ? currentUser.display_color
        : (loc.users?.display_color || (isMe ? accentColor : MEMBER_COLORS[idx % MEMBER_COLORS.length]));

      // Se for o próprio usuário, prioriza o GPS do aparelho em tempo real
      const latitude = isMe && userPosition ? userPosition.lat : loc.latitude;
      const longitude = isMe && userPosition ? userPosition.lng : loc.longitude;

      return {
        user_id: loc.user_id,
        latitude,
        longitude,
        name,
        avatar_url: avatar_url ? publicAssetUrl(avatar_url) : null,
        avatar_preset,
        device_type: loc.device?.device_type || 'mobile',
        color,
      };
    });

    // Se o próprio usuário não estiver na lista de locations vinda do banco, mas temos seu GPS, adiciona-o manualmente
    const hasMe = list.some((l) => l.user_id === currentUserId);
    if (!hasMe && currentUserId && userPosition && currentUser) {
      list.push({
        user_id: currentUserId,
        latitude: userPosition.lat,
        longitude: userPosition.lng,
        name: currentUser.name || 'Eu',
        avatar_url: currentUser.avatar_url ? publicAssetUrl(currentUser.avatar_url) : null,
        avatar_preset: currentUser.avatar_preset || null,
        device_type: 'mobile',
        color: currentUser.display_color || accentColor,
      });
    }

    return list;
  }, [locations, currentUserId, accentColor, currentUser, userPosition]);

  const serializedZones = useMemo(() => {
    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      type: z.type,
      latitude: z.latitude,
      longitude: z.longitude,
      radius_meters: z.radius_meters,
      color: z.color || ZONE_COLORS[z.type] || accentColor,
      icon: z.icon || ZONE_ICONS[z.type] || '📍',
    }));
  }, [zones, accentColor]);

  const sendMapData = useCallback((autoFit = false) => {
    if (!webViewRef.current || !mapReady) return;
    const payload = {
      type: 'update',
      locations: serializedLocations,
      zones: serializedZones,
      userPosition: userPosition ? { latitude: userPosition.lat, longitude: userPosition.lng } : null,
      currentUserId,
      selectedUserId,
      isDrawingMode,
      draftZone,
      autoFit,
    };
    webViewRef.current.postMessage(JSON.stringify(payload));
  }, [serializedLocations, serializedZones, userPosition, currentUserId, selectedUserId, isDrawingMode, draftZone, mapReady]);

  // Enviar dados sempre que a WebView carregar ou propriedades mudarem
  useEffect(() => {
    if (mapReady) {
      sendMapData(false);
    }
  }, [mapReady, serializedLocations, serializedZones, userPosition, selectedUserId, isDrawingMode, draftZone, sendMapData]);

  // Auto-ajuste de câmera na primeira inicialização com dados
  const [hasAutofitted, setHasAutofitted] = useState(false);
  useEffect(() => {
    if (mapReady && !hasAutofitted && (serializedLocations.length > 0 || userPosition)) {
      sendMapData(true);
      setHasAutofitted(true);
    }
  }, [mapReady, hasAutofitted, serializedLocations.length, userPosition, sendMapData]);

  // Focar no usuário selecionado dinamicamente
  useEffect(() => {
    if (selectedUserId && webViewRef.current && mapReady) {
      const loc = serializedLocations.find((l) => l.user_id === selectedUserId);
      if (loc) {
        webViewRef.current.postMessage(JSON.stringify({
          type: 'center',
          latitude: loc.latitude,
          longitude: loc.longitude,
        }));
      }
    }
  }, [selectedUserId, serializedLocations, mapReady]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'click_user' && onSelectUser) {
        onSelectUser(data.userId);
      } else if (data.type === 'map_click' && onMapClick) {
        onMapClick(data.latitude, data.longitude);
      }
    } catch (e) {
      console.warn('[FamilyMapView] Erro ao decodificar mensagem da WebView:', e);
    }
  };

  return (
    <View style={s.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHtmlSource }}
        style={[s.map, { marginBottom: mapPaddingBottom }]}
        onLoadEnd={() => setMapReady(true)}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
      />

      {!mapReady && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={s.loadingText}>A carregar mapa...</Text>
        </View>
      )}
    </View>
  );
}

const ZONE_COLORS: Record<string, string> = { home: '#10B981', school: '#3B82F6', work: '#F97316', other: '#8B5CF6' };
export { MEMBER_COLORS, ZONE_ICONS, ZONE_COLORS };

const s = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 280,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});

export function formatLastSeen(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Agora';
  if (diff < 60) return `${diff} min atrás`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
  return `${Math.floor(diff / 1440)}d atrás`;
}
