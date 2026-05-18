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
function AutoFitBounds({ locations, selectedMemberId, zones }) {
  const map = useMap();
  const lastFitRef = useRef(0);

  useEffect(() => {
    if (selectedMemberId) {
      const loc = locations.find((l) => l.user_id === selectedMemberId);
      if (loc) {
        map.flyTo([loc.latitude, loc.longitude], 16, { duration: 0.8 });
        return;
      }
    }

    const now = Date.now();
    if (now - lastFitRef.current < 10000) return;

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
      lastFitRef.current = now;
    } else if (pts.length === 1) {
      map.flyTo(pts[0], 15, { duration: 0.8 });
      lastFitRef.current = now;
    }
  }, [locations, selectedMemberId, zones, map]);

  return null;
}

/**
 * Componente interno para escutar cliques (modo desenho).
 */
function MapClickListener({ onMapClick, isDrawing }) {
  const map = useMapEvents({
    click(e) {
      if (isDrawing && onMapClick) {
        onMapClick(e.latlng);
      }
    },
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

        <MapClickListener onMapClick={onMapClick} isDrawing={!!zoneDraft} />

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
