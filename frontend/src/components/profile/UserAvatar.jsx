import { publicAssetUrl } from '../../services/api';
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
  const remoteSrc = avatarUrl ? publicAssetUrl(avatarUrl) : '';
  const presetSrc = !remoteSrc ? getAvatarPresetUrl(avatarPreset) : null;
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
        <img src={remoteSrc} alt="" />
      ) : presetSrc ? (
        <img src={presetSrc} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      ) : (
        <span className="user-avatar__initial">{initial}</span>
      )}
    </div>
  );
}
