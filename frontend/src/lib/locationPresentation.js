export const STATUS_MAP = {
  home: { label: 'Em casa', emoji: '🏠', color: '#10B981' },
  school: { label: 'Na escola', emoji: '🏫', color: '#3B82F6' },
  work: { label: 'No trabalho', emoji: '💼', color: '#F97316' },
  moving: { label: 'Em movimento', emoji: '🚶', color: '#8B5CF6' },
  stopped: { label: 'Parado', emoji: '🧍', color: '#6366F1' },
  offline: { label: 'Offline', emoji: '⚫', color: '#94A3B8' },
  other: { label: 'Na zona', emoji: '📍', color: '#8B5CF6' },
};

export function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
