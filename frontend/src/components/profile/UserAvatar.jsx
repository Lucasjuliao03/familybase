import { publicAssetUrl } from '../../services/api';
import { useState } from 'react';
import { getAvatarPresetUrl } from '../../lib/avatarCatalog';

/**
 * Avatar unificado (responsáveis e filhos) — foto, preset PNG ou inicial.
 */
export default function UserAvatar({
  avatarUrl,
  avatarPreset,
  name,
  size = 40,
  bordered = true,
  backgroundColor,
  className = '',
  style = {},
  title,
}) {
  const [failedSources,setFailedSources]=useState({});
  const markFailed=src=>setFailedSources(previous=>({...previous,[src]:true}));
  const requestedSrc = avatarUrl ? publicAssetUrl(avatarUrl) : '';
  const remoteSrc = !failedSources[requestedSrc] ? requestedSrc:'';
  const requestedPreset=getAvatarPresetUrl(avatarPreset);
  const presetSrc = !remoteSrc && !failedSources[requestedPreset] ? requestedPreset : null;
  const initial = name ? String(name).charAt(0).toUpperCase() : '?';
  const hasImage = !!(remoteSrc || presetSrc);
  const fallbackBg = backgroundColor || 'rgba(99,102,241,0.12)';

  return (
    <div
      className={`user-avatar user-avatar--unified ${bordered ? 'user-avatar--bordered' : ''} ${className}`.trim()}
      title={title || name || undefined}
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize: Math.max(11, size * 0.38),
        background: hasImage ? 'transparent' : fallbackBg,
        color: 'var(--primary)',
        ...style,
      }}
    >
      {remoteSrc ? (
        <img src={remoteSrc} alt="" onError={() => markFailed(remoteSrc)} />
      ) : presetSrc ? (
        <img src={presetSrc} alt="" onError={() => markFailed(presetSrc)} />
      ) : (
        <span className="user-avatar__initial">{initial}</span>
      )}
    </div>
  );
}
