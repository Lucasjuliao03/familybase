import { supabase } from '../lib/supabase';

const BASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

/** URL pública Supabase Storage (bucket path sem barra inicial). */
export function publicAssetUrl(path) {
  if (path == null || path === '') return '';
  const s = String(path).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (!BASE_URL) return s;
  const clean = s.replace(/^\/+/, '');
  return `${BASE_URL}/storage/v1/object/public/${clean}`;
}

/** @deprecated Prefira `publicAssetUrl` — mantido para imports antigos. */
export const apiOrigin = BASE_URL ? `${BASE_URL}/storage/v1/object/public` : '';

// Gerador de UUID nativo para substituir a biblioteca externa e evitar erros no Vite
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function getFamilyId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase.from('users').select('family_id').eq('id', session.user.id).single();
  return data?.family_id;
}

async function getUserRole() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase.from('users').select('role').eq('id', session.user.id).single();
  return data?.role || null;
}

const DEFAULT_MODULE_KEYS = [
  'tasks', 'routines', 'calendar', 'allowance', 'family_shop', 'medals', 'grades',
  'piggy_bank', 'goals', 'reports', 'notifications', 'shopping', 'health', 'mural',
];

const MODULE_META = {
  tasks: { is_premium: false },
  routines: { is_premium: false },
  calendar: { is_premium: false },
  allowance: { is_premium: true },
  family_shop: { is_premium: true },
  medals: { is_premium: false },
  grades: { is_premium: false },
  piggy_bank: { is_premium: true },
  goals: { is_premium: true },
  reports: { is_premium: false },
  notifications: { is_premium: false },
  shopping: { is_premium: false },
  health: { is_premium: true },
  mural: { is_premium: false },
};

async function buildModulesPayload(familyId) {
  const defaultMods = Object.fromEntries(DEFAULT_MODULE_KEYS.map((k) => [k, true]));
  const { data: rows, error } = await supabase.from('family_modules').select('module_key, is_enabled').eq('family_id', familyId);
  if (error || !rows?.length) {
    const modules = DEFAULT_MODULE_KEYS.map((module_key) => ({
      module_key,
      is_premium: MODULE_META[module_key]?.is_premium ?? false,
      is_enabled: true,
      can_enable: true,
    }));
    return { modules, planAllowsPremium: true };
  }
  const map = { ...defaultMods };
  rows.forEach((r) => {
    if (r.module_key != null) map[r.module_key] = !!r.is_enabled;
  });
  const modules = DEFAULT_MODULE_KEYS.map((module_key) => ({
    module_key,
    is_premium: MODULE_META[module_key]?.is_premium ?? false,
    is_enabled: !!map[module_key],
    can_enable: true,
  }));
  return { modules, planAllowsPremium: true };
}

const api = {
  defaults: { headers: { common: {} } },
  interceptors: { request: { use: () => {} }, response: { use: () => {} } },

  async get(url, config = {}) {
    const path = url.split('?')[0];

    if (path.startsWith('/push/')) {
      return { data: { ok: true } };
    }

    if (path.startsWith('/master/')) {
      const role = await getUserRole();
      if (role !== 'master') {
        if (path.includes('stats')) {
          return { data: { totalFamilies: 0, activeFamilies: 0, totalUsers: 0, activeUsers: 0 } };
        }
        return { data: [] };
      }
      if (path.startsWith('/master/stats')) {
        const { count: totalFamilies } = await supabase.from('families').select('*', { count: 'exact', head: true });
        const { count: activeFamilies } = await supabase.from('families').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: activeUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active');
        return {
          data: {
            totalFamilies: totalFamilies || 0,
            activeFamilies: activeFamilies || 0,
            totalUsers: totalUsers || 0,
            activeUsers: activeUsers || 0,
          },
        };
      }
      if (path.startsWith('/master/families')) {
        const { data, error } = await supabase.from('families').select('*').order('created_at', { ascending: false });
        if (error) return { data: [] };
        return { data: data || [] };
      }
      if (path.startsWith('/master/users')) {
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (error) return { data: [] };
        return { data: data || [] };
      }
      if (path.startsWith('/master/subscriptions')) {
        const { data } = await supabase.from('families').select('id, name, plan, status, language, created_at').order('created_at', { ascending: false });
        return {
          data: (data || []).map((f) => ({
            family_id: f.id,
            family_name: f.name,
            plan: f.plan,
            status: f.status,
            language: f.language,
            created_at: f.created_at,
          })),
        };
      }
      if (path.startsWith('/master/audit-logs')) {
        return { data: [] };
      }
      return { data: [] };
    }

    const familyId = await getFamilyId();
    if (!familyId) throw new Error('Not authenticated');

    if (path.startsWith('/grades/subjects')) {
      const { data: grades } = await supabase.from('grades').select('subject').eq('family_id', familyId);
      const uniq = [...new Set((grades || []).map((g) => g.subject).filter(Boolean))];
      return { data: uniq.sort() };
    }

    if (path.startsWith('/grades')) {
      const { data } = await supabase.from('grades').select('*, children:child_id(name, color, avatar_url, avatar_preset)').eq('family_id', familyId).order('date', { ascending: false });
      return { data: (data || []).map(d => ({
        ...d,
        score: d.grade_value ?? d.score,
        max_score: d.max_value ?? d.max_score,
        observation: d.notes ?? d.observation,
        child_name: d.children?.name,
        child_color: d.children?.color,
        avatar_url: d.children?.avatar_url,
        avatar_preset: d.children?.avatar_preset,
      })) };
    }
    
    if (path.startsWith('/calendar')) {
      const { data } = await supabase.from('calendar_events').select('*, children:child_id(name, color)').eq('family_id', familyId);
      return { data: (data || []).map(d => ({ ...d, child_name: d.children?.name, child_color: d.children?.color })) };
    }

    if (path.startsWith('/shopping')) {
      const { data } = await supabase.from('shopping_list').select('*, registered_by:users!shopping_list_registered_by_fkey(name), bought_by:users!shopping_list_bought_by_fkey(name)').eq('family_id', familyId).order('created_at', { ascending: false });
      return { data: { pending: (data || []).filter(i => !i.is_bought), history: (data || []).filter(i => i.is_bought) }};
    }

    if (path.startsWith('/tasks/occurrences')) {
      const { data } = await supabase.from('task_occurrences').select('*, tasks(*)').eq('family_id', familyId);
      return { data: data || [] };
    }

    if (path.startsWith('/tasks')) {
      const { data } = await supabase.from('tasks').select('*').eq('family_id', familyId);
      return { data: data || [] };
    }

    if (path === '/families') {
      const { data: family } = await supabase.from('families').select('*').eq('id', familyId).single();
      const { data: children } = await supabase.from('children').select('*').eq('family_id', familyId);
      return { data: { family: family || {}, children: children || [] } };
    }

    if (path === '/families/members') {
      const { data } = await supabase.from('users').select('*').eq('family_id', familyId).not('role', 'eq', 'child').not('role', 'eq', 'master');
      return { data: data || [] };
    }

    if (path === '/families/relatives') {
      const { data } = await supabase.from('users').select('*').eq('family_id', familyId).eq('role', 'relative');
      return { data: data || [] };
    }

    if (path === '/gamification/medals') {
      try {
        const { data } = await supabase.from('medals').select('*').eq('family_id', familyId);
        return { data: data || [] };
      } catch {
        return { data: [] };
      }
    }

    if (path === '/families/modules') {
      return { data: await buildModulesPayload(familyId) };
    }

    if (path.startsWith('/allowance/rewards/list')) {
      const { data } = await supabase.from('rewards').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
      return { data: data || [] };
    }

    if (path.startsWith('/allowance/redemptions/list')) {
      const { data: children } = await supabase.from('children').select('id').eq('family_id', familyId);
      const childIds = (children || []).map((c) => c.id);
      if (!childIds.length) return { data: [] };
      const { data: rows } = await supabase.from('redemptions').select('*, rewards(*), children:child_id(name)').in('child_id', childIds).order('created_at', { ascending: false });
      return { data: rows || [] };
    }

    if (path.startsWith('/allowance/transactions')) {
      let q = supabase.from('allowance_transactions').select('*, children:child_id(name)').eq('family_id', familyId).order('created_at', { ascending: false });
      const childId = config?.params?.child_id;
      if (childId) q = q.eq('child_id', childId);
      const { data } = await q;
      return { data: (data || []).map((t) => ({ ...t, child_name: t.children?.name })) };
    }

    if (path.startsWith('/allowance/goals')) {
      const { data } = await supabase.from('savings_goals').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
      return { data: data || [] };
    }

    if (path === '/allowance/settings') {
      const { data } = await supabase.from('allowance_settings').select('*').eq('family_id', familyId);
      return { data: data || [] };
    }

    if (path === '/allowance/cycles') {
      const { data } = await supabase.from('allowance_cycles').select('*').eq('family_id', familyId);
      return { data: data || [] };
    }

    if (path === '/allowance/piggy-requests') {
      const { data } = await supabase.from('piggy_requests').select('*').eq('family_id', familyId);
      return { data: data || [] };
    }

    if (path.startsWith('/gamification/profile/')) {
      const childId = path.split('/')[3];
      const { data: child } = await supabase.from('children').select('*').eq('id', childId).single();
      const { data: earned } = await supabase.from('earned_medals').select('*, medals(*)').eq('child_id', childId);
      return {
        data: {
          child: child || {},
          stats: { medalsEarned: earned?.length || 0 },
          medals: (earned || []).map(e => e.medals).filter(Boolean),
          recentHistory: []
        }
      };
    }

    if (path.startsWith('/reports/child/')) {
      const childId = path.split('/')[3];
      const { data: child } = await supabase.from('children').select('*').eq('id', childId).single();
      const { data: tasks } = await supabase.from('task_occurrences').select('*').eq('child_id', childId);
      const { data: earned } = await supabase.from('earned_medals').select('*, medals(*)').eq('child_id', childId);
      const { data: grades } = await supabase.from('grades').select('*').eq('child_id', childId);
      
      const approved = tasks?.filter(t => t.status === 'approved').length || 0;
      const pending = tasks?.filter(t => t.status === 'pending').length || 0;
      
      const avgBySubject = {};
      if (grades) {
        grades.forEach(g => {
          if (!avgBySubject[g.subject]) avgBySubject[g.subject] = { sum: 0, count: 0 };
          avgBySubject[g.subject].sum += Number(g.grade_value || 0);
          avgBySubject[g.subject].count++;
        });
        Object.keys(avgBySubject).forEach(s => avgBySubject[s] = (avgBySubject[s].sum / avgBySubject[s].count).toFixed(1));
      }

      return {
        data: {
          child: child || {},
          taskStats: { approved, pending },
          medals: (earned || []).map(e => e.medals).filter(Boolean),
          avgBySubject,
          history: [] // Mock history for now
        }
      };
    }

    if (path.startsWith('/reports/export/')) {
      return { data: [{ "Nota": "A exportação em CSV foi desativada temporariamente na migração." }] };
    }

    if (path.startsWith('/reports/dashboard')) {
      const { data: children } = await supabase.from('children').select('*').eq('family_id', familyId);
      const { count: pending } = await supabase.from('task_occurrences').select('*', { count: 'exact', head: true }).eq('family_id', familyId).eq('status', 'pending');
      const { count: completed } = await supabase.from('task_occurrences').select('*', { count: 'exact', head: true }).eq('family_id', familyId).eq('status', 'completed');
      const { count: approved } = await supabase.from('task_occurrences').select('*', { count: 'exact', head: true }).eq('family_id', familyId).eq('status', 'approved');
      let pendingRedemptions = 0;
      try {
        const { data: ch } = await supabase.from('children').select('id').eq('family_id', familyId);
        const ids = (ch || []).map((c) => c.id);
        if (ids.length) {
          const res = await supabase.from('redemptions').select('*', { count: 'exact', head: true }).in('child_id', ids).eq('status', 'pending');
          pendingRedemptions = res.count || 0;
        }
      } catch {}
      
      const { data: upcomingEvents } = await supabase.from('calendar_events')
        .select('*, children:child_id(name, color)')
        .eq('family_id', familyId)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(5);
        
      return { 
        data: {
          stats: { 
            pending: pending || 0, 
            completed: completed || 0, 
            approved: approved || 0, 
            pendingRedemptions: pendingRedemptions || 0 
          },
          children: children || [],
          upcomingEvents: (upcomingEvents || []).map(e => ({ ...e, child_name: e.children?.name, child_color: e.children?.color })),
          recentHistory: []
        }
      };
    }

    if (path.startsWith('/mural/notices')) {
      const { data } = await supabase.from('family_notices').select('*, users!family_notices_created_by_fkey(name)').eq('family_id', familyId).order('created_at', { ascending: false });
      return { data: (data || []).map(d => ({ ...d, author_name: d.users?.name })) };
    }

    if (path.startsWith('/families/children')) {
      const { data } = await supabase.from('children').select('*').eq('family_id', familyId);
      return { data: data || [] };
    }

    if (path.startsWith('/notifications/unread-count')) {
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('family_id', familyId).eq('is_read', false);
      return { data: { count: count || 0 } };
    }

    if (path.startsWith('/notifications')) {
      const { data } = await supabase.from('notifications').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
      return { data: data || [] };
    }

    // Generic fallback
    let table = path.split('/')[1];
    if (table === 'calendar') table = 'calendar_events';
    if (table === 'health') {
      if (path.includes('appointments')) table = 'health_appointments';
      else if (path.includes('medication-logs')) table = 'health_medication_logs';
      else if (path.includes('medications')) table = 'medications';
      else if (path.includes('records')) table = 'health_records';
    }
    
    try {
      const { data } = await supabase.from(table).select('*').eq('family_id', familyId);
      return { data: data || [] };
    } catch {
      return { data: [] };
    }
  },

  async post(url, body, config = {}) {
    const path = url.split('?')[0];

    if (path.startsWith('/push/')) {
      return { data: { ok: true } };
    }

    const familyId = await getFamilyId();
    if (!familyId) throw new Error('Not authenticated');
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (path.startsWith('/grades')) {
      const safeBody = { ...body };
      if ('score' in safeBody) { safeBody.grade_value = safeBody.score; delete safeBody.score; }
      if ('max_score' in safeBody) { safeBody.max_value = safeBody.max_score; delete safeBody.max_score; }
      if ('observation' in safeBody) { safeBody.notes = safeBody.observation; delete safeBody.observation; }
      if ('concept' in safeBody) { safeBody.term = safeBody.concept; delete safeBody.concept; }
      delete safeBody.type;

      const { data, error } = await supabase.from('grades').insert([{ ...safeBody, family_id: familyId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.startsWith('/calendar')) {
      const safeBody = { ...body };
      if (safeBody.child_id === '' || safeBody.child_id === undefined) safeBody.child_id = null;
      if (safeBody.start_time === '') safeBody.start_time = null;
      if (safeBody.end_time === '') safeBody.end_time = null;
      if (safeBody.start_time != null && safeBody.time == null) safeBody.time = safeBody.start_time;
      delete safeBody.start_time;
      delete safeBody.end_time;

      const { data, error } = await supabase.from('calendar_events').insert([{ ...safeBody, family_id: familyId, created_by: userId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }
    
    if (path.startsWith('/tasks')) {
      const safeBody = { ...body };
      delete safeBody.allowance_rule;
      if (safeBody.end_date === '') safeBody.end_date = null;
      if (safeBody.due_time === '') safeBody.due_time = null;
      if (safeBody.start_date === '') safeBody.start_date = null;

      const { data, error } = await supabase.from('tasks').insert([{ ...safeBody, family_id: familyId, created_by: userId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/allowance/rewards') {
      const { data, error } = await supabase.from('rewards').insert([{ ...body, family_id: familyId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const redeemMatch = path.match(/^\/allowance\/rewards\/([^/]+)\/redeem$/);
    if (redeemMatch) {
      const rewardId = redeemMatch[1];
      let childId = body?.child_id;
      if (!childId) {
        const { data: ch } = await supabase.from('children').select('id').eq('user_id', userId).maybeSingle();
        childId = ch?.id;
      }
      if (!childId) throw new Error('child_id obrigatório para resgate');
      const { data, error } = await supabase
        .from('redemptions')
        .insert([{ reward_id: rewardId, child_id: childId, status: 'pending', id: uuidv4() }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/allowance/goals') {
      const { data, error } = await supabase.from('savings_goals').insert([{ ...body, family_id: familyId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/allowance/piggy-requests') {
      const { data, error } = await supabase.from('piggy_requests').insert([{ ...body, family_id: familyId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/families/children') {
      if (body?.email && String(body.email).trim()) {
        throw new Error('Criar criança com email de login requer Edge Function (service role). Crie sem email ou convide pelo Supabase Dashboard.');
      }
      const { data, error } = await supabase
        .from('children')
        .insert([{
          name: body.name,
          age: body.age ?? null,
          birthday: body.birthday || null,
          color: body.color || '#6C5CE7',
          avatar_preset: body.avatar_preset || 'explorer',
          nickname: body.nickname || null,
          emoji: body.emoji || null,
          notes: body.notes || null,
          family_id: familyId,
          id: uuidv4(),
        }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/families/members' || path === '/families/relatives') {
      throw new Error('Convite de utilizadores com email requer Edge Function ou Supabase Dashboard (Auth).');
    }

    if (path === '/gamification/medals') {
      const { data, error } = await supabase.from('medals').insert([{ ...body, family_id: familyId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.startsWith('/mural/notices')) {
      const m = path.match(/^\/mural\/notices\/([^/]+)\/(read|confirm|complete|archive)$/);
      if (m) {
        const [, noticeId, action] = m;
        if (action === 'read') {
          await supabase.from('notice_reads').upsert(
            { notice_id: noticeId, user_id: userId, read_at: new Date().toISOString() },
            { onConflict: 'notice_id,user_id' },
          );
          return { data: { ok: true } };
        }
        const statusMap = { complete: 'completed', archive: 'archived', confirm: 'active' };
        const st = statusMap[action];
        if (st) {
          await supabase.from('family_notices').update({ status: st }).eq('id', noticeId).eq('family_id', familyId);
        }
        return { data: { ok: true } };
      }
      if (path === '/mural/notices') {
        const { data, error } = await supabase
          .from('family_notices')
          .insert([{ ...body, family_id: familyId, created_by: userId, id: uuidv4() }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { data };
      }
    }

    if (path === '/allowance/cycles/current') {
      const { child_id } = body;
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const { data: existing } = await supabase
        .from('allowance_cycles')
        .select('*')
        .eq('child_id', child_id)
        .eq('month', month)
        .eq('year', year)
        .eq('status', 'open')
        .maybeSingle();
      if (existing) return { data: existing };
      const { data: settings } = await supabase.from('allowance_settings').select('base_amount, allow_accumulation').eq('child_id', child_id).maybeSingle();
      const base = settings?.base_amount ?? 0;
      const { data: prevRow } = await supabase
        .from('allowance_cycles')
        .select('final_amount')
        .eq('child_id', child_id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();
      const opening = settings?.allow_accumulation && prevRow?.final_amount != null ? Number(prevRow.final_amount) : 0;
      const { data: inserted, error } = await supabase
        .from('allowance_cycles')
        .insert({
          family_id: familyId,
          child_id,
          month,
          year,
          status: 'open',
          opening_balance: opening,
          base_amount: base,
        })
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { data: inserted || {} };
    }

    if (path === '/allowance/transactions/manual') {
      const { data } = await supabase.from('allowance_transactions').insert({ family_id: familyId, child_id: body.child_id, cycle_id: body.cycle_id, type: body.type, amount: body.amount, description: body.description }).select();
      
      const amount = body.type === 'credit' ? body.amount : -body.amount;
      const { data: cycle } = await supabase.from('allowance_cycles').select('manual_adjustments').eq('id', body.cycle_id).single();
      const currentAdj = cycle?.manual_adjustments || 0;
      await supabase.from('allowance_cycles').update({ manual_adjustments: currentAdj + amount }).eq('id', body.cycle_id);

      return { data: data?.[0] || {} };
    }

    if (path.startsWith('/allowance/cycles/') && path.endsWith('/close')) {
      const cycleId = path.split('/')[3];
      await supabase.from('allowance_cycles').update({ status: 'closed' }).eq('id', cycleId);
      return { data: { ok: true } };
    }

    if (path.startsWith('/allowance/cycles/') && path.endsWith('/pay')) {
      const cycleId = path.split('/')[3];
      await supabase.from('allowance_cycles').update({ status: 'paid' }).eq('id', cycleId);
      return { data: { ok: true } };
    }

    let table = path.split('/')[1];
    let safeBody = { ...body };
    if (table === 'calendar') table = 'calendar_events';
    if (table === 'health') {
      if (path.includes('appointments')) table = 'health_appointments';
      else if (path.includes('medication-logs')) table = 'health_medication_logs';
      else if (path.includes('medications')) table = 'medications';
      else if (path.includes('records')) table = 'health_records';
      
      Object.keys(safeBody).forEach(k => { if (safeBody[k] === '') safeBody[k] = null; });
    }

    try {
      const { data } = await supabase.from(table).insert([{ ...safeBody, family_id: familyId, id: uuidv4() }]).select().single();
      return { data };
    } catch {
      return { data: { ok: true } };
    }
  },

  async put(url, body, config = {}) {
    const path = url.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (path.startsWith('/push/')) {
      return { data: { ok: true } };
    }

    if (path.startsWith('/master/')) {
      const role = await getUserRole();
      if (role !== 'master') throw new Error('Acesso negado');
      if (/\/master\/families\/[^/]+\/status$/.test(path)) {
        const fid = parts[2];
        await supabase.from('families').update({ status: body.status }).eq('id', fid);
        return { data: { ok: true } };
      }
      if (/\/master\/users\/[^/]+\/status$/.test(path)) {
        const uid = parts[2];
        await supabase.from('users').update({ status: body.status }).eq('id', uid);
        return { data: { ok: true } };
      }
      if (/\/master\/subscriptions\/[^/]+$/.test(path)) {
        const fid = parts[2];
        await supabase.from('families').update({ plan: body.plan, status: body.status }).eq('id', fid);
        return { data: { ok: true } };
      }
      throw new Error('Operação master não suportada');
    }

    if (path.startsWith('/auth/password')) {
      const newPassword = body?.newPassword;
      if (!newPassword || String(newPassword).length < 4) throw new Error('Senha inválida');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      if (userId) await supabase.from('users').update({ must_change_password: false }).eq('id', userId);
      return { data: { ok: true } };
    }

    if (path.startsWith('/auth/avatar')) {
      const familyId = await getFamilyId();
      if (!familyId) throw new Error('Not authenticated');
      const childMatch = path.match(/^\/auth\/avatar\/child\/([^/]+)$/);
      const childId = childMatch ? childMatch[1] : null;
      const bucket = 'avatars';
      if (body instanceof FormData) {
        const preset = body.get('avatar_preset');
        const file = body.get('avatar');
        if (file && typeof file === 'object' && file.size > 0) {
          const ext = (file.name && String(file.name).split('.').pop()) || 'jpg';
          const filePath = childId ? `${familyId}/child-${childId}-${Date.now()}.${ext}` : `${familyId}/user-${userId}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true, contentType: file.type || undefined });
          if (upErr) throw new Error(upErr.message);
          const rel = `${bucket}/${filePath}`;
          if (childId) {
            await supabase.from('children').update({ avatar_url: rel, avatar_preset: null }).eq('id', childId).eq('family_id', familyId);
          } else {
            await supabase.from('users').update({ avatar_url: rel }).eq('id', userId);
          }
          return { data: { avatar_url: rel, avatar_preset: preset || null } };
        }
        if (preset) {
          if (childId) {
            await supabase.from('children').update({ avatar_preset: preset, avatar_url: null }).eq('id', childId).eq('family_id', familyId);
          } else {
            await supabase.from('users').update({ avatar_preset: preset }).eq('id', userId);
          }
          return { data: { avatar_preset: preset } };
        }
      } else if (body && body.avatar_preset) {
        if (childId) {
          await supabase.from('children').update({ avatar_preset: body.avatar_preset }).eq('id', childId).eq('family_id', familyId);
        } else {
          await supabase.from('users').update({ avatar_preset: body.avatar_preset }).eq('id', userId);
        }
        return { data: { avatar_preset: body.avatar_preset } };
      }
      throw new Error('Envie avatar (ficheiro) ou avatar_preset');
    }

    const familyId = await getFamilyId();
    if (!familyId) throw new Error('Not authenticated');

    const table = parts[0];
    const id = parts[1];
    const action = parts[2];

    if (path === '/families/modules') {
      const mods = body?.modules || {};
      for (const [module_key, is_enabled] of Object.entries(mods)) {
        await supabase.from('family_modules').upsert(
          {
            family_id: familyId,
            module_key,
            is_enabled: !!is_enabled,
            updated_at: new Date().toISOString(),
            updated_by: userId,
          },
          { onConflict: 'family_id,module_key' },
        );
      }
      return { data: { modules: mods } };
    }

    if (path === '/families' || path === '/families/') {
      const { data, error } = await supabase.from('families').update({ ...body }).eq('id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/families/logo') {
      if (!(body instanceof FormData) || !body.get('logo')) throw new Error('Envie logo (FormData)');
      const file = body.get('logo');
      const ext = (file.name && String(file.name).split('.').pop()) || 'png';
      const filePath = `${familyId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('family-images').upload(filePath, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);
      const rel = `family-images/${filePath}`;
      await supabase.from('families').update({ logo_url: rel }).eq('id', familyId);
      return { data: { logo_url: rel } };
    }

    if (path === '/notifications/read-all') {
      await supabase.from('notifications').update({ is_read: true }).eq('family_id', familyId);
      return { data: { ok: true } };
    }

    if (table === 'shopping' && action === 'buy') {
      const { data } = await supabase.from('shopping_list').update({ is_bought: true, bought_by: userId, price: body?.price || 0, bought_at: new Date().toISOString() }).eq('id', id).eq('family_id', familyId).select().single();
      return { data };
    }

    if (table === 'shopping' && action === 'unbuy') {
      const { data } = await supabase.from('shopping_list').update({ is_bought: false, bought_by: null, price: 0, bought_at: null }).eq('id', id).eq('family_id', familyId).select().single();
      return { data };
    }

    const completeMatch = path.match(/^\/tasks\/occurrences\/([^/]+)\/complete$/);
    if (completeMatch) {
      const occId = completeMatch[1];
      const { data: occ, error: oErr } = await supabase.from('task_occurrences').select('*, tasks(*)').eq('id', occId).eq('family_id', familyId).single();
      if (oErr || !occ) throw new Error('Ocorrência não encontrada');
      const task = occ.tasks;
      if (task?.is_health_reminder) {
        const raw = body?.health_intake ?? body?.intake;
        if (raw == null || raw === '') throw new Error('Informe health_intake: taken ou skipped.');
        const intake = raw === 'skipped' || raw === false || raw === 'não' || raw === 'nao' || raw === 'not_taken' ? 'skipped' : 'taken';
        const { error } = await supabase
          .from('task_occurrences')
          .update({ status: 'completed', health_intake: intake, health_confirmed_by: userId, completed_at: new Date().toISOString() })
          .eq('id', occId);
        if (error) throw new Error(error.message);
        return { data: { message: 'Registo guardado', status: 'completed', health_intake: intake } };
      }
      const newStatus = task?.requires_approval ? 'waiting_approval' : 'completed';
      const { error } = await supabase
        .from('task_occurrences')
        .update({ status: newStatus, completed_at: new Date().toISOString() })
        .eq('id', occId);
      if (error) throw new Error(error.message);
      return { data: { message: 'Ocorrência atualizada', status: newStatus } };
    }

    const approveMatch = path.match(/^\/tasks\/occurrences\/([^/]+)\/approve$/);
    if (approveMatch) {
      const occId = approveMatch[1];
      const approved = !!body?.approved;
      const patch = approved
        ? { status: 'approved', approved_at: new Date().toISOString(), approved_by: userId }
        : { status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: userId, rejection_reason: body?.rejection_reason || null };
      const { data, error } = await supabase.from('task_occurrences').update(patch).eq('id', occId).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.match(/^\/gamification\/medals\/[^/]+$/)) {
      const mid = parts[2];
      const { data, error } = await supabase.from('medals').update({ ...body }).eq('id', mid).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.match(/^\/allowance\/rewards\/[^/]+$/)) {
      const rid = parts[2];
      const { data, error } = await supabase.from('rewards').update({ ...body }).eq('id', rid).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.match(/^\/allowance\/goals\/[^/]+$/)) {
      const gid = parts[2];
      const { data, error } = await supabase.from('savings_goals').update({ ...body }).eq('id', gid).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.match(/^\/allowance\/redemptions\/[^/]+\/approve$/)) {
      const rid = parts[2];
      const patch = { status: body?.approved ? 'approved' : 'rejected', approved_by: userId, approved_at: new Date().toISOString() };
      const { data, error } = await supabase.from('redemptions').update(patch).eq('id', rid).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.startsWith('/allowance/settings/')) {
      const segs = path.split('/').filter(Boolean);
      const childId = segs[2];
      const { data, error } = await supabase.from('allowance_settings').upsert({ ...body, family_id: familyId, child_id: childId }).select().single();
      if (error) throw new Error(error.message);
      return { data: data || {} };
    }

    if (path.startsWith('/allowance/piggy-requests/') && path.endsWith('/review')) {
      const segs = path.split('/').filter(Boolean);
      const reqId = segs[2];
      const { data, error } = await supabase
        .from('piggy_requests')
        .update({ status: body.approved ? 'approved' : 'rejected', review_note: body.review_note })
        .eq('id', reqId)
        .eq('family_id', familyId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const occUpdateOnly = path.match(/^\/tasks\/occurrences\/([^/]+)$/);
    if (occUpdateOnly) {
      const occId = occUpdateOnly[1];
      const { data, error } = await supabase.from('task_occurrences').update({ ...body }).eq('id', occId).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const safeBody = { ...body };
    if (table === 'tasks') {
      delete safeBody.allowance_rule;
      if (safeBody.end_date === '') safeBody.end_date = null;
      if (safeBody.due_time === '') safeBody.due_time = null;
      if (safeBody.start_date === '') safeBody.start_date = null;
    } else if (table === 'calendar_events' || table === 'calendar') {
      if (safeBody.child_id === '') safeBody.child_id = null;
      if (safeBody.start_time === '') safeBody.start_time = null;
      if (safeBody.end_time === '') safeBody.end_time = null;
      if (safeBody.start_time != null && safeBody.time == null) safeBody.time = safeBody.start_time;
      delete safeBody.start_time;
      delete safeBody.end_time;
    } else if (table === 'grades') {
      if ('score' in safeBody) { safeBody.grade_value = safeBody.score; delete safeBody.score; }
      if ('max_score' in safeBody) { safeBody.max_value = safeBody.max_score; delete safeBody.max_score; }
      if ('observation' in safeBody) { safeBody.notes = safeBody.observation; delete safeBody.observation; }
      if ('concept' in safeBody) { safeBody.term = safeBody.concept; delete safeBody.concept; }
      delete safeBody.type;
    }

    let targetTable = table;
    if (targetTable === 'calendar') targetTable = 'calendar_events';
    if (targetTable === 'health') {
      if (path.includes('appointments')) targetTable = 'health_appointments';
      else if (path.includes('medication-logs')) targetTable = 'health_medication_logs';
      else if (path.includes('medications')) targetTable = 'medications';
      else if (path.includes('records')) targetTable = 'health_records';
      
      Object.keys(safeBody).forEach(k => { if (safeBody[k] === '') safeBody[k] = null; });
    }

    const { data, error } = await supabase.from(targetTable).update(safeBody).eq('id', id).eq('family_id', familyId).select().single();
    if (error) throw new Error(error.message);
    return { data };
  },

  async delete(url, config = {}) {
    const path = url.split('?')[0];
    const parts = path.split('/').filter(Boolean);

    if (path.startsWith('/push/')) {
      return { data: { success: true } };
    }

    const familyId = await getFamilyId();
    if (!familyId) throw new Error('Not authenticated');

    const table = parts[0];
    const id = parts[1];

    if (path === '/families/logo') {
      await supabase.from('families').update({ logo_url: null }).eq('id', familyId);
      return { data: { success: true } };
    }

    if (path.match(/^\/gamification\/medals\/[^/]+$/)) {
      const mid = parts[2];
      await supabase.from('medals').delete().eq('id', mid);
      return { data: { success: true } };
    }

    if (path.startsWith('/allowance/piggy-requests/')) {
      const rid = parts[2];
      await supabase.from('piggy_requests').delete().eq('id', rid).eq('family_id', familyId);
      return { data: { success: true } };
    }

    let targetTable = table;
    if (targetTable === 'calendar') targetTable = 'calendar_events';
    if (targetTable === 'health') {
      if (path.includes('appointments')) targetTable = 'health_appointments';
      else if (path.includes('medication-logs')) targetTable = 'health_medication_logs';
      else if (path.includes('medications')) targetTable = 'medications';
      else if (path.includes('records')) targetTable = 'health_records';
    }

    await supabase.from(targetTable).delete().eq('id', id).eq('family_id', familyId);
    return { data: { success: true } };
  }
};

export default api;
