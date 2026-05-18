import { Circle, Tooltip } from 'react-leaflet';

const ZONE_COLORS = {
  home: { fill: '#10B981', stroke: '#059669', icon: '🏠' },
  school: { fill: '#3B82F6', stroke: '#2563EB', icon: '🏫' },
  work: { fill: '#F97316', stroke: '#EA580C', icon: '💼' },
  other: { fill: '#8B5CF6', stroke: '#7C3AED', icon: '📍' },
};

/**
 * SafeZoneCircle — círculo representando uma zona segura no mapa.
 */
export default function SafeZoneCircle({ zone, isHighlighted }) {
  const colors = ZONE_COLORS[zone.type] || ZONE_COLORS.other;
  const zoneColor = zone.color || colors.fill;

  return (
    <Circle
      center={[zone.latitude, zone.longitude]}
      radius={zone.radius_meters || 200}
      pathOptions={{
        color: isHighlighted ? '#6366F1' : colors.stroke,
        fillColor: zoneColor,
        fillOpacity: isHighlighted ? 0.25 : 0.12,
        weight: isHighlighted ? 3 : 2,
        dashArray: isHighlighted ? '' : '6 4',
      }}
    >
      <Tooltip direction="center" permanent className="location-zone-tooltip">
        <span style={{ fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          {zone.icon || colors.icon} {zone.name}
        </span>
      </Tooltip>
    </Circle>
  );
}

export { ZONE_COLORS };
