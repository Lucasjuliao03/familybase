import { ImageSourcePropType } from 'react-native';

export interface AvatarOption {
  id: string;
  label: string;
  source: ImageSourcePropType;
}

function formatAvatarLabel(id: string): string {
  const spaced = id
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zA-ZÀ-ÿ]+)(\d+)/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildAvatarCatalog(): AvatarOption[] {
  const context = require.context('../../icon/avatar', false, /\.(png|jpe?g|webp)$/i);
  return context
    .keys()
    .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'))
    .map((key: string) => {
      const file = key.replace('./', '');
      const id = file.replace(/\.(png|jpe?g|webp)$/i, '');
      return {
        id,
        label: formatAvatarLabel(id),
        source: context(key) as ImageSourcePropType,
      };
    });
}

export const AVATAR_OPTIONS: AvatarOption[] = buildAvatarCatalog();

export const DEFAULT_AVATAR_PRESET =
  AVATAR_OPTIONS.find((a) => a.id === 'menino1')?.id ?? AVATAR_OPTIONS[0]?.id ?? 'menino1';

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
