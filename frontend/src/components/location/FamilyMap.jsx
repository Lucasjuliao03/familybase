import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import FamilyMemberMarker from './FamilyMemberMarker';
import SafeZoneCircle from './SafeZoneCircle';
import 'leaflet/dist/leaflet.css';

/* Fix default Leaflet icon path issue with bundlers */
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [-23.5505, -46.6333]; // São Paulo fallback
const DEFAULT_ZOOM = 14;

/**
 * Componente interno que faz auto-fit nos bounds dos markers.
 */
function AutoFitBounds({ locations, selectedMemberId, isFollowingMember, centerTrigger, zones }) {
  const map = useMap();
  const lastFitRef = useRef(0);
  const lastCenteredRef = useRef({ userId: null, lat: null, lng: null, trigger: -1 });

  useEffect(() => {
    if (selectedMemberId && isFollowingMember) {
      const loc = locations.find((l) => l.user_id === selectedMemberId);
      if (loc) {
        const hasMovedSignificant = 
          lastCenteredRef.current.userId !== selectedMemberId ||
          lastCenteredRef.current.trigger !== centerTrigger ||
          Math.abs((lastCenteredRef.current.lat || 0) - loc.latitude) > 0.0001 ||
          Math.abs((lastCenteredRef.current.lng || 0) - loc.longitude) > 0.0001;

        if (hasMovedSignificant) {
          map.flyTo([loc.latitude, loc.longitude], 16, { duration: 0.8 });
          lastCenteredRef.current = { userId: selectedMemberId, lat: loc.latitude, lng: loc.longitude, trigger: centerTrigger };
        }
      }
      return;
    }

    // Ajuste inicial ou re-fit solicitado (Ver Todos)
    const shouldFit = lastFitRef.current === 0 || (!selectedMemberId && lastCenteredRef.current.trigger !== centerTrigger);
    if (shouldFit && locations.length > 0) {
      const pts = [];
      locations.forEach((l) => {
        if (l.latitude && l.longitude) pts.push([l.latitude, l.longitude]);
      });
      (zones || []).forEach((z) => {
        if (z.latitude && z.longitude) pts.push([z.latitude, z.longitude]);
      });

      if (pts.length >= 2) {
        const bounds = L.latLngBounds(pts);
        map.fitBounds(bounds.pad(0.3), { maxZoom: 16, duration: 0.8 });
        lastFitRef.current = Date.now();
        lastCenteredRef.current.trigger = centerTrigger;
      } else if (pts.length === 1) {
        map.flyTo(pts[0], 15, { duration: 0.8 });
        lastFitRef.current = Date.now();
        lastCenteredRef.current.trigger = centerTrigger;
      }
    }
  }, [locations, selectedMemberId, isFollowingMember, centerTrigger, zones, map]);

  return null;
}

function MapEventsListener({ onMapClick, isDrawing, onUserInteraction }) {
  const map = useMapEvents({
    click(e) {
      if (isDrawing && onMapClick) {
        onMapClick(e.latlng);
      }
    },
    dragstart() {
      if (onUserInteraction) onUserInteraction();
    },
    zoomstart() {
      if (onUserInteraction) onUserInteraction();
    },
    mousedown() {
      if (onUserInteraction) onUserInteraction();
    },
    touchstart() {
      if (onUserInteraction) onUserInteraction();
    }
  });
  
  useEffect(() => {
    if (isDrawing) {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
  }, [isDrawing, map]);

  return null;
}

/**
 * FamilyMap — mapa Leaflet com markers de membros e zonas seguras.
 */
export default function FamilyMap({
  locations = [],
  zones = [],
  selectedMemberId,
  isFollowingMember,
  centerTrigger,
  onUserInteraction,
  onSelectMember,
  currentUserId,
  zoneDraft,
  onMapClick,
  children: childNodes,
}) {
  const center = (() => {
    if (locations.length > 0) {
      const first = locations[0];
      if (first.latitude && first.longitude) return [first.latitude, first.longitude];
    }
    return DEFAULT_CENTER;
  })();

  return (
    <div className="location-map-container">
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        className="location-leaflet-map"
        zoomControl={false}
        attributionControl={false}
      >
        {/* Light theme tiles */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        <AutoFitBounds
          locations={locations}
          selectedMemberId={selectedMemberId}
          isFollowingMember={isFollowingMember}
          centerTrigger={centerTrigger}
          zones={zones}
        />

        {/* Safe zones */}
        {zones.map((zone) => (
          <SafeZoneCircle key={zone.id} zone={zone} />
        ))}

        {/* Draft Zone */}
        {zoneDraft && (
          <SafeZoneCircle 
            zone={{ ...zoneDraft, id: 'draft', color: '#10B981', type: 'home' }} 
          />
        )}

        <MapEventsListener 
          onMapClick={onMapClick} 
          isDrawing={!!zoneDraft} 
          onUserInteraction={onUserInteraction}
        />

        {/* Member markers */}
        {locations.map((loc) => (
          <FamilyMemberMarker
            key={loc.user_id}
            location={loc}
            isSelected={selectedMemberId === loc.user_id}
            isCurrentUser={currentUserId === loc.user_id}
            onClick={() => onSelectMember?.(loc.user_id)}
          />
        ))}

        {childNodes}
      </MapContainer>
    </div>
  );
}
