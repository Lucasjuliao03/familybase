export const COLOR_PRESETS = [
  '#6C5CE7', '#E84393', '#00B894', '#FDCB6E', '#74B9FF', '#E17055', '#A29BFE', '#55EFC4', '#0984E3', '#FD79A8', '#636E72',
];

export const ADMIN_TABS = [
  { id: 'family', label: 'Família' },
  { id: 'users', label: 'Utilizadores' },
  { id: 'profiles', label: 'Perfis' },
  { id: 'appearance', label: 'Aparência' },
  { id: 'medals', label: 'Medalhas' },
  { id: 'modules', label: 'Módulos' },
  { id: 'security', label: 'Segurança' },
  { id: 'reset_data', label: 'Limpar dados', risk: true },
] as const;

export type AdminTabId = typeof ADMIN_TABS[number]['id'];

export const PROFILE_INFO = [
  { key: 'gestor', title: 'Gestor', body: 'Acesso total à administração, billing e configurações da família.' },
  { key: 'child', title: 'Filho(a)', body: 'Acesso às áreas liberadas pelos responsáveis, com gamificação e mesada.' },
  { key: 'parente', title: 'Parente', body: 'Acesso limitado conforme vínculos e permissões definidas pelo gestor.' },
  { key: 'aux', title: 'Auxiliar', body: 'Apoia a rotina familiar sem permissões de gestor ou billing.' },
];

export const RESET_REMOVED = [
  'Tarefas, rotinas e histórico de pontos',
  'Notas e registos escolares',
  'Mesada, cofrinho, metas e transações',
  'Loja, resgates e recompensas',
  'Calendário e eventos',
  'Saúde, consultas e medicamentos',
  'Mural, avisos e lembretes',
  'Lista de compras',
  'Notificações operacionais',
  'Localização e registos de mapa',
  'Medalhas conquistadas',
  'Logs operacionais da família',
];

export const RESET_KEPT = [
  'Utilizadores e credenciais',
  'Perfis das crianças',
  'Registo da família',
  'Membros vinculados',
  'Plano e assinatura',
];

export const SECURITY_ITEMS = [
  'Senhas são armazenadas com segurança via Supabase Auth.',
  'Apenas o gestor pode alterar configurações críticas da família.',
  'Recomendamos ativar troca de senha no primeiro acesso para crianças e auxiliares.',
];

export const MEDAL_GROUPS = [
  'organization', 'studies', 'routine', 'responsibility', 'behavior', 'allowance', 'rewards', 'special',
] as const;

export const MEDAL_GROUP_LABELS: Record<string, string> = {
  organization: 'Organização',
  studies: 'Estudos',
  routine: 'Rotina',
  responsibility: 'Responsabilidade',
  behavior: 'Comportamento',
  allowance: 'Mesada',
  rewards: 'Recompensas',
  special: 'Especial',
};

export const MEDAL_REQ_TYPES = [
  { value: 'task_count', label: 'Quantidade de tarefas' },
  { value: 'task_streak', label: 'Sequência de tarefas' },
  { value: 'perfect_grade', label: 'Nota perfeita' },
  { value: 'points_goal', label: 'Meta de pontos' },
  { value: 'reward_redemptions', label: 'Resgates na loja' },
  { value: 'allowance_paid_cycles', label: 'Ciclos de mesada pagos' },
];

export const RESET_PHRASE = 'LIMPAR DADOS';
