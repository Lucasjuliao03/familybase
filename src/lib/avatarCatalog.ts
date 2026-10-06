import type { ImageSourcePropType } from 'react-native';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_PRESET, type AvatarOption } from './avatarCatalog.generated';
export { AVATAR_OPTIONS, DEFAULT_AVATAR_PRESET };
export type { AvatarOption };

export function getAvatarOption(id?: string | null): AvatarOption | undefined {
  if (!id) return undefined;
  return AVATAR_OPTIONS.find((a) => a.id === id);
}

export function getAvatarPresetSource(id?: string | null): ImageSourcePropType | undefined {
  return getAvatarOption(id)?.source;
}

export function isValidAvatarPreset(id?: string | null): boolean {
  return !!getAvatarOption(id);
}
