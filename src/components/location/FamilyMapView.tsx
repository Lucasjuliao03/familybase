import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { publicAssetUrl } from '../../lib/api';
import { leafletCss, leafletJs } from '../../lib/leafletAssets.generated';
import { AVATAR_DATA_URIS } from '../../lib/avatarDataUris.generated';
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
  <style>${leafletCss}</style>
  <script>${leafletJs}</script>
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
    function startMap() {
    try {
    var PRESET_EMOJIS = {
      astronaut: '🚀', explorer: '🗺️', artist: '🎨', scientist: '🔬',
      athlete: '⚽', musician: '🎵', chef: '🍳', reader: '📚',
      gamer: '🎮', ninja: '🥷', princess: '👸', superhero: '🦸',
      parent_male: '👨', parent_female: '👩', robot: '🤖', dragon: '🐉',
    };

    var map = L.map('map', { zoomControl: false }).setView([-23.5505, -46.6333], 14);
    var hasCenteredOnGPS = false;
    var hasCenteredFallback = false;

    // Raster tiles keep the map usable on Android WebViews without WebGL or workers.
    // Leaflet requests only tiles within the visible viewport and uses the WebView cache.
    var tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 1
    }).addTo(map);
    var firstTileLoaded = false;
    tileLayer.on('tileload', function() {
      if (firstTileLoaded) return;
      firstTileLoaded = true;
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'tile_loaded'}));
    });
    setTimeout(function() { map.invalidateSize(); }, 250);
    function escapeHtml(value) {
      return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

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

    function handleMapMessage(event) {
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
            if (!Number.isFinite(Number(zone.latitude)) || !Number.isFinite(Number(zone.longitude))) return;
            const color = /^#[0-9a-f]{6}$/i.test(zone.color) ? zone.color : '#10B981';
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

            c.bindTooltip('<span style="display:flex;align-items:center;gap:4px;">' + escapeHtml(zone.icon || '📍') + ' ' + escapeHtml(zone.name) + '</span>', {
              permanent: true,
              direction: 'center',
              className: 'location-zone-tooltip'
            }).openTooltip();
          });

          // 2) Renderizar Rascunho de Zona (Draft Zone)
          if (data.draftZone && Number.isFinite(Number(data.draftZone.latitude)) && Number.isFinite(Number(data.draftZone.longitude))) {
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
            if (!Number.isFinite(Number(loc.latitude)) || !Number.isFinite(Number(loc.longitude))) return;
            const color = /^#[0-9a-f]{6}$/i.test(loc.color) ? loc.color : '#4f46e5';
            const isMe = loc.user_id === data.currentUserId;
            const isSelected = data.selectedUserId === loc.user_id;

            // Se for o próprio usuário e houver GPS em tempo real, prioriza as coordenadas do GPS próprio
            let lat = loc.latitude;
            let lng = loc.longitude;
            if (isMe && data.userPosition && Number.isFinite(Number(data.userPosition.latitude)) && Number.isFinite(Number(data.userPosition.longitude))) {
              lat = data.userPosition.latitude;
              lng = data.userPosition.longitude;
            }

            // Determinar o conteúdo visual do avatar
            let avatarHtml = '';
            if (loc.avatar_url && String(loc.avatar_url).startsWith('https://')) {
              avatarHtml = '<img src="' + escapeHtml(loc.avatar_url) + '" alt="" />';
            } else if (loc.avatar_data_uri) {
              avatarHtml = '<img src="' + loc.avatar_data_uri + '" alt="" />';
            } else {
              const emoji = PRESET_EMOJIS[loc.avatar_preset] || (loc.name || '👤').charAt(0).toUpperCase();
              avatarHtml = '<span>' + escapeHtml(emoji) + '</span>';
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
                '<div class="location-marker-name">' + escapeHtml(loc.name || 'Membro') + '</div>' +
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

            const seen = loc.updated_at ? new Date(loc.updated_at) : null;
            const seenLabel = seen && !isNaN(seen.getTime())
              ? seen.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
              : 'Sem horário registrado';
            m.bindPopup('<strong>' + escapeHtml(loc.name || 'Membro') + '</strong><br>Última posição: ' + escapeHtml(seenLabel));

            m.on('click', function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'click_user', userId: loc.user_id }));
            });
          });

          // 4) Posição do Usuário Local (GPS do aparelho) se disponível e não listado na lista de membros
          if (data.userPosition && Number.isFinite(Number(data.userPosition.latitude)) && Number.isFinite(Number(data.userPosition.longitude)) && !markers['user-' + data.currentUserId]) {
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
              if (points.length === 1) map.setView(points[0], 15);
              else map.fitBounds(points, { padding: [45, 45], maxZoom: 16 });
              hasCenteredFallback = true;
            }
          }
          
          // Se for solicitado autoFit explícito (pelo React Native)
          if (data.autoFit && points.length > 0) {
            if (points.length === 1) map.setView(points[0], 15);
            else map.fitBounds(points, { padding: [45, 45], maxZoom: 16 });
          }
        } else if (data.type === 'center') {
          map.setView([data.latitude, data.longitude], 16, { animate: true });
        }
      } catch (err) {
        console.error('Erro na WebView do Mapa:', err);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map_error', message: String(err) }));
      }
    }
    window.addEventListener('message', handleMapMessage);
    document.addEventListener('message', handleMapMessage);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
    } catch (error) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map_error', message: String(error) }));
    }
    }
    startMap();
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
  const [mapError, setMapError] = useState<'load' | 'tiles' | null>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (mapReady) return;
    const timer = setTimeout(() => setMapError('load'), 12000);
    return () => clearTimeout(timer);
  }, [mapReady, reloadKey]);

  useEffect(() => {
    if (!mapReady || tilesLoaded) return;
    const timer = setTimeout(() => setMapError('tiles'), 20000);
    return () => clearTimeout(timer);
  }, [mapReady, tilesLoaded, reloadKey]);

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
        avatar_data_uri: avatar_preset ? AVATAR_DATA_URIS[avatar_preset] || null : null,
        updated_at: loc.updated_at || null,
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
        avatar_data_uri: currentUser.avatar_preset ? AVATAR_DATA_URIS[currentUser.avatar_preset] || null : null,
        updated_at: new Date().toISOString(),
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
      if (data.type === 'ready') { setMapReady(true); setMapError(null); }
      else if (data.type === 'tile_loaded') { setTilesLoaded(true); setMapError(null); }
      else if (data.type === 'map_error') { console.warn('[FamilyMapView]', data.message); setMapError('load'); }
      else if (data.type === 'click_user' && onSelectUser) {
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
        key={reloadKey}
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHtmlSource, baseUrl: 'https://www.openstreetmap.org/' }}
        applicationNameForUserAgent="TudoDeFamilia/1.0.7 (com.familybase.mobile)"
        cacheEnabled
        style={[s.map, { marginBottom: mapPaddingBottom }]}
        onError={() => setMapError('load')}
        onRenderProcessGone={() => { setMapReady(false); setMapError('load'); }}
        onContentProcessDidTerminate={() => { setMapReady(false); setMapError('load'); }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="never"
      />

      {(!mapReady || mapError === 'load') && (
        <View style={s.loadingOverlay}>
          {!mapError && <ActivityIndicator size="large" color={accentColor} />}
          <Text style={s.loadingText}>{mapError ? 'Não foi possível iniciar o mapa.' : 'Carregando mapa...'}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setMapReady(false); setMapError(null); setTilesLoaded(false); setHasAutofitted(false); setReloadKey(k => k + 1); }} style={{ padding: 16 }}><Text style={{ color: accentColor, fontWeight: '700' }}>Recarregar mapa</Text></TouchableOpacity>
        </View>
      )}
      {mapReady && mapError === 'tiles' && !tilesLoaded && (
        <View style={s.tileNotice}>
          <Text style={s.loadingText}>Sem imagens do mapa. Verifique a internet.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setMapReady(false); setMapError(null); setTilesLoaded(false); setHasAutofitted(false); setReloadKey(k => k + 1); }}><Text style={{ color: accentColor, fontWeight: '700' }}>Tentar novamente</Text></TouchableOpacity>
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
  tileNotice: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
});

export function formatLastSeen(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Agora';
  if (diff < 60) return `${diff} min atrás`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
  return `${Math.floor(diff / 1440)}d atrás`;
}
