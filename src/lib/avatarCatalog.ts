import type { ImageSourcePropType } from 'react-native';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_PRESET, type AvatarOption } from './avatarCatalog.generated';
export { AVATAR_OPTIONS, DEFAULT_AVATAR_PRESET };
export type { AvatarOption };

export function getAvatarOption(id?: string | null): AvatarOption | undefined {
  if (!id) return undefined;
  const legacy: Record<string,string>={parent_male:'homem1',parent_female:'menina2',gamer:'menino1',explorer:'menino1',astronaut:'menino1',princess:'menina1'};
  return AVATAR_OPTIONS.find((a) => a.id === (legacy[id] || id));
}

export function getAvatarPresetSource(id?: string | null): ImageSourcePropType | undefined {
  return getAvatarOption(id)?.source;
}

const CHILD_AVATAR_PORTRAITS: Record<string, ImageSourcePropType> = {
  bia: require('../../icon/avatar/portrait/bia.png'),
  caio: require('../../icon/avatar/portrait/caio.png'),
  davi: require('../../icon/avatar/portrait/davi.png'),
  lia: require('../../icon/avatar/portrait/lia.png'),
  lua: require('../../icon/avatar/portrait/lua.png'),
  lumi: require('../../icon/avatar/portrait/lumi.png'),
  nina: require('../../icon/avatar/portrait/nina.png'),
  theo: require('../../icon/avatar/portrait/theo.png'),
};

export function getAvatarPresetPortraitSource(id?: string | null): ImageSourcePropType | undefined {
  return id ? CHILD_AVATAR_PORTRAITS[id] ?? getAvatarPresetSource(id) : undefined;
}

export function isValidAvatarPreset(id?: string | null): boolean {
  return !!getAvatarOption(id);
}
