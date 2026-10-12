import type { ImageSourcePropType } from 'react-native';
import type { ChildAvatarId } from './childAvatarIds';

export type { ChildAvatarId } from './childAvatarIds';

export type ChildAvatar = {
  id: ChildAvatarId;
  name: string;
  species: string;
  emphasis: string;
  phrase: string;
  accent: string;
  darkAccent: string;
  softBackground: string;
  thumbnail: ImageSourcePropType;
  scene: ImageSourcePropType;
  video: number;
};

/** Assets locais. Só o ID escolhido é salvo em children.avatar_preset. */
export const CHILD_AVATARS: readonly ChildAvatar[] = [
  { id: 'bia', name: 'Bia', species: 'A criativa', emphasis: 'UM MUNDO', phrase: 'de possibilidades!', accent: '#D65B5C', darkAccent: '#85363A', softBackground: '#FFF0EC', thumbnail: require('../../icon/avatar/portrait/bia.png'), scene: require('../../assets/child-avatars/bia-scene.jpg'), video: require('../../assets/child-avatars/bia.mp4') },
  { id: 'caio', name: 'Caio', species: 'O aventureiro', emphasis: 'VAMOS', phrase: 'descobrir juntos!', accent: '#B7653F', darkAccent: '#78412D', softBackground: '#FFF2E8', thumbnail: require('../../icon/avatar/portrait/caio.png'), scene: require('../../assets/child-avatars/caio-scene.jpg'), video: require('../../assets/child-avatars/caio.mp4') },
  { id: 'davi', name: 'Davi', species: 'O explorador', emphasis: 'CADA DIA', phrase: 'uma aventura!', accent: '#72844B', darkAccent: '#465332', softBackground: '#F2F5E8', thumbnail: require('../../icon/avatar/portrait/davi.png'), scene: require('../../assets/child-avatars/davi-scene.jpg'), video: require('../../assets/child-avatars/davi.mp4') },
  { id: 'lia', name: 'Lia', species: 'A curiosa', emphasis: 'BRILHE', phrase: 'do seu jeito!', accent: '#C28A35', darkAccent: '#77521D', softBackground: '#FFF5DF', thumbnail: require('../../icon/avatar/portrait/lia.png'), scene: require('../../assets/child-avatars/lia-scene.jpg'), video: require('../../assets/child-avatars/lia.mp4') },
  { id: 'lua', name: 'Lua', species: 'A sonhadora', emphasis: 'SEJA', phrase: 'quem você é!', accent: '#648EC9', darkAccent: '#355A8C', softBackground: '#EAF3FF', thumbnail: require('../../icon/avatar/portrait/lua.png'), scene: require('../../assets/child-avatars/lua-scene.jpg'), video: require('../../assets/child-avatars/lua.mp4') },
  { id: 'lumi', name: 'Lumi', species: 'O inventor', emphasis: 'IMAGINE', phrase: 'e crie!', accent: '#4D88C7', darkAccent: '#315A8C', softBackground: '#E8F3FF', thumbnail: require('../../icon/avatar/portrait/lumi.png'), scene: require('../../assets/child-avatars/lumi-scene.jpg'), video: require('../../assets/child-avatars/lumi.mp4') },
  { id: 'nina', name: 'Nina', species: 'A encantadora', emphasis: 'SUA LUZ', phrase: 'faz diferença!', accent: '#9866B6', darkAccent: '#613A7A', softBackground: '#F7ECFF', thumbnail: require('../../icon/avatar/portrait/nina.png'), scene: require('../../assets/child-avatars/nina-scene.jpg'), video: require('../../assets/child-avatars/nina.mp4') },
  { id: 'theo', name: 'Theo', species: 'O corajoso', emphasis: 'PRONTO', phrase: 'para conquistar!', accent: '#3976A4', darkAccent: '#275171', softBackground: '#EAF5FF', thumbnail: require('../../icon/avatar/portrait/theo.png'), scene: require('../../assets/child-avatars/theo-scene.jpg'), video: require('../../assets/child-avatars/theo.mp4') },
];

export function getChildAvatar(id: unknown): ChildAvatar | null {
  return CHILD_AVATARS.find((avatar) => avatar.id === id) ?? null;
}
