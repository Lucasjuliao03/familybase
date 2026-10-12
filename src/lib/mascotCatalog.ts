import type { ImageSourcePropType } from 'react-native';

export type MascotId = 'lili' | 'tobe' | 'pipo' | 'luca';

export type Mascot = {
  id: MascotId;
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

/** Os vídeos contêm o cenário completo; nunca sobrepor a miniatura ao vídeo. */
export const MASCOTS: readonly Mascot[] = [
  {
    id: 'lili', name: 'Lili', species: 'A unicórnio', emphasis: 'CORAJOSA', phrase: 'para tentar!',
    accent: '#C63E79', darkAccent: '#712447', softBackground: '#FDE8EE',
    thumbnail: require('../../assets/mascots/lili.png'),
    scene: require('../../assets/mascots/lili-scene.png'),
    video: require('../../assets/mascots/lili.mp4'),
  },
  {
    id: 'tobe', name: 'Tobe', species: 'O dragão', emphasis: 'CURIOSO', phrase: 'para aprender!',
    accent: '#168F80', darkAccent: '#1D5D57', softBackground: '#DFF8EE',
    thumbnail: require('../../assets/mascots/tobe.png'),
    scene: require('../../assets/mascots/tobe-scene.png'),
    video: require('../../assets/mascots/tobe.mp4'),
  },
  {
    id: 'pipo', name: 'Pipo', species: 'A capivara', emphasis: 'ALEGRIA', phrase: 'em cada conquista!',
    accent: '#A65C16', darkAccent: '#694117', softBackground: '#FFF0D9',
    thumbnail: require('../../assets/mascots/pipo.png'),
    scene: require('../../assets/mascots/pipo-scene.png'),
    video: require('../../assets/mascots/pipo.mp4'),
  },
  {
    id: 'luca', name: 'Luca', species: 'O cachorrinho', emphasis: 'JUNTOS', phrase: 'a gente consegue!',
    accent: '#286DB8', darkAccent: '#1D4C82', softBackground: '#E1F1FF',
    thumbnail: require('../../assets/mascots/luca.png'),
    scene: require('../../assets/mascots/luca-scene.png'),
    video: require('../../assets/mascots/luca.mp4'),
  },
];

export function getMascot(id: unknown): Mascot | null {
  return MASCOTS.find((mascot) => mascot.id === id) ?? null;
}
