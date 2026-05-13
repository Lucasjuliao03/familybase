import { supabase } from '../lib/supabase';

// Exportando apiOrigin para compatibilidade com componentes que buscam imagens
export const apiOrigin = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public`
  : '';

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

const api = {
  defaults: { headers: { common: {} } },
  interceptors: { request: { use: () => {} }, response: { use: () => {} } },

  async get(url, config = {}) {
    const familyId = await getFamilyId();
    if (!familyId && !url.includes('/auth/')) throw new Error('Not authenticated');

    const path = url.split('?')[0];

    if (path.startsWith('/grades')) {
      const { data } = await supabase.from('grades').select('*, children:child_id(name, color, avatar_url)').eq('family_id', familyId).order('date', { ascending: false });
      return { data: (data || []).map(d => ({ ...d, child_name: d.children?.name, child_color: d.children?.color, avatar_url: d.children?.avatar_url })) };
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
      const { data } = await supabase.from('users').select('*').eq('family_id', familyId).in('role', ['parent', 'gestor']);
      return { data: data || [] };
    }

    if (path === '/families/relatives') {
      const { data } = await supabase.from('users').select('*').eq('family_id', familyId).in('role', ['parente', 'aux']);
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
      const defaultModules = [
        { module_key: 'tasks', is_premium: false },
        { module_key: 'routines', is_premium: false },
        { module_key: 'calendar', is_premium: false },
        { module_key: 'allowance', is_premium: true },
        { module_key: 'family_shop', is_premium: true },
        { module_key: 'medals', is_premium: false },
        { module_key: 'grades', is_premium: false },
        { module_key: 'piggy_bank', is_premium: true },
        { module_key: 'goals', is_premium: true },
        { module_key: 'reports', is_premium: false },
        { module_key: 'notifications', is_premium: false },
        { module_key: 'shopping', is_premium: false },
        { module_key: 'health', is_premium: true },
        { module_key: 'mural', is_premium: false }
      ];
      try {
        const { data: family } = await supabase.from('families').select('active_modules').eq('id', familyId).single();
        const savedMods = family?.active_modules || {};
        const hasSavedMods = Object.keys(savedMods).length > 0;

        const mergedList = defaultModules.map(m => ({
          ...m,
          is_enabled: hasSavedMods ? !!savedMods[m.module_key] : true,
          can_enable: true
        }));
        return { data: { modules: mergedList, planAllowsPremium: true } };
      } catch {
        return { data: { modules: defaultModules.map(m => ({ ...m, is_enabled: true, can_enable: true })), planAllowsPremium: true } };
      }
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
        const res = await supabase.from('reward_redemptions').select('*', { count: 'exact', head: true }).eq('family_id', familyId).eq('status', 'pending');
        pendingRedemptions = res.count || 0;
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
    const familyId = await getFamilyId();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const path = url.split('?')[0];

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
      delete safeBody.child_id;
      if (safeBody.start_time === '') safeBody.start_time = null;
      if (safeBody.end_time === '') safeBody.end_time = null;

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

    if (path.startsWith('/mural/notices') && path.endsWith('/read')) {
      const noticeId = path.split('/')[3];
      await supabase.from('notice_reads').upsert({ notice_id: noticeId, user_id: userId, read_at: new Date().toISOString() });
      return { data: { ok: true } };
    }

    if (path === '/allowance/cycles/current') {
      const { data } = await supabase.from('allowance_cycles').insert({ family_id: familyId, child_id: body.child_id, month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: 'open' }).select();
      return { data: data?.[0] || {} };
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
    const parts = path.split('/');
    const table = parts[1];
    const id = parts[2];
    const action = parts[3];
    const familyId = await getFamilyId();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (path === '/families/modules') {
      const { data: family, error: fetchErr } = await supabase.from('families').select('active_modules').eq('id', familyId).single();
      if (fetchErr) console.error("FamilyBase: Erro ao ler active_modules:", fetchErr);
      
      const defaultMods = { tasks: true, calendar: true, routines: true, medals: true, reports: true, shopping: true, mural: true, family_shop: true, allowance: true, piggy_bank: true, goals: true, notifications: true, health: true };
      const currentMods = family?.active_modules || {};
      const hasSavedMods = Object.keys(currentMods).length > 0;
      
      // Se nunca foi salvo, parte do princípio que todos estão ativos
      const baseMods = hasSavedMods ? currentMods : defaultMods;
      const nextMods = { ...baseMods, ...body.modules };
      
      console.log("FamilyBase: Tentando gravar novos módulos:", nextMods);
      const { error: updateErr } = await supabase.from('families').update({ active_modules: nextMods }).eq('id', familyId);
      if (updateErr) {
        console.error("FamilyBase: Erro FATAL ao gravar no Supabase:", updateErr);
        throw new Error(updateErr.message || "Erro no banco de dados");
      }
      
      return { data: { modules: nextMods } };
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
    
    if (table === 'tasks' && action === 'occurrences') {
       const occId = parts[3];
       const { data } = await supabase.from('task_occurrences').update(body).eq('id', occId).eq('family_id', familyId).select().single();
       return { data };
    }

    if (path.startsWith('/allowance/settings/')) {
      const childId = path.split('/')[3];
      const { data } = await supabase.from('allowance_settings').upsert({ ...body, family_id: familyId, child_id: childId }).select().single();
      return { data: data || {} };
    }

    if (path.startsWith('/allowance/piggy-requests/') && path.endsWith('/review')) {
      const reqId = path.split('/')[3];
      const { data } = await supabase.from('piggy_requests').update({ status: body.approved ? 'approved' : 'rejected', review_note: body.review_note }).eq('id', reqId).select().single();
      return { data };
    }

    const safeBody = { ...body };
    if (table === 'tasks') {
      delete safeBody.allowance_rule;
      if (safeBody.end_date === '') safeBody.end_date = null;
      if (safeBody.due_time === '') safeBody.due_time = null;
      if (safeBody.start_date === '') safeBody.start_date = null;
    } else if (table === 'calendar_events' || table === 'calendar') {
      delete safeBody.child_id;
      if (safeBody.start_time === '') safeBody.start_time = null;
      if (safeBody.end_time === '') safeBody.end_time = null;
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
    const parts = path.split('/');
    const table = parts[1];
    const id = parts[2];
    const familyId = await getFamilyId();

    if (path.startsWith('/allowance/piggy-requests/')) {
      await supabase.from('piggy_requests').delete().eq('id', id).eq('family_id', familyId);
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
