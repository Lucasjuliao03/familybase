/** Presets PNG partilhados com o mobile (`/avatar/*.png`). */
export const AVATAR_PRESET_FILES = {
  mae1: '/avatar/mae1.webp', mae2: '/avatar/mae2.webp', mae3: '/avatar/mae3.webp', mae4: '/avatar/mae4.webp',
  pai1: '/avatar/pai1.webp', pai2: '/avatar/pai2.webp', pai3: '/avatar/pai3.webp', pai4: '/avatar/pai4.webp',
  homem1: '/avatar/homem1.png',
  homem2: '/avatar/homem2.png',
  menina1: '/avatar/menina1.png',
  menina2: '/avatar/menina2.png',
  menino1: '/avatar/menino1.png',
  parent_male: '/avatar/homem1.png',
  parent_female: '/avatar/menina2.png',
  bia: '/avatar/bia.png', caio: '/avatar/caio.png', davi: '/avatar/davi.png', lia: '/avatar/lia.png',
  lua: '/avatar/lua.png', lumi: '/avatar/lumi.png', nina: '/avatar/nina.png', theo: '/avatar/theo.png',
  explorer: '/avatar/menino1.png',
  gamer: '/avatar/menino1.png',
  princess: '/avatar/menina1.png',
  astronaut: '/avatar/menino1.png',
};

export function getAvatarPresetUrl(id) {
  if (!id) return null;
  return AVATAR_PRESET_FILES[id] || `/avatar/${id}.png`;
}
