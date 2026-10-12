import type { ImageSourcePropType } from 'react-native';
import { CHILD_AVATAR_IDS, type ChildAvatarId } from './childAvatarIds';
import type { MascotId } from './mascotCatalog';

type HomeSceneRow = Record<MascotId, ImageSourcePropType>;

/** Cada arquivo é uma cena completa; a combinação nunca é montada em camadas. */
const HOME_SCENES: Record<ChildAvatarId, HomeSceneRow> = {
  bia: {
    lili: require('../../assets/home-scenes/bia-lili.jpg'),
    luca: require('../../assets/home-scenes/bia-luca.jpg'),
    pipo: require('../../assets/home-scenes/bia-pipo.jpg'),
    tobe: require('../../assets/home-scenes/bia-tobe.jpg'),
  },
  caio: {
    lili: require('../../assets/home-scenes/caio-lili.jpg'),
    luca: require('../../assets/home-scenes/caio-luca.jpg'),
    pipo: require('../../assets/home-scenes/caio-pipo.jpg'),
    tobe: require('../../assets/home-scenes/caio-tobe.jpg'),
  },
  davi: {
    lili: require('../../assets/home-scenes/davi-lili.jpg'),
    luca: require('../../assets/home-scenes/davi-luca.jpg'),
    pipo: require('../../assets/home-scenes/davi-pipo.jpg'),
    tobe: require('../../assets/home-scenes/davi-tobe.jpg'),
  },
  lia: {
    lili: require('../../assets/home-scenes/lia-lili.jpg'),
    luca: require('../../assets/home-scenes/lia-luca.jpg'),
    pipo: require('../../assets/home-scenes/lia-pipo.jpg'),
    tobe: require('../../assets/home-scenes/lia-tobe.jpg'),
  },
  lua: {
    lili: require('../../assets/home-scenes/lua-lili.jpg'),
    luca: require('../../assets/home-scenes/lua-luca.jpg'),
    pipo: require('../../assets/home-scenes/lua-pipo.jpg'),
    tobe: require('../../assets/home-scenes/lua-tobe.jpg'),
  },
  lumi: {
    lili: require('../../assets/home-scenes/lumi-lili.jpg'),
    luca: require('../../assets/home-scenes/lumi-luca.jpg'),
    pipo: require('../../assets/home-scenes/lumi-pipo.jpg'),
    tobe: require('../../assets/home-scenes/lumi-tobe.jpg'),
  },
  nina: {
    lili: require('../../assets/home-scenes/nina-lili.jpg'),
    luca: require('../../assets/home-scenes/nina-luca.jpg'),
    pipo: require('../../assets/home-scenes/nina-pipo.jpg'),
    tobe: require('../../assets/home-scenes/nina-tobe.jpg'),
  },
  theo: {
    lili: require('../../assets/home-scenes/theo-lili.jpg'),
    luca: require('../../assets/home-scenes/theo-luca.jpg'),
    pipo: require('../../assets/home-scenes/theo-pipo.jpg'),
    tobe: require('../../assets/home-scenes/theo-tobe.jpg'),
  },
};

const AVATAR_IDS = new Set<string>(CHILD_AVATAR_IDS);
const MASCOT_IDS = new Set<string>(['lili', 'luca', 'pipo', 'tobe']);

export function getHomeScene(avatarId: unknown, mascotId: unknown): ImageSourcePropType | null {
  if (typeof avatarId !== 'string' || !AVATAR_IDS.has(avatarId)) return null;
  if (typeof mascotId !== 'string' || !MASCOT_IDS.has(mascotId)) return null;
  return HOME_SCENES[avatarId as ChildAvatarId][mascotId as MascotId];
}
