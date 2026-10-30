import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useGeolocation } from '../hooks/useGeolocation';
import { useFamilyLocations } from '../hooks/useFamilyLocations';
import FamilyMap from '../components/location/FamilyMap';
import MemberListCard from '../components/location/MemberListCard';
import LocationAlertToast from '../components/location/LocationAlertToast';
import DeviceManagerModal from '../components/location/DeviceManagerModal';
import { getDeviceId } from '../lib/device';
import { useToast } from '../contexts/ToastContext';

const ZONE_TYPE_ICONS = { home: '🏠', school: '🏫', work: '💼', other: '📍' };
const ZONE_TYPE_COLORS = { home: '#10B981', school: '#3B82F6', work: '#F97316', other: '#8B5CF6' };

function haversineMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lat2) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function FamilyLocationPage() {
  const { user, family } = useAuth();
  const familyId = family?.id || user?.family_id;
  const userId = user?.id;
  const userRole = user?.role;
  const toast = useToast();

  // Geolocalização própria
  const { position, error: geoError, permissionDenied, refreshing, forceRefresh } = useGeolocation({
    familyId,
    userId,
    enabled: !!familyId && !!userId,
  });

  // Handler para forçar atualização do próprio GPS
  const handleForceMyLocation=useCallback(async()=>{
    try{const {error}=await supabase.rpc('request_family_location_refresh',{p_target_user_id:null});if(error)throw error;void forceRefresh().catch(()=>{});toast.info('Atualização solicitada à família. Aguardando novas capturas.');}
    catch(e){toast.error(e.message||'Não foi possível solicitar a atualização.');}
  },[forceRefresh,toast]);

  // Localizações da família em tempo real
  const { locations: locMap, loading: locsLoading } = useFamilyLocations({
    familyId,
    enabled: !!familyId,
  });

  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [isFollowingMember, setIsFollowingMember] = useState(false);
  const [centerTrigger, setCenterTrigger] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', type: 'home', radius_meters: 200, latitude: null, longitude: null });
  const [savingZone, setSavingZone] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('all'); // 'all', 'mobile', 'current'
  const [showDeviceManager, setShowDeviceManager] = useState(false);

  // Load zones
  useEffect(() => {
    if (!familyId) return;
    (async () => {
      setZonesLoading(true);
      try {
        const { data } = await supabase
          .from('safe_zones')
          .select('*')
          .eq('family_id', familyId)
          .eq('is_active', true)
          .order('created_at');
        setZones(data || []);
      } catch {
        // Falha ao carregar zonas mantém a lista anterior.
      }
      setZonesLoading(false);
    })();
    
    // Pedir permissão de notificação nativa
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [familyId]);

  // Função helper para disparar push notification
  const firePushNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/vite.svg' });
      } catch (e) {
        console.error('Push notification falhou', e);
      }
    }
  };

  // The server is the single authority for transitions and manager exclusions.
  useEffect(()=>{
    if(!familyId||!userId)return;
    let active=true;const seen=new Set(),since=new Date().toISOString();
    const show=row=>{if(!active||seen.has(row.id)||!['zone_enter','zone_exit'].includes(row.type))return;seen.add(row.id);
      setAlerts(old=>[...old,{id:row.id,type:row.type==='zone_enter'?'enter':'exit',userName:row.data?.member_name||row.data?.child_name||'Integrante',zoneName:row.data?.zone_name||'Local',occurredAt:row.data?.occurred_at}]);
      firePushNotification(row.title,row.message);
    };
    const check=async()=>{const {data}=await supabase.from('notifications').select('id,title,message,type,data').eq('family_id',familyId).eq('user_id',userId).gt('created_at',since).in('type',['zone_enter','zone_exit']).order('created_at').limit(30);(data||[]).forEach(show);};
    const channel=supabase.channel('web-zone-alerts-'+userId+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+userId},payload=>show(payload.new)).subscribe();
    const timer=setInterval(()=>void check(),30_000);
    return()=>{active=false;clearInterval(timer);void supabase.removeChannel(channel);};
  },[familyId,userId]);

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Create safe zone
  const handleCreateZone = async () => {
    if (!zoneForm.name.trim() || !zoneForm.latitude || !zoneForm.longitude) return;
    setSavingZone(true);
    try {
      const { data, error } = await supabase.from('safe_zones').insert({
        family_id: familyId,
        name: zoneForm.name.trim(),
        type: zoneForm.type,
        icon: ZONE_TYPE_ICONS[zoneForm.type],
        latitude: zoneForm.latitude,
        longitude: zoneForm.longitude,
        radius_meters: Number(zoneForm.radius_meters) || 200,
        color: ZONE_TYPE_COLORS[zoneForm.type],
        created_by: userId,
      }).select().single();
      if (error) throw error;
      setZones((prev) => [...prev, data]);
      setShowZoneModal(false);
      setZoneForm({ name: '', type: 'home', radius_meters: 200, latitude: null, longitude: null });
    } catch (e) {
      console.error('[location] create zone:', e);
    }
    setSavingZone(false);
  };

  const handleMapClick = useCallback((latlng) => {
    if (isDrawingMode) {
      setZoneForm(prev => ({ ...prev, latitude: latlng.lat, longitude: latlng.lng }));
      setIsDrawingMode(false);
      setShowZoneModal(true);
    }
  }, [isDrawingMode]);

  const deleteZone = async (zoneId) => {
    await supabase.from('safe_zones').delete().eq('id', zoneId).eq('family_id', familyId);
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
  };

  // Convert Map to array and apply visibility and device rules
  const locArray = Array.from(locMap.values()).filter((loc) => {
    // Gestores and Master can see everyone
    let isVisible;
    if (userRole === 'parent' || userRole === 'master') isVisible = true;
    else if (loc.user_id === userId) isVisible = true;
    else isVisible = loc.share_with_children !== false;

    if (!isVisible) return false;

    const devId = getDeviceId();
    if (deviceFilter === 'mobile') {
      return loc.device?.device_type === 'mobile';
    }
    if (deviceFilter === 'current') {
      return loc.device_id === devId;
    }
    return true; // 'all'
  }).map((loc) => {
    // Computar status dinâmico com base nas zonas e velocidade
    let computed_status = 'stopped';
    let computed_zone_name = null;
    
    if (loc.speed > 1.5) {
      computed_status = 'moving';
    } else {
      // Procurar se está dentro de alguma zona
      for (const zone of zones) {
        const dist = haversineMeters(loc.latitude, loc.longitude, zone.latitude, zone.longitude);
        if (dist <= (zone.radius_meters || 200)) {
          computed_status = zone.type;
          computed_zone_name = zone.name;
          break;
        }
      }
    }
    
    return { ...loc, computed_status, computed_zone_name };
  });

  const isLoading = locsLoading && zonesLoading;
  const canManageZones = userRole === 'parent' || userRole === 'master';
  const currentDeviceId = getDeviceId();

  const myLocation = Array.from(locMap.values()).find(l=>l.user_id===userId&&l.device_id===currentDeviceId) || Array.from(locMap.values()).find(l => l.user_id === userId);
  const isSharingWithChildren = myLocation?.share_with_children ?? true;

  const toggleShareWithChildren = async () => {
    if (!myLocation || togglingVisibility) return;
    setTogglingVisibility(true);
    try {
      const newStatus = !isSharingWithChildren;
      await supabase
        .from('family_locations')
        .update({ share_with_children: newStatus })
        .eq('user_id', userId);
    } catch (e) {
      console.error('[location] toggle visibility:', e);
    }
    setTogglingVisibility(false);
  };

  const handleSelectMember = useCallback((targetUserId) => {
    setSelectedMemberId(targetUserId);
    setIsFollowingMember(true);
    setCenterTrigger(prev => prev + 1);

    // Se clicou em si mesmo, forçar atualização GPS local imediatamente
    if (targetUserId === userId) {
      forceRefresh()
        .then(() => toast.success('📍 Sua localização foi atualizada!'))
        .catch((e) => {
          if (e?.code === 1) toast.error('Permissão de localização negada.');
          else toast.error('Não foi possível obter sua localização agora.');
        });
      return;
    }

    if (!familyId || !targetUserId) return;

    // Obter o nome e última atualização do alvo
    const loc = Array.from(locMap.values()).find(l => l.user_id === targetUserId);
    const targetName = loc?.users?.name?.split(' ')[0] || 'membro';
    const lastUpdatedAt = loc?.updated_at ? new Date(loc.updated_at) : null;
    const minutesSinceUpdate = lastUpdatedAt
      ? Math.floor((Date.now() - lastUpdatedAt.getTime()) / 60000)
      : null;

    // Se a última atualização for muito recente (< 2min), já é suficientemente fresca
    if (minutesSinceUpdate !== null && minutesSinceUpdate < 2) {
      toast.info(`📍 ${targetName} — localização atualizada há ${minutesSinceUpdate < 1 ? 'menos de 1 min' : `${minutesSinceUpdate} min`}`);
      return;
    }

    void supabase.rpc('request_family_location_refresh',{p_target_user_id:targetUserId}).then(({error})=>{if(error)toast.error(error.message);else toast.info('Atualização solicitada. Aguardando o aparelho.');});

  }, [familyId, locMap, toast, userId, forceRefresh]);

  return (
    <div className="location-page">
      {/* Loading overlay */}
      {isLoading && (
        <div className="location-loading">
          <div className="location-loading-spinner" />
          <p>A carregar localizações…</p>
        </div>
      )}

      {/* Alerts */}
      <LocationAlertToast alerts={alerts} onDismiss={dismissAlert} />

      {/* Permission denied banner */}
      {permissionDenied && (
        <div className="location-permission-banner">
          <span>📍</span>
          <div>
            <strong>Localização desativada</strong>
            <p>Ative a localização nas definições do browser para partilhar a sua posição.</p>
          </div>
        </div>
      )}

      {/* Geo error banner (not permission) */}
      {geoError && !permissionDenied && (
        <div className="location-error-banner">
          <span>⚠️</span>
          <span>{geoError}</span>
        </div>
      )}

      {/* Map */}
      <FamilyMap
        locations={locArray}
        zones={zones}
        selectedMemberId={selectedMemberId}
        isFollowingMember={isFollowingMember}
        centerTrigger={centerTrigger}
        onUserInteraction={useCallback(() => setIsFollowingMember(false), [])}
        onSelectMember={handleSelectMember}
        currentUserId={userId}
        zoneDraft={showZoneModal && zoneForm.latitude ? zoneForm : (isDrawingMode ? { latitude: position?.lat || 0, longitude: position?.lng || 0, radius_meters: 0 } : null)}
        onMapClick={handleMapClick}
      />

      {/* Floating map controls */}
      <div className="location-floating-controls">
        {selectedMemberId && !isFollowingMember && (
          <button
            className="location-btn-icon"
            onClick={() => {
              setIsFollowingMember(true);
              setCenterTrigger(prev => prev + 1);
            }}
            title="Centralizar no Membro"
            style={{ width: '44px', height: '44px', borderRadius: '50%', padding: 0 }}
          >
            🎯
          </button>
        )}
        <button
          className="location-btn-icon"
          onClick={() => {
            setSelectedMemberId(null);
            setIsFollowingMember(false);
            setCenterTrigger(prev => prev + 1);
          }}
          title="Ver Todos"
          style={{ width: '44px', height: '44px', borderRadius: '50%', padding: 0 }}
        >
          🌐
        </button>
      </div>

      {/* Drawing Mode Banner */}
      {isDrawingMode && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 30, zIndex: 1000, fontWeight: 600, boxShadow: 'var(--shadow-lg)',
          pointerEvents: 'none'
        }}>
          🎯 Clique no mapa para definir o centro da zona
        </div>
      )}

      {/* Top bar overlay — compact mobile-first */}
      <div className="location-top-bar">
        {/* Row 1: Title + action buttons */}
        <div className="location-top-row">
          <h1 className="location-top-title">📍 Localização</h1>
          <div className="location-top-actions">
            {/* Botão forçar GPS próprio */}
            <button
              className="location-btn-icon"
              onClick={handleForceMyLocation}
              disabled={refreshing}
              title="Solicitar localização atual de todos os integrantes"
              style={{ position: 'relative' }}
            >
              {refreshing ? (
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
              ) : '🔄'}
            </button>
            <select
              className="location-filter-select"
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="mobile">Celulares</option>
              <option value="current">Este aparelho</option>
            </select>
            {canManageZones && (
              <button
                className="location-btn-icon"
                onClick={toggleShareWithChildren}
                disabled={togglingVisibility}
                title={isSharingWithChildren ? 'Visível para filhos' : 'Oculto para filhos'}
              >
                {isSharingWithChildren ? '👁️' : '🙈'}
              </button>
            )}
            {canManageZones && (
              <button
                className="location-btn-icon"
                onClick={() => setShowDeviceManager(true)}
                title="Gerir Dispositivos"
              >
                ⚙️
              </button>
            )}
            {canManageZones && (
              <button
                className="location-btn-icon location-btn-add"
                onClick={() => setIsDrawingMode(true)}
                title="Adicionar Zona Segura"
              >
                + Zona
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Member list card */}
      <MemberListCard
        locations={locArray}
        selectedMemberId={selectedMemberId}
        onSelectMember={handleSelectMember}
        currentPosition={position}
        currentUserId={userId}
      />

      {/* Zones list (collapsible) */}
      {zones.length > 0 && (
        <div className="location-zones-chip-bar">
          {zones.map((z) => (
            <button
              key={z.id}
              className="location-zone-chip"
              onClick={() => {
                setSelectedMemberId(null);
                setIsFollowingMember(false);
              }}
            >
              {z.icon || ZONE_TYPE_ICONS[z.type]} {z.name}
              {canManageZones && (
                <span
                  className="location-zone-chip-delete"
                  onClick={(e) => { e.stopPropagation(); deleteZone(z.id); }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Create Zone Modal — renderizado no document.body via portal para ficar acima de tudo */}
      {showZoneModal && createPortal(
        <div className="location-modal-overlay" onClick={() => setShowZoneModal(false)}>
          <div className="location-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🛡️ Nova Zona Segura</h2>
              <button className="modal-close" onClick={() => setShowZoneModal(false)}>×</button>
            </div>

            {!zoneForm.latitude ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-icon">📍</div>
                <h3>Ponto inválido</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  Por favor, cancele e clique no mapa para criar a zona.
                </p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Nome da zona</label>
                  <input
                    className="form-input"
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Casa, Escola do Pedro…"
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <div className="location-zone-type-grid">
                    {Object.entries(ZONE_TYPE_ICONS).map(([type, icon]) => (
                      <button
                        key={type}
                        className={`location-zone-type-btn ${zoneForm.type === type ? 'active' : ''}`}
                        onClick={() => setZoneForm((f) => ({ ...f, type }))}
                        type="button"
                      >
                        <span>{icon}</span>
                        <span>{{home:'Casa',school:'Escola',work:'Trabalho',other:'Outro'}[type]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Raio (metros)</label>
                  <input
                    className="form-input"
                    type="range"
                    min={50}
                    max={2000}
                    step={50}
                    value={zoneForm.radius_meters}
                    onChange={(e) => setZoneForm((f) => ({ ...f, radius_meters: Number(e.target.value) }))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>50m</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{zoneForm.radius_meters}m</span>
                    <span>2000m</span>
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => { setShowZoneModal(false); setIsDrawingMode(false); }}>Cancelar</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateZone}
                    disabled={!zoneForm.name.trim() || savingZone}
                  >
                    {savingZone ? 'Salvando…' : '🛡️ Criar Zona'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* DeviceManagerModal já usa portal internamente */}
      {showDeviceManager && (
        <DeviceManagerModal
          familyId={familyId}
          onClose={() => setShowDeviceManager(false)}
        />
      )}
    </div>
  );
}
