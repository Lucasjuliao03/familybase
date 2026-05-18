import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useGeolocation } from '../hooks/useGeolocation';
import { useFamilyLocations } from '../hooks/useFamilyLocations';
import FamilyMap from '../components/location/FamilyMap';
import MemberListCard from '../components/location/MemberListCard';
import LocationAlertToast from '../components/location/LocationAlertToast';

const ZONE_TYPE_ICONS = { home: '🏠', school: '🏫', work: '💼', other: '📍' };
const ZONE_TYPE_COLORS = { home: '#10B981', school: '#3B82F6', work: '#F97316', other: '#8B5CF6' };

/**
 * Calcula se um ponto está dentro de uma zona (Haversine < raio).
 */
function isInsideZone(lat, lng, zone) {
  if (!lat || !lng || !zone.latitude || !zone.longitude) return false;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(zone.latitude - lat);
  const dLon = toRad(zone.longitude - lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(zone.latitude)) * Math.sin(dLon / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return dist <= (zone.radius_meters || 200);
}

export default function FamilyLocationPage() {
  const { user, family } = useAuth();
  const familyId = family?.id || user?.family_id;
  const userId = user?.id;
  const userRole = user?.role;

  // Geolocalização própria
  const { position, error: geoError, permissionDenied } = useGeolocation({
    familyId,
    userId,
    enabled: !!familyId && !!userId,
  });

  // Localizações da família em tempo real
  const { locations: locMap, loading: locsLoading } = useFamilyLocations({
    familyId,
    enabled: !!familyId,
  });

  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', type: 'home', radius_meters: 200 });
  const [savingZone, setSavingZone] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Track zone occupancy para detectar enter/exit
  const zoneOccupancyRef = useRef(new Map());
  const alertIdRef = useRef(0);

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
      } catch (_) {}
      setZonesLoading(false);
    })();
  }, [familyId]);

  // Detectar entrada/saída de zonas
  useEffect(() => {
    if (!zones.length || locMap.size === 0) return;

    locMap.forEach((loc) => {
      const uid = loc.user_id;
      const userName = loc.users?.name?.split(' ')[0] || 'Membro';

      zones.forEach((zone) => {
        const inside = isInsideZone(loc.latitude, loc.longitude, zone);
        const key = `${uid}:${zone.id}`;
        const wasInside = zoneOccupancyRef.current.get(key);

        if (wasInside === undefined) {
          // First check — just record state, don't alert
          zoneOccupancyRef.current.set(key, inside);
          return;
        }

        if (inside && !wasInside) {
          // ENTERED zone
          zoneOccupancyRef.current.set(key, true);
          const id = ++alertIdRef.current;
          setAlerts((prev) => [...prev, {
            id,
            type: 'enter',
            userName,
            zoneName: zone.name,
            zoneIcon: zone.icon || ZONE_TYPE_ICONS[zone.type],
          }]);

          // Log event
          supabase.from('location_events').insert({
            family_id: familyId,
            user_id: uid,
            zone_id: zone.id,
            event_type: 'enter',
            latitude: loc.latitude,
            longitude: loc.longitude,
          }).then(() => {});

          // Auto-update status
          if (zone.type === 'home' || zone.type === 'school' || zone.type === 'work') {
            supabase.from('family_locations')
              .update({ status: zone.type })
              .eq('family_id', familyId)
              .eq('user_id', uid)
              .then(() => {});
          }
        } else if (!inside && wasInside) {
          // EXITED zone
          zoneOccupancyRef.current.set(key, false);
          const id = ++alertIdRef.current;
          setAlerts((prev) => [...prev, {
            id,
            type: 'exit',
            userName,
            zoneName: zone.name,
            zoneIcon: zone.icon || ZONE_TYPE_ICONS[zone.type],
          }]);

          supabase.from('location_events').insert({
            family_id: familyId,
            user_id: uid,
            zone_id: zone.id,
            event_type: 'exit',
            latitude: loc.latitude,
            longitude: loc.longitude,
          }).then(() => {});
        }
      });
    });
  }, [locMap, zones, familyId]);

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Create safe zone
  const handleCreateZone = async () => {
    if (!zoneForm.name.trim() || !position) return;
    setSavingZone(true);
    try {
      const { data, error } = await supabase.from('safe_zones').insert({
        family_id: familyId,
        name: zoneForm.name.trim(),
        type: zoneForm.type,
        icon: ZONE_TYPE_ICONS[zoneForm.type],
        latitude: position.lat,
        longitude: position.lng,
        radius_meters: Number(zoneForm.radius_meters) || 200,
        color: ZONE_TYPE_COLORS[zoneForm.type],
        created_by: userId,
      }).select().single();
      if (error) throw error;
      setZones((prev) => [...prev, data]);
      setShowZoneModal(false);
      setZoneForm({ name: '', type: 'home', radius_meters: 200 });
    } catch (e) {
      console.error('[location] create zone:', e);
    }
    setSavingZone(false);
  };

  const deleteZone = async (zoneId) => {
    await supabase.from('safe_zones').delete().eq('id', zoneId).eq('family_id', familyId);
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
  };

  // Convert Map to array and apply visibility rules
  const locArray = Array.from(locMap.values()).filter((loc) => {
    // Gestores and Master can see everyone
    if (userRole === 'parent' || userRole === 'master') return true;
    
    // Children and relatives can always see their own location
    if (loc.user_id === userId) return true;
    
    // Other users are only visible if they share their location with children
    return loc.share_with_children !== false;
  });

  const isLoading = locsLoading && zonesLoading;
  const canManageZones = userRole === 'parent' || userRole === 'master';

  const myLocation = locMap.get(userId);
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
        onSelectMember={setSelectedMemberId}
        currentUserId={userId}
      />

      {/* Top bar overlay */}
      <div className="location-top-bar">
        <h1 className="location-top-title">📍 Localização</h1>
        <div className="location-top-actions" style={{ display: 'flex', gap: 8 }}>
          {canManageZones && (
            <button
              className="location-btn-zone"
              onClick={toggleShareWithChildren}
              disabled={togglingVisibility}
              title="Alternar visibilidade para os filhos"
              style={{ padding: '8px 12px' }}
            >
              {isSharingWithChildren ? '👁️ Visível' : '🙈 Oculto'}
            </button>
          )}
          {canManageZones && (
            <button
              className="location-btn-zone"
              onClick={() => setShowZoneModal(true)}
              title="Adicionar zona segura"
            >
              ＋ Zona
            </button>
          )}
        </div>
      </div>

      {/* Member list card */}
      <MemberListCard
        locations={locArray}
        selectedMemberId={selectedMemberId}
        onSelectMember={setSelectedMemberId}
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

      {/* Create Zone Modal */}
      {showZoneModal && (
        <div className="modal-overlay" onClick={() => setShowZoneModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">🛡️ Nova Zona Segura</h2>
              <button className="modal-close" onClick={() => setShowZoneModal(false)}>×</button>
            </div>

            {!position ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-icon">📍</div>
                <h3>Localização necessária</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  Ative a localização no browser. A zona será criada na sua posição atual.
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
                    type="number"
                    min={50}
                    max={2000}
                    step={50}
                    value={zoneForm.radius_meters}
                    onChange={(e) => setZoneForm((f) => ({ ...f, radius_meters: e.target.value }))}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    A zona será centrada na sua posição atual ({position.lat.toFixed(4)}, {position.lng.toFixed(4)})
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowZoneModal(false)}>Cancelar</button>
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
        </div>
      )}
    </div>
  );
}
