import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { publicAssetUrl } from '../../services/api';

const PRESET_EMOJIS = {
  astronaut: '🚀', explorer: '🗺️', artist: '🎨', scientist: '🔬',
  athlete: '⚽', musician: '🎵', chef: '🍳', reader: '📚',
  gamer: '🎮', ninja: '🥷', princess: '👸', superhero: '🦸',
  parent_male: '👨', parent_female: '👩', robot: '🤖', dragon: '🐉',
};

const STATUS_MAP = {
  home: { label: 'Em casa', emoji: '🏠', color: '#10B981' },
  school: { label: 'Na escola', emoji: '🏫', color: '#3B82F6' },
  work: { label: 'No trabalho', emoji: '💼', color: '#F97316' },
  moving: { label: 'Em movimento', emoji: '🚶', color: '#8B5CF6' },
  offline: { label: 'Offline', emoji: '⚫', color: '#94A3B8' },
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * FamilyMemberMarker — marker circular customizado com avatar no mapa.
 */
export default function FamilyMemberMarker({ location, isSelected, isCurrentUser, onClick }) {
  const user = location.users || {};
  const name = user.name || 'Membro';
  const status = STATUS_MAP[location.status] || STATUS_MAP.moving;
  const color = user.display_color || status.color || '#6366F1';
  const isMoving = location.status === 'moving';

  const emoji = (() => {
    if (user.avatar_url) return null;
    const preset = user.avatar_preset;
    return PRESET_EMOJIS[preset] || name[0]?.toUpperCase() || '👤';
  })();

  const avatarUrl = user.avatar_url || null;

  const deviceType = location.device?.device_type || 'desktop';
  const deviceIcon = deviceType === 'mobile' ? '📱' : deviceType === 'tablet' ? '💊' : '💻';

  const icon = useMemo(() => {
    const pulse = isMoving || isSelected ? 'location-marker-pulse' : '';
    const selected = isSelected ? 'location-marker-selected' : '';
    const current = isCurrentUser ? 'location-marker-current' : '';

    const imgContent = avatarUrl
      ? `<img src="${avatarUrl.startsWith('http') ? avatarUrl : publicAssetUrl(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<span style="font-size:18px;line-height:1;">${emoji}</span>`;

    const html = `
      <div class="location-marker-wrapper ${pulse} ${selected} ${current}">
        <div class="location-marker-avatar" style="border-color:${color};background:${avatarUrl ? '#fff' : color}20;">
          ${imgContent}
          <div style="position:absolute; bottom:-4px; right:-4px; font-size:12px; background:#fff; border-radius:50%; border:1px solid #ccc; width:16px; height:16px; display:flex; align-items:center; justify-content:center;">${deviceIcon}</div>
        </div>
        <div class="location-marker-name">${name.split(' ')[0]}</div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'location-marker-container',
      iconSize: [56, 68],
      iconAnchor: [28, 68],
      popupAnchor: [0, -68],
    });
  }, [emoji, avatarUrl, name, color, isMoving, isSelected, isCurrentUser, deviceIcon]);

  return (
    <Marker
      position={[location.latitude, location.longitude]}
      icon={icon}
      eventHandlers={{ click: onClick }}
    >
      <Tooltip direction="top" offset={[0, -72]} opacity={0.95}>
        <div style={{ textAlign: 'center', padding: '2px 4px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{name}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, justifyItems: 'center', marginTop: 2 }}>
            <span>{deviceIcon}</span>
            <span>{location.device?.device_name || 'Dispositivo'}</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 4 }}>
            <span>{status.emoji}</span>
            <span>{status.label}</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: 2 }}>
            {formatTimeAgo(location.updated_at)}
          </div>
        </div>
      </Tooltip>
    </Marker>
  );
}

export { STATUS_MAP, formatTimeAgo };
