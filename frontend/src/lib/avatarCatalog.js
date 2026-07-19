/** Presets PNG partilhados com o mobile (`/avatar/*.png`). */
export const AVATAR_PRESET_FILES = {
  homem1: '/avatar/homem1.png',
  homem2: '/avatar/homem2.png',
  menina1: '/avatar/menina1.png',
  menina2: '/avatar/menina2.png',
  menino1: '/avatar/menino1.png',
  parent_male: '/avatar/homem1.png',
  parent_female: '/avatar/menina1.png',
  explorer: '/avatar/menino1.png',
  gamer: '/avatar/menino1.png',
  princess: '/avatar/menina1.png',
  astronaut: '/avatar/menino1.png',
};

export function getAvatarPresetUrl(id) {
  if (!id) return null;
  return AVATAR_PRESET_FILES[id] || `/avatar/${id}.png`;
}
