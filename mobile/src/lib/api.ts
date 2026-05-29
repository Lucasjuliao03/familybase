import { supabase } from './supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export {
  AVATAR_OPTIONS as PRESET_AVATARS,
  DEFAULT_AVATAR_PRESET,
  getAvatarOption,
  getAvatarPresetSource,
  isValidAvatarPreset,
} from './avatarCatalog';
export type { AvatarOption } from './avatarCatalog';

export function publicAssetUrl(path?: string | null): string {
  if (path == null || path === '') return '';
  const s = String(path).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (!supabaseUrl) return s;
  const clean = s.replace(/^\/+/, '');
  return `${supabaseUrl}/storage/v1/object/public/${clean}`;
}

// ─── Tipos de Dados ──────────────────────────────────────────────────────────

export interface ChildProfile {
  id: string;
  name: string;
  level: number;
  xp: number;
  xp_next_level: number;
  points: number;
  coins: number;
  color?: string;
  streak_current: number;
  streak_best: number;
  avatar_preset?: string;
  avatar_url?: string;
  allowance_balance_preview: number | null;
}

export interface DashboardStats {
  pending: number;
  completed: number;
  approved: number;
  pendingRedemptions: number;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  end_date?: string;
  time?: string;
  type: string;
  child_id?: string;
  child_name?: string;
  child_color?: string;
  creator_name?: string;
  linked_user_label: string;
}

export interface RecentActivity {
  id: string;
  event: string;
  points: number;
  child_name: string;
  child_color?: string;
  avatar_url?: string;
  avatar_preset?: string;
}

export interface ParentDashboardData {
  stats: DashboardStats;
  children: ChildProfile[];
  upcomingEvents: UpcomingEvent[];
  recentHistory: RecentActivity[];
}

// ─── Funções Auxiliares de Data/Hora ──────────────────────────────────────────

function toYMDLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDbDate(val: any): string {
  if (val == null || val === '') return '';
  const s = String(val);
  if (s.length >= 10 && s[4] === '-') return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return toYMDLocal(d);
  }
  return s;
}

// ─── Lógica de Saldo de Mesada ────────────────────────────────────────────────

interface AllowanceSettings {
  child_id: string;
  is_active?: boolean;
  allow_negative_balance?: boolean | number | string;
  model_type?: string;
}

interface AllowanceCycle {
  child_id: string;
  opening_balance?: number;
  base_amount?: number;
  total_bonus?: number;
  total_discount?: number;
  manual_adjustments?: number;
  month: number;
  year: number;
}

function computePredictedAllowanceBalance(settings: AllowanceSettings, cycle: AllowanceCycle): number {
  if (!settings || !cycle) return 0;
  const ob = Number(cycle.opening_balance ?? 0);
  const basePart = settings.model_type !== 'accumulative' ? Number(cycle.base_amount ?? 0) : 0;
  const tb = Number(cycle.total_bonus ?? 0);
  const td = Number(cycle.total_discount ?? 0);
  const ma = Number(cycle.manual_adjustments ?? 0);
  return ob + basePart + tb + ma - td;
}

// ─── Mapeamento de Entidades ──────────────────────────────────────────────────

function mapCalendarEventFromDb(d: any): UpcomingEvent {
  if (!d) return d;
  const cr = Array.isArray(d.creator) ? d.creator[0] : d.creator;
  const creatorName = cr?.name ?? null;
  const childName = d.children?.name ?? null;
  return {
    id: d.id,
    title: d.title,
    date: normalizeDbDate(d.date),
    end_date: d.end_date != null ? normalizeDbDate(d.end_date) : undefined,
    time: d.time != null ? String(d.time).slice(0, 8) : undefined,
    type: d.type,
    child_id: d.child_id || undefined,
    child_name: childName || undefined,
    child_color: d.children?.color || undefined,
    creator_name: creatorName || undefined,
    linked_user_label: childName || (!d.child_id ? (creatorName ? `Família · ${creatorName}` : 'Família') : '—'),
  };
}

// ─── Consulta do Dashboard Principal ──────────────────────────────────────────

export async function fetchParentDashboardData(familyId: string): Promise<ParentDashboardData> {
  if (!familyId) {
    throw new Error('ID de família ausente para busca de dashboard.');
  }

  // 1. Busca os filhos da família
  const { data: childrenRaw, error: childErr } = await supabase
    .from('children')
    .select('*')
    .eq('family_id', familyId);

  if (childErr) {
    throw new Error(`Erro ao carregar crianças: ${childErr.message}`);
  }

  const children = childrenRaw || [];
  const childIds = children.map((c) => c.id).filter(Boolean);

  // 2. Calcula saldos de mesada para cada criança
  const allowanceBalanceByChild: Record<string, number | null> = {};
  if (childIds.length > 0) {
    const [{ data: settingsRows }, { data: openCycleRows }] = await Promise.all([
      supabase.from('allowance_settings').select('*').eq('family_id', familyId).in('child_id', childIds),
      supabase.from('allowance_cycles').select('*').eq('family_id', familyId).eq('status', 'open').in('child_id', childIds),
    ]);

    const bySettings: Record<string, AllowanceSettings> = {};
    (settingsRows || []).forEach((s) => {
      bySettings[s.child_id] = s;
    });

    const nowD = new Date();
    const curM = nowD.getMonth() + 1;
    const curY = nowD.getFullYear();

    (openCycleRows || [])
      .filter((cy) => Number(cy.month) === curM && Number(cy.year) === curY)
      .forEach((cycle) => {
        const st = bySettings[cycle.child_id];
        if (!st) {
          allowanceBalanceByChild[cycle.child_id] = null;
          return;
        }
        const inactive =
          st.is_active === false ||
          (st.is_active as any) === 0 ||
          String(st.is_active).toLowerCase() === 'false';
        if (inactive) {
          allowanceBalanceByChild[cycle.child_id] = null;
          return;
        }
        let bal = computePredictedAllowanceBalance(st, cycle);
        const allowNeg =
          st.allow_negative_balance === true ||
          st.allow_negative_balance === 1 ||
          String(st.allow_negative_balance).toLowerCase() === 'true';
        if (!allowNeg) bal = Math.max(0, bal);
        allowanceBalanceByChild[cycle.child_id] = bal;
      });
  }

  const childrenWithAllowance: ChildProfile[] = children.map((ch) => ({
    id: ch.id,
    name: ch.name || 'Criança',
    level: ch.level ?? 1,
    xp: ch.xp ?? 0,
    xp_next_level: ch.xp_next_level ?? 100,
    points: ch.points ?? 0,
    coins: ch.coins ?? 0,
    color: ch.color,
    streak_current: ch.streak_current ?? 0,
    streak_best: ch.streak_best ?? 0,
    avatar_preset: ch.avatar_preset,
    avatar_url: ch.avatar_url,
    allowance_balance_preview:
      allowanceBalanceByChild[ch.id] !== undefined ? allowanceBalanceByChild[ch.id] : null,
  }));

  // 3. Busca estatísticas de tarefas
  const todayStr = toYMDLocal();
  let pendingToday = 0;
  try {
    const pq = await supabase
      .from('task_occurrences')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .eq('occurrence_date', todayStr)
      .in('status', ['pending', 'delayed', 'in_progress']);
    pendingToday = pq.count ?? 0;
  } catch {
    pendingToday = 0;
  }

  const { count: completedCount } = await supabase
    .from('task_occurrences')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .eq('status', 'completed');

  const { count: approvedCount } = await supabase
    .from('task_occurrences')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .eq('status', 'approved');

  // 4. Busca resgates pendentes
  let pendingRedemptions = 0;
  if (childIds.length > 0) {
    try {
      const res = await supabase
        .from('redemptions')
        .select('*', { count: 'exact', head: true })
        .in('child_id', childIds)
        .eq('status', 'pending');
      pendingRedemptions = res.count || 0;
    } catch {}
  }

  const stats: DashboardStats = {
    pending: pendingToday,
    completed: completedCount ?? 0,
    approved: approvedCount ?? 0,
    pendingRedemptions,
  };

  // 5. Busca próximos eventos do calendário
  const { data: upcomingRaw } = await supabase
    .from('calendar_events')
    .select('*, children:child_id(name, color)')
    .eq('family_id', familyId)
    .gte('date', todayStr)
    .order('date', { ascending: true })
    .limit(8);

  const upcomingEvents = (upcomingRaw || []).map(mapCalendarEventFromDb);

  // 6. Busca histórico de atividades recentes
  let recentHistory: RecentActivity[] = [];
  try {
    const { data: hist } = await supabase
      .from('history')
      .select('*, children:child_id(name, color, avatar_url, avatar_preset)')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(14);

    recentHistory = (hist || []).map((h: any) => ({
      id: h.id,
      event: h.event,
      points: h.points || 0,
      child_name: h.children?.name || '',
      child_color: h.children?.color,
      avatar_url: h.children?.avatar_url,
      avatar_preset: h.children?.avatar_preset,
    }));
  } catch {}

  // Fallback para tarefas concluídas/aprovadas caso histórico esteja vazio
  if (!recentHistory.length) {
    try {
      const { data: occDone } = await supabase
        .from('task_occurrences')
        .select('id, points_awarded, tasks(title), children:child_id(name, color, avatar_url, avatar_preset)')
        .eq('family_id', familyId)
        .in('status', ['approved', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(12);

      recentHistory = (occDone || []).map((o: any) => ({
        id: o.id,
        event: o.tasks?.title ? `Tarefa: ${o.tasks.title}` : 'Tarefa concluída',
        points: o.points_awarded || 0,
        child_name: o.children?.name || '',
        child_color: o.children?.color,
        avatar_url: o.children?.avatar_url,
        avatar_preset: o.children?.avatar_preset,
      }));
    } catch {}
  }

  return {
    stats,
    children: childrenWithAllowance,
    upcomingEvents,
    recentHistory,
  };
}
