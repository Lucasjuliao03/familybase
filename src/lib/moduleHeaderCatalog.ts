import type { ImageSourcePropType } from 'react-native';
import type { MascotId } from './mascotCatalog';

export type ChildModuleId = 'calendario' | 'compras' | 'localizacao' | 'loja' | 'mesada' | 'mural' | 'notas' | 'saude' | 'tarefas';

const headers: Record<MascotId, Record<ChildModuleId, ImageSourcePropType>> = {
  lili: {
    calendario: require('../../assets/module-headers/lili-calendario.jpg'),
    compras: require('../../assets/module-headers/lili-compras.jpg'),
    localizacao: require('../../assets/module-headers/lili-localizacao.jpg'),
    loja: require('../../assets/module-headers/lili-loja.jpg'),
    mesada: require('../../assets/module-headers/lili-mesada.jpg'),
    mural: require('../../assets/module-headers/lili-mural.jpg'),
    notas: require('../../assets/module-headers/lili-notas.jpg'),
    saude: require('../../assets/module-headers/lili-saude.jpg'),
    tarefas: require('../../assets/module-headers/lili-tarefas.jpg'),
  },
  luca: {
    calendario: require('../../assets/module-headers/luca-calendario.jpg'),
    compras: require('../../assets/module-headers/luca-compras.jpg'),
    localizacao: require('../../assets/module-headers/luca-localizacao.jpg'),
    loja: require('../../assets/module-headers/luca-loja.jpg'),
    mesada: require('../../assets/module-headers/luca-mesada.jpg'),
    mural: require('../../assets/module-headers/luca-mural.jpg'),
    notas: require('../../assets/module-headers/luca-notas.jpg'),
    saude: require('../../assets/module-headers/luca-saude.jpg'),
    tarefas: require('../../assets/module-headers/luca-tarefas.jpg'),
  },
  pipo: {
    calendario: require('../../assets/module-headers/pipo-calendario.jpg'),
    compras: require('../../assets/module-headers/pipo-compras.jpg'),
    localizacao: require('../../assets/module-headers/pipo-localizacao.jpg'),
    loja: require('../../assets/module-headers/pipo-loja.jpg'),
    mesada: require('../../assets/module-headers/pipo-mesada.jpg'),
    mural: require('../../assets/module-headers/pipo-mural.jpg'),
    notas: require('../../assets/module-headers/pipo-notas.jpg'),
    saude: require('../../assets/module-headers/pipo-saude.jpg'),
    tarefas: require('../../assets/module-headers/pipo-tarefas.jpg'),
  },
  tobe: {
    calendario: require('../../assets/module-headers/tobe-calendario.jpg'),
    compras: require('../../assets/module-headers/tobe-compras.jpg'),
    localizacao: require('../../assets/module-headers/tobe-localizacao.jpg'),
    loja: require('../../assets/module-headers/tobe-loja.jpg'),
    mesada: require('../../assets/module-headers/tobe-mesada.jpg'),
    mural: require('../../assets/module-headers/tobe-mural.jpg'),
    notas: require('../../assets/module-headers/tobe-notas.jpg'),
    saude: require('../../assets/module-headers/tobe-saude.jpg'),
    tarefas: require('../../assets/module-headers/tobe-tarefas.jpg'),
  },
};

export function getChildModuleHeader(mascotId: unknown, moduleId: ChildModuleId): ImageSourcePropType | null {
  return mascotId === 'lili' || mascotId === 'luca' || mascotId === 'pipo' || mascotId === 'tobe'
    ? headers[mascotId][moduleId]
    : null;
}
