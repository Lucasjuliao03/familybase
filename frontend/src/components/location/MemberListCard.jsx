import { useState } from 'react';
import { STATUS_MAP, formatTimeAgo } from './FamilyMemberMarker';
import { publicAssetUrl } from '../../services/api';

const PRESET_EMOJIS = {
  astronaut: '🚀', explorer: '🗺️', artist: '🎨', scientist: '🔬',
  athlete: '⚽', musician: '🎵', chef: '🍳', reader: '📚',
  gamer: '🎮', ninja: '🥷', princess: '👸', superhero: '🦸',
  parent_male: '👨', parent_female: '👩', robot: '🤖', dragon: '🐉',
};

/**
 * Calcula distância legível entre dois pontos.
 */
function formatDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lat2) return '';
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const m = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function MemberRow({ loc, isSelected, currentPosition, onClick }) {
  const user = loc.users || {};
  const name = user.name || 'Membro';
  const status = STATUS_MAP[loc.status] || STATUS_MAP.moving;
  const color = user.display_color || status.color;
  const avatarUrl = user.avatar_url || null;
  const emoji = avatarUrl ? null : (PRESET_EMOJIS[user.avatar_preset] || name[0]?.toUpperCase() || '👤');

  const dist = currentPosition
    ? formatDistance(currentPosition.lat, currentPosition.lng, loc.latitude, loc.longitude)
    : '';

  const deviceType = loc.device?.device_type || 'desktop';
  const deviceIcon = deviceType === 'mobile' ? '📱' : deviceType === 'tablet' ? '💊' : '💻';

  return (
    <button
      className={`location-member-row ${isSelected ? 'active' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="location-member-row-avatar" style={{ borderColor: color, background: avatarUrl ? '#fff' : `${color}15` }}>
        {avatarUrl ? (
          <img src={avatarUrl.startsWith('http') ? avatarUrl : publicAssetUrl(avatarUrl)} alt="" />
        ) : (
          <span>{emoji}</span>
        )}
        <div className="location-member-row-dot" style={{ background: status.color }} />
      </div>

      <div className="location-member-row-info">
        <div className="location-member-row-name">{name}</div>
        <div className="location-member-row-status" style={{ fontSize: '0.7rem', color: '#64748B', display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
          <span>{deviceIcon}</span>
          <span>{loc.device?.device_name || 'Dispositivo'}</span>
          {loc.source === 'approximate' && <span title="Localização imprecisa" style={{ color: '#F59E0B' }}>⚠️</span>}
        </div>
        <div className="location-member-row-status">
          <span>{status.emoji}</span>
          <span>{status.label}</span>
          {dist && <span className="location-member-row-dist">· {dist}</span>}
        </div>
      </div>

      <div className="location-member-row-time">
        {formatTimeAgo(loc.updated_at)}
      </div>
    </button>
  );
}

/**
 * MemberListCard — card flutuante com lista dos membros da família.
 */
export default function MemberListCard({
  locations = [],
  selectedMemberId,
  onSelectMember,
  currentPosition,
  currentUserId,
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Ordena: utilizador atual primeiro, depois por status (moving primeiro)
  const sorted = [...locations].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    const statusOrder = { moving: 0, home: 1, school: 2, work: 3, offline: 4 };
    return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
  });

  return (
    <div className={`location-member-card ${collapsed ? 'collapsed' : ''}`}>
      {/* Handle / toggle */}
      <button
        className="location-member-card-handle"
        onClick={() => setCollapsed(!collapsed)}
        type="button"
      >
        <div className="location-member-card-handle-bar" />
        <span className="location-member-card-title">
          👥 Família ({locations.length})
        </span>
      </button>

      {!collapsed && (
        <div className="location-member-card-list">
          {sorted.length === 0 && (
            <div className="location-member-card-empty">
              <span>📡</span>
              <p>Nenhum membro com localização ativa</p>
            </div>
          )}
          {sorted.map((loc) => (
            <MemberRow
              key={loc.device_id || loc.user_id + Math.random()}
              loc={loc}
              isSelected={selectedMemberId === loc.user_id}
              currentPosition={currentPosition}
              onClick={() => onSelectMember?.(loc.user_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
