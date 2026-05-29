export interface FamilyModuleRow {
  module_key: string;
  is_premium: boolean;
  is_enabled: boolean;
  can_enable: boolean;
}

export const MODULE_ICONS: Record<string, string> = {
  tasks: '✅',
  routines: '🔁',
  calendar: '📅',
  allowance: '💰',
  family_shop: '🏪',
  medals: '🏅',
  grades: '📚',
  piggy_bank: '🐷',
  goals: '🎯',
  reports: '📊',
  notifications: '🔔',
  shopping: '🛒',
  health: '💊',
  mural: '📌',
  location: '📍',
};

export const MODULE_LABELS: Record<string, { title: string; desc: string }> = {
  tasks: { title: 'Tarefas', desc: 'Tarefas diárias, pontos e aprovações.' },
  routines: { title: 'Rotinas', desc: 'Hábitos e tarefas recorrentes com horário.' },
  calendar: { title: 'Calendário', desc: 'Eventos e compromissos da família.' },
  allowance: { title: 'Mesada', desc: 'Ciclos de mesada, bónus e descontos.' },
  family_shop: { title: 'Loja da Família', desc: 'Recompensas com pontos e resgates.' },
  medals: { title: 'Medalhas', desc: 'Conquistas e gamificação.' },
  grades: { title: 'Notas', desc: 'Acompanhar desempenho escolar.' },
  piggy_bank: { title: 'Cofrinho', desc: 'Poupança e metas no cofrinho.' },
  goals: { title: 'Metas', desc: 'Metas de poupança por filho.' },
  reports: { title: 'Relatórios', desc: 'Painéis analíticos e exportação.' },
  notifications: { title: 'Notificações', desc: 'Alertas no app.' },
  shopping: { title: 'Lista de Compras', desc: 'Lista partilhada de compras.' },
  health: { title: 'Minha Saúde', desc: 'Consultas, medicamentos e histórico.' },
  mural: { title: 'Mural', desc: 'Avisos e lembretes para a família.' },
  location: { title: 'Localização', desc: 'Localização familiar no mapa.' },
};
