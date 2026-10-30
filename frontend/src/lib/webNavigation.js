export const WEB_MODULES = [
  { key: 'tasks', label: 'Tarefas', icon: 'tarefas', description: 'Rotinas claras, responsabilidades compartilhadas e conquistas todos os dias.' },
  { key: 'calendar', label: 'Calendário', icon: 'calendario', description: 'Compromissos da família reunidos em uma agenda fácil de acompanhar.' },
  { key: 'grades', label: 'Vida escolar', icon: 'notas', description: 'Acompanhe notas e valorize cada passo da aprendizagem.' },
  { key: 'allowance', label: 'Mesada e metas', icon: 'cofrinho', description: 'Transforme pequenas escolhas em educação financeira.' },
  { key: 'health', label: 'Saúde', icon: 'saude', description: 'Organize cuidados, medicamentos e consultas com as permissões da família.' },
  { key: 'family_shop', label: 'Loja da família', icon: 'loja', description: 'Reconheça o esforço com recompensas escolhidas por vocês.' },
  { key: 'mural', label: 'Mural', icon: 'mural', description: 'Avisos e combinados em um espaço compartilhado.' },
  { key: 'shopping', label: 'Compras', icon: 'compras', description: 'Uma lista compartilhada para simplificar as compras da casa.' },
  { key: 'location', label: 'Localização', icon: 'localizacao', description: 'Acompanhe a localização conforme os acessos autorizados pela família.' },
];
export const MASTER_SECTIONS = [
  ['overview', 'Visão geral'], ['families', 'Famílias'], ['users', 'Usuários'],
  ['subscriptions', 'Assinaturas'], ['payments', 'Pagamentos'], ['plans', 'Planos'],
  ['modules', 'Funcionalidades'], ['content', 'Conteúdos'], ['notifications', 'Notificações'],
  ['settings', 'Configurações'], ['audit', 'Auditoria'], ['operations', 'Diagnóstico'],
];
export function roleLabel(user) {
  if (user?.role === 'master') return 'Administrador Master';
  if (user?.role === 'child') return 'Criança';
  if (user?.role === 'relative') return 'Parente';
  return user?.access_profile === 'gestor' ? 'Gestor da família' : 'Responsável';
}
