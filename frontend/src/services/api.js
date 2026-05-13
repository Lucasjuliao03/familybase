import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Cliente secundário para permitir registo de novos membros/crianças sem encerrar a sessão atual (master/parent)
const supabaseSecondary = BASE_URL && ANON_KEY ? createClient(BASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

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

function omitUndefined(obj) {
  const out = { ...obj };
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });
  return out;
}

/** Remove null e undefined (útil para colunas opcionais que ainda não existem na BD). */
function omitNullish(obj) {
  const out = { ...obj };
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined || out[k] === null) delete out[k];
  });
  return out;
}

// Verifica e atribui medalhas à criança após aprovação de tarefa
async function checkAndAwardMedals(supabase, childId, familyId, currentStreak) {
  try {
    // Contar tarefas aprovadas
    const { count: taskCount } = await supabase
      .from('task_occurrences')
      .select('*', { count: 'exact', head: true })
      .eq('child_id', childId)
      .eq('status', 'approved');

    // Obter medalhas disponíveis (família + globais)
    const { data: medals } = await supabase
      .from('medals')
      .select('*')
      .eq('is_active', true)
      .or(`family_id.eq.${familyId},family_id.is.null`);

    if (!medals?.length) return;

    // Medalhas já conquistadas
    const { data: earned } = await supabase
      .from('earned_medals')
      .select('medal_id')
      .eq('child_id', childId);
    const earnedIds = new Set((earned || []).map(e => e.medal_id));

    const toAward = [];
    let bonusPoints = 0;

    for (const medal of medals) {
      if (earnedIds.has(medal.id)) continue;
      let qualified = false;
      if (medal.requirement_type === 'task_count' && taskCount >= (medal.requirement_value || 1)) qualified = true;
      if (medal.requirement_type === 'task_streak' && currentStreak >= (medal.requirement_value || 1)) qualified = true;
      if (qualified) {
        toAward.push({ id: uuidv4(), medal_id: medal.id, child_id: childId });
        bonusPoints += medal.extra_points || 0;
      }
    }

    if (toAward.length) {
      await supabase.from('earned_medals').upsert(toAward, { onConflict: 'medal_id,child_id', ignoreDuplicates: true });
      if (bonusPoints > 0) {
        const { data: ch } = await supabase.from('children').select('points').eq('id', childId).single();
        if (ch) await supabase.from('children').update({ points: (ch.points || 0) + bonusPoints }).eq('id', childId);
      }
    }
  } catch (err) {
    console.warn('Medal check failed:', err.message);
  }
}

function toYMDLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDbDate(val) {
  if (val == null || val === '') return null;
  const s = String(val);
  if (s.length >= 10 && s[4] === '-') return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return toYMDLocal(new Date(t));
  return s;
}

function normalizeTimeForDb(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

function mapCalendarEventFromDb(d) {
  if (!d) return d;
  return {
    ...d,
    date: normalizeDbDate(d.date),
    end_date: d.end_date != null ? normalizeDbDate(d.end_date) : d.end_date,
    time: d.time != null ? String(d.time).slice(0, 8) : d.time,
    child_name: d.children?.name,
    child_color: d.children?.color,
  };
}

/** Gera ocorrências após criar tarefa (sem cron no Supabase). */
function computeOccurrenceDatesForTask(task) {
  const out = [];
  const add = (s) => {
    const n = normalizeDbDate(s);
    if (n && !out.includes(n)) out.push(n);
  };
  const parseLocal = (s) => {
    if (!s || typeof s !== 'string') return new Date();
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  };
  const startStr = task.start_date || toYMDLocal();
  const start = parseLocal(startStr);
  const endStr = task.end_date;
  const end = endStr ? parseLocal(endStr) : new Date(start.getTime() + 120 * 86400000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const freq = task.frequency || 'once';
  const recurrence = String(task.recurrence_days || '')
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  if (freq === 'once' || !task.is_recurring) {
    add(startStr);
    return out;
  }

  let iter = new Date(Math.min(start.getTime(), today.getTime()));
  const limit = new Date(Math.max(today.getTime(), start.getTime()) + 45 * 86400000);
  const endCap = new Date(Math.min(end.getTime(), limit.getTime()));

  while (iter <= endCap) {
    const ds = toYMDLocal(iter);
    if (iter >= start) {
      if (freq === 'daily') add(ds);
      else if (freq === 'weekly') {
        const days = recurrence.length ? recurrence : [start.getDay()];
        if (days.includes(iter.getDay())) add(ds);
      } else if (freq === 'monthly') {
        if (iter.getDate() === start.getDate()) add(ds);
      } else add(ds);
    }
    iter.setDate(iter.getDate() + 1);
  }
  if (!out.length) add(startStr);
  return out.sort();
}

/** Notas escolares: tabela `grades` usa score, max_score, observation, concept (supabase_missing_tables). */
function normalizeGradeRow(body, familyId, idOverride) {
  const id = idOverride || body.id || uuidv4();
  const gradeTypeMap = { homework: 'assignment', project: 'other', participation: 'other', concept: 'test' };
  let gtype = body.type || 'test';
  if (gradeTypeMap[gtype]) gtype = gradeTypeMap[gtype];
  const allowedGrade = new Set(['test', 'assignment', 'exam', 'quiz', 'other']);
  if (!allowedGrade.has(gtype)) gtype = 'test';
  const row = omitUndefined({
    id,
    family_id: familyId,
    subject: body.subject,
    type: gtype,
    date: normalizeDbDate(body.date) || toYMDLocal(),
    child_id: body.child_id,
    score: body.score != null ? Number(body.score) : body.grade_value != null ? Number(body.grade_value) : null,
    max_score: body.max_score != null ? Number(body.max_score) : body.max_value != null ? Number(body.max_value) : 10,
    concept: body.concept ?? body.term ?? null,
    observation: body.observation ?? body.notes ?? null,
  });
  return row;
}

function mapGradeFromDb(d) {
  if (!d) return d;
  return {
    ...d,
    score: d.score ?? d.grade_value,
    max_score: d.max_score ?? d.max_value,
    observation: d.observation ?? d.notes,
    concept: d.concept ?? d.term,
    child_name: d.children?.name,
    child_color: d.children?.color,
    avatar_url: d.children?.avatar_url,
    avatar_preset: d.children?.avatar_preset,
  };
}

const CAL_EVENT_FIELDS = ['title', 'description', 'date', 'time', 'end_date', 'type', 'color', 'child_id', 'visible_to_child', 'visibility'];

function pickCalendarRow(body, familyId, userId, withId) {
  const row = {};
  CAL_EVENT_FIELDS.forEach((k) => {
    if (body[k] !== undefined) row[k] = body[k];
  });
  if (row.type === 'child') row.type = 'activity';
  row.date = normalizeDbDate(row.date ?? body.date);
  if (row.child_id === '' || row.child_id === undefined) row.child_id = null;
  const rawTime = row.time !== undefined ? row.time : body.time;
  row.time = normalizeTimeForDb(rawTime);
  if (row.time == null) {
    const st = body.start_time;
    if (st != null && st !== '') row.time = normalizeTimeForDb(st);
  }
  if (row.end_date === '' || row.end_date === undefined) row.end_date = null;
  else row.end_date = normalizeDbDate(row.end_date);
  if (body.end_date != null && row.end_date == null && body.end_date !== '') row.end_date = normalizeDbDate(body.end_date);
  row.family_id = familyId;
  row.created_by = userId || null;
  if (withId) row.id = body.id || uuidv4();
  const allowedTypes = new Set(['family', 'school', 'medical', 'birthday', 'activity', 'task', 'reminder', 'other']);
  if (row.type != null && !allowedTypes.has(row.type)) row.type = 'family';
  return omitUndefined(row);
}

const FAMILY_PATCH_KEYS = new Set([
  'name', 'language', 'plan', 'status', 'contact_email', 'contact_phone', 'emoji', 'primary_color', 'secondary_color', 'logo_url',
]);

function pickFamilyPatch(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  FAMILY_PATCH_KEYS.forEach((k) => {
    if (body[k] !== undefined) out[k] = body[k];
  });
  return out;
}

function apptExtraFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return {};
  try {
    const o = JSON.parse(notes);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch { /* ignore */ }
  return { reason: notes };
}

function apptNotesSerialize(body) {
  const extra = {
    reason: body.reason ?? null,
    diagnosis_notes: body.diagnosis_notes ?? null,
    attachment_urls: body.attachment_urls ?? null,
    needs_followup: !!body.needs_followup,
    followup_date: body.followup_date || null,
  };
  return JSON.stringify(extra);
}

function mapAppointmentFromDb(a, childName) {
  const extra = apptExtraFromNotes(a.notes);
  const att = extra.attachment_urls ?? (Array.isArray(a.attachment_urls) ? a.attachment_urls : null);
  return {
    ...a,
    appointment_date: a.appointment_date ?? a.date,
    appointment_time: a.appointment_time ?? a.time ?? '',
    professional_name: a.professional_name ?? a.doctor_name ?? '',
    reason: extra.reason ?? '',
    diagnosis_notes: extra.diagnosis_notes ?? '',
    attachment_urls: att ?? [],
    needs_followup: !!extra.needs_followup,
    followup_date: extra.followup_date ?? null,
    child_name: childName || a.children?.name || '—',
  };
}

/** /health/records/:id → { table, id } */
function parseHealthSubResource(path) {
  const p = path.split('/').filter(Boolean);
  if (p[0] !== 'health' || p.length < 3) return null;
  const sub = p[1];
  const id = p[2];
  const map = {
    records: 'health_records',
    appointments: 'health_appointments',
    medications: 'medications',
    'medication-logs': 'health_medication_logs',
  };
  const table = map[sub];
  if (!table) return null;
  return { table, id };
}

const HEALTH_RECORD_FIELDS = [
  'child_id', 'patient_user_id', 'record_type', 'symptoms', 'temperature', 'severity', 'status', 'notes',
  'medication_given', 'stayed_home', 'record_date', 'record_time', 'attachment_urls', 'inactive',
];

function buildHealthRecordInsert(body, familyId, userId) {
  const row = { id: uuidv4(), family_id: familyId, created_by: userId };
  HEALTH_RECORD_FIELDS.forEach((k) => {
    if (body[k] !== undefined) row[k] = body[k];
  });
  if (row.child_id === '') row.child_id = null;
  if (row.patient_user_id === '') row.patient_user_id = null;
  row.record_date = normalizeDbDate(row.record_date);
  if (!row.record_date) throw new Error('Data do registo é obrigatória.');
  if (row.record_time === '' || row.record_time === undefined) row.record_time = null;
  else row.record_time = normalizeTimeForDb(row.record_time);
  if (Array.isArray(row.attachment_urls)) row.attachment_urls = JSON.stringify(row.attachment_urls);
  return omitNullish(omitUndefined(row));
}

const MEDICATION_FIELDS = [
  'child_id', 'patient_user_id', 'name', 'dosage', 'frequency', 'start_date', 'end_date', 'scheduled_time', 'scheduled_times',
  'notes', 'prescription_image_url', 'attachment_urls', 'status',
];

function buildMedicationInsert(body, familyId, userId) {
  const row = { id: uuidv4(), family_id: familyId, created_by: userId };
  MEDICATION_FIELDS.forEach((k) => {
    if (body[k] !== undefined) row[k] = body[k];
  });
  if (row.child_id === '') row.child_id = null;
  if (row.patient_user_id === '') row.patient_user_id = null;
  if (Array.isArray(row.scheduled_times)) row.scheduled_times = JSON.stringify(row.scheduled_times);
  if (Array.isArray(row.attachment_urls)) row.attachment_urls = JSON.stringify(row.attachment_urls);
  return omitNullish(omitUndefined(row));
}

function buildAppointmentInsert(body, familyId) {
  const date = normalizeDbDate(body.appointment_date ?? body.date);
  const time = normalizeTimeForDb(body.appointment_time ?? body.time);
  return omitNullish(omitUndefined({
    id: uuidv4(),
    family_id: familyId,
    child_id: body.child_id === '' ? undefined : body.child_id ?? undefined,
    patient_user_id: body.patient_user_id === '' ? undefined : body.patient_user_id ?? undefined,
    title: (body.reason && String(body.reason).slice(0, 200)) || body.specialty || 'Consulta',
    doctor_name: body.professional_name || null,
    specialty: body.specialty || null,
    date,
    time,
    location: body.location || null,
    notes: apptNotesSerialize(body),
    status: body.status || 'scheduled',
  }));
}

function buildAppointmentUpdate(body) {
  return omitUndefined({
    child_id: body.child_id === '' ? null : body.child_id ?? undefined,
    patient_user_id: body.patient_user_id === '' ? null : body.patient_user_id ?? undefined,
    title: (body.reason && String(body.reason).slice(0, 200)) || body.specialty || body.title || undefined,
    doctor_name: body.professional_name ?? body.doctor_name,
    specialty: body.specialty,
    date: body.appointment_date ?? body.date,
    time: body.appointment_time ?? body.time ?? null,
    location: body.location,
    notes: apptNotesSerialize(body),
    status: body.status,
  });
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
      let q = supabase.from('grades').select('*, children:child_id(name, color, avatar_url, avatar_preset)').eq('family_id', familyId);
      const childIdParam = config.params?.child_id;
      if (childIdParam) q = q.eq('child_id', childIdParam);
      const { data } = await q.order('date', { ascending: false });
      return { data: (data || []).map(mapGradeFromDb) };
    }
    
    if (path.startsWith('/calendar')) {
      const params = config.params || {};
      const y = params.year != null ? parseInt(String(params.year), 10) : null;
      const m = params.month != null ? parseInt(String(params.month), 10) : null;
      let q = supabase.from('calendar_events').select('*, children:child_id(name, color)').eq('family_id', familyId).order('date', { ascending: true });
      if (y && m >= 1 && m <= 12) {
        const pad = (n) => String(n).padStart(2, '0');
        const startM = `${y}-${pad(m)}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endM = `${y}-${pad(m)}-${String(lastDay).padStart(2, '0')}`;
        q = q.gte('date', startM).lte('date', endM);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { data: (data || []).map(mapCalendarEventFromDb) };
    }

    if (path.startsWith('/shopping')) {
      const { data } = await supabase
        .from('shopping_list')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      const rows = data || [];
      // Enriquecer com nomes dos utilizadores (registered_by, bought_by)
      const uids = [...new Set([
        ...rows.map(i => i.registered_by).filter(Boolean),
        ...rows.map(i => i.bought_by).filter(Boolean),
      ])];
      let nameMap = {};
      if (uids.length) {
        const { data: users } = await supabase.from('users').select('id, name').in('id', uids);
        (users || []).forEach(u => { nameMap[u.id] = u.name; });
      }
      const mapped = rows.map(i => ({
        ...i,
        registered_by_name: nameMap[i.registered_by] || '',
        bought_by_name: nameMap[i.bought_by] || '',
      }));
      return { data: { pending: mapped.filter(i => !i.is_bought), history: mapped.filter(i => i.is_bought) }};
    }

    if (path.startsWith('/tasks/occurrences')) {
      let q = supabase.from('task_occurrences').select('*, tasks(*)').eq('family_id', familyId);
      const d = config.params?.date || config.params?.occurrence_date;
      if (d) q = q.eq('occurrence_date', String(d).slice(0, 10));
      const childId = config.params?.child_id;
      if (childId) q = q.eq('child_id', childId);
      const statusParam = config.params?.status;
      if (statusParam) q = q.eq('status', statusParam);
      const { data, error } = await q.order('occurrence_date', { ascending: true });
      if (error) throw new Error(error.message);
      const mapOcc = (o) => {
        const t = o.tasks || {};
        return {
          ...o,
          occurrence_date: normalizeDbDate(o.occurrence_date),
          title: t.title,
          description: t.description,
          type: t.type,
          frequency: t.frequency,
          points: t.points,
          coins: t.coins,
          is_recurring: t.is_recurring,
          due_time: t.due_time,
          is_health_reminder: t.is_health_reminder,
        };
      };
      const rows = (data || []).map(mapOcc);
      const childIds = [...new Set(rows.map((r) => r.child_id).filter(Boolean))];
      let colors = {};
      if (childIds.length) {
        const { data: ch } = await supabase.from('children').select('id, name, color').in('id', childIds);
        (ch || []).forEach((c) => { colors[c.id] = { name: c.name, color: c.color }; });
      }
      return {
        data: rows.map((r) => ({
          ...r,
          child_name: colors[r.child_id]?.name,
          child_color: colors[r.child_id]?.color,
        })),
      };
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
      const { data: relUsers } = await supabase.from('users').select('*').eq('family_id', familyId).eq('role', 'relative');
      const users = relUsers || [];
      if (users.length) {
        const uids = users.map((u) => u.id);
        const { data: rcRows } = await supabase.from('relative_children').select('relative_user_id, child_id').in('relative_user_id', uids).eq('family_id', familyId);
        const { data: fmRows } = await supabase.from('family_members').select('user_id, relationship').in('user_id', uids).eq('family_id', familyId);
        const childMap = {};
        (rcRows || []).forEach((r) => {
          if (!childMap[r.relative_user_id]) childMap[r.relative_user_id] = [];
          childMap[r.relative_user_id].push(r.child_id);
        });
        const relMap = {};
        (fmRows || []).forEach((r) => { relMap[r.user_id] = r.relationship; });
        return {
          data: users.map((u) => ({
            ...u,
            linked_child_ids: childMap[u.id] || [],
            relationship: relMap[u.id] || u.relationship || null,
          })),
        };
      }
      return { data: [] };
    }

    if (path === '/gamification/medals') {
      try {
        const [{ data: famMedals }, { data: globalMedals }] = await Promise.all([
          supabase.from('medals').select('*').eq('family_id', familyId).order('created_at', { ascending: true }),
          supabase.from('medals').select('*').is('family_id', null).order('created_at', { ascending: true }),
        ]);
        return { data: [...(famMedals || []), ...(globalMedals || [])] };
      } catch {
        return { data: [] };
      }
    }

    if (path.startsWith('/gamification/child-stats')) {
      const cid = config.params?.child_id;
      if (!cid) return { data: null };
      const { data: child } = await supabase.from('children').select('name, points, coins, xp, xp_next_level, level, streak_current, streak_best').eq('id', cid).maybeSingle();
      const { data: earned } = await supabase.from('earned_medals').select('*, medals(*)').eq('child_id', cid);
      return { data: { ...child, earned_medals: earned || [] } };
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
      let q = supabase.from('savings_goals').select('*').eq('family_id', familyId);
      if (config.params?.child_id) q = q.eq('child_id', config.params.child_id);
      const { data } = await q.order('created_at', { ascending: false });
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
          const val = Number(g.score ?? g.grade_value ?? 0);
          avgBySubject[g.subject].sum += val;
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
      const todayStr = toYMDLocal();
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

      const { data: upcomingRaw } = await supabase.from('calendar_events')
        .select('*, children:child_id(name, color)')
        .eq('family_id', familyId)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(8);

      let recentHistory = [];
      try {
        const { data: hist } = await supabase
          .from('history')
          .select('*, children:child_id(name, color, avatar_url, avatar_preset)')
          .eq('family_id', familyId)
          .order('created_at', { ascending: false })
          .limit(14);
        recentHistory = (hist || []).map((h) => ({
          id: h.id,
          event: h.event,
          points: h.points || 0,
          child_name: h.children?.name || '',
          child_color: h.children?.color,
          avatar_url: h.children?.avatar_url,
          avatar_preset: h.children?.avatar_preset,
        }));
      } catch {
        recentHistory = [];
      }

      if (!recentHistory.length) {
        const { data: occDone } = await supabase
          .from('task_occurrences')
          .select('id, points_awarded, tasks(title), children:child_id(name, color, avatar_url, avatar_preset)')
          .eq('family_id', familyId)
          .in('status', ['approved', 'completed'])
          .order('updated_at', { ascending: false })
          .limit(12);
        recentHistory = (occDone || []).map((o) => ({
          id: o.id,
          event: o.tasks?.title ? `Tarefa: ${o.tasks.title}` : 'Tarefa concluída',
          points: o.points_awarded || 0,
          child_name: o.children?.name || '',
          child_color: o.children?.color,
          avatar_url: o.children?.avatar_url,
          avatar_preset: o.children?.avatar_preset,
        }));
      }

      return {
        data: {
          stats: {
            pending: pending || 0,
            completed: completed || 0,
            approved: approved || 0,
            pendingRedemptions: pendingRedemptions || 0,
          },
          children: children || [],
          upcomingEvents: (upcomingRaw || []).map(mapCalendarEventFromDb),
          recentHistory,
        },
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

    const healthPath = path.split('?')[0];
    const healthSearch = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');

    if (healthPath.startsWith('/health/context')) {
      const { data: children } = await supabase.from('children').select('id, name, user_id').eq('family_id', familyId);
      const { data: adults } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('family_id', familyId)
        .in('role', ['parent', 'relative']);
      const showChildrenTab = (await getUserRole()) === 'parent';
      return { data: { children: children || [], adults: adults || [], showChildrenTab } };
    }

    if (healthPath.startsWith('/health/overview')) {
      const patientUserId = healthSearch.get('patient_user_id');
      const filterChildId = healthSearch.get('child_id');

      let recBase = supabase.from('health_records').select('*, children:child_id(name)').eq('family_id', familyId);
      if (patientUserId) recBase = recBase.eq('patient_user_id', patientUserId);
      else if (filterChildId) recBase = recBase.eq('child_id', filterChildId);
      const { data: allRecords } = await recBase.order('record_date', { ascending: false }).limit(80);

      const patientIds = [...new Set((allRecords || []).map((r) => r.patient_user_id).filter(Boolean))];
      let patientNames = {};
      if (patientIds.length) {
        const { data: pu } = await supabase.from('users').select('id, name').in('id', patientIds);
        (pu || []).forEach((u) => { patientNames[u.id] = u.name; });
      }

      let apptBase = supabase.from('health_appointments').select('*, children:child_id(name)').eq('family_id', familyId).eq('status', 'scheduled');
      if (patientUserId) apptBase = apptBase.eq('patient_user_id', patientUserId);
      else if (filterChildId) apptBase = apptBase.eq('child_id', filterChildId);
      const today = new Date().toISOString().split('T')[0];
      const { data: upcomingRaw } = await apptBase.gte('date', today).order('date', { ascending: true }).order('time', { ascending: true }).limit(8);

      let medBase = supabase.from('medications').select('*, children:child_id(name)').eq('family_id', familyId).eq('status', 'active');
      if (patientUserId) medBase = medBase.eq('patient_user_id', patientUserId);
      else if (filterChildId) medBase = medBase.eq('child_id', filterChildId);
      const { data: activeMeds } = await medBase.order('name', { ascending: true }).limit(20);

      const nameFor = (r) => r.children?.name || (r.patient_user_id && patientNames[r.patient_user_id]) || '—';
      const recentRecords = (allRecords || []).slice(0, 6).map((r) => ({
        ...r,
        child_name: nameFor(r),
      }));
      const monitoring = (allRecords || []).filter((r) => r.status === 'monitoring').map((r) => ({ ...r, child_name: nameFor(r) }));

      return {
        data: {
          upcomingAppointments: (upcomingRaw || []).map((a) => mapAppointmentFromDb(a, a.children?.name)),
          activeMedications: (activeMeds || []).map((m) => ({ ...m, child_name: m.children?.name || '—' })),
          recentRecords,
          monitoring,
        },
      };
    }

    if (healthPath.startsWith('/health/records')) {
      let q = supabase
        .from('health_records')
        .select('*, children:child_id(name)')
        .eq('family_id', familyId);
      if (healthSearch.get('patient_user_id')) q = q.eq('patient_user_id', healthSearch.get('patient_user_id'));
      if (healthSearch.get('child_id')) q = q.eq('child_id', healthSearch.get('child_id'));
      if (healthSearch.get('status')) q = q.eq('status', healthSearch.get('status'));
      if (healthSearch.get('from')) q = q.gte('record_date', healthSearch.get('from'));
      if (healthSearch.get('to')) q = q.lte('record_date', healthSearch.get('to'));
      const { data } = await q.order('record_date', { ascending: false });
      const rows = data || [];
      const pids = [...new Set(rows.map((r) => r.patient_user_id).filter(Boolean))];
      let patientNames = {};
      if (pids.length) {
        const { data: pu } = await supabase.from('users').select('id, name').in('id', pids);
        (pu || []).forEach((u) => { patientNames[u.id] = u.name; });
      }
      return {
        data: rows.map((r) => ({
          ...r,
          child_name: r.children?.name || (r.patient_user_id && patientNames[r.patient_user_id]) || '—',
        })),
      };
    }

    if (healthPath.startsWith('/health/appointments')) {
      let q = supabase.from('health_appointments').select('*, children:child_id(name)').eq('family_id', familyId);
      if (healthSearch.get('patient_user_id')) q = q.eq('patient_user_id', healthSearch.get('patient_user_id'));
      if (healthSearch.get('child_id')) q = q.eq('child_id', healthSearch.get('child_id'));
      if (healthSearch.get('from')) q = q.gte('date', healthSearch.get('from'));
      if (healthSearch.get('to')) q = q.lte('date', healthSearch.get('to'));
      const { data } = await q.order('date', { ascending: false });
      return { data: (data || []).map((a) => mapAppointmentFromDb(a, a.children?.name)) };
    }

    if (healthPath.startsWith('/health/medications')) {
      let q = supabase.from('medications').select('*, children:child_id(name)').eq('family_id', familyId);
      if (healthSearch.get('patient_user_id')) q = q.eq('patient_user_id', healthSearch.get('patient_user_id'));
      if (healthSearch.get('child_id')) q = q.eq('child_id', healthSearch.get('child_id'));
      if (healthSearch.get('status')) q = q.eq('status', healthSearch.get('status'));
      const { data } = await q.order('created_at', { ascending: false });
      return { data: (data || []).map((m) => ({ ...m, child_name: m.children?.name || '—' })) };
    }

    if (healthPath.startsWith('/health/medication-logs')) {
      let medIds = null;
      if (healthSearch.get('patient_user_id')) {
        const { data: meds } = await supabase.from('medications').select('id').eq('family_id', familyId).eq('patient_user_id', healthSearch.get('patient_user_id'));
        medIds = (meds || []).map((m) => m.id);
        if (!medIds.length) return { data: [] };
      }
      let q = supabase
        .from('health_medication_logs')
        .select('*, medications(name, child_id, patient_user_id), children:child_id(name), logged_by_user:logged_by(name)')
        .eq('family_id', familyId);
      if (medIds) q = q.in('medication_id', medIds);
      if (healthSearch.get('child_id')) q = q.eq('child_id', healthSearch.get('child_id'));
      if (healthSearch.get('from')) q = q.gte('taken_at', `${healthSearch.get('from')}T00:00:00`);
      if (healthSearch.get('to')) q = q.lte('taken_at', `${healthSearch.get('to')}T23:59:59`);
      const { data } = await q.order('taken_at', { ascending: false });
      return {
        data: (data || []).map((l) => ({
          ...l,
          medication_name: l.medications?.name || '—',
          child_name: l.children?.name || '—',
          logged_by_name: l.logged_by_user?.name || null,
          taken_date: l.taken_at ? String(l.taken_at).slice(0, 10) : '',
          taken_time: l.taken_at && String(l.taken_at).length > 11 ? String(l.taken_at).slice(11, 19) : '',
        })),
      };
    }

    if (healthPath === '/health' || healthPath === '/health/') {
      return { data: [] };
    }

    // Generic fallback
    let table = path.split('/')[1];
    if (table === 'health') {
      return { data: [] };
    }
    if (table === 'calendar') table = 'calendar_events';
    
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
    if (path.startsWith('/calendar') && !userId) throw new Error('Sessão inválida: inicie sessão novamente.');

    if (path.startsWith('/grades')) {
      const row = normalizeGradeRow(body, familyId);
      const { data, error } = await supabase.from('grades').insert([omitUndefined(row)]).select('*, children:child_id(name, color, avatar_url, avatar_preset)').single();
      if (error) throw new Error(error.message);
      return { data: mapGradeFromDb(data) };
    }

    if (path.startsWith('/calendar')) {
      const row = omitNullish(pickCalendarRow(body, familyId, userId, true));
      if (!row.date) throw new Error('Indique a data do evento.');
      const { data, error } = await supabase.from('calendar_events').insert([row]).select('*, children:child_id(name, color)').single();
      if (error) throw new Error(error.message);
      return { data: mapCalendarEventFromDb(data) };
    }

    if (path === '/shopping' || path === '/shopping/') {
      const row = omitUndefined({
        id: uuidv4(),
        family_id: familyId,
        name: body.name,
        description: body.description ?? null,
        quantity: body.quantity ?? null,
        establishment: body.establishment ?? null,
        price: body.price != null ? Number(body.price) : 0,
        is_urgent: !!body.is_urgent,
        registered_by: userId,
      });
      const { data, error } = await supabase.from('shopping_list').insert([row]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path.startsWith('/health/upload')) {
      if (!(body instanceof FormData) || !body.get('file')) throw new Error('Envie file em FormData');
      const file = body.get('file');
      const ext = (file.name && String(file.name).split('.').pop().toLowerCase()) || 'jpg';
      const safeExt = ['jpg','jpeg','png','gif','webp','pdf'].includes(ext) ? ext : 'jpg';
      const filePath = `${familyId}/health/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      // Tentar bucket 'uploads' e depois 'health-images' como fallback
      let uploadBucket = 'uploads';
      let { error: upErr } = await supabase.storage.from(uploadBucket).upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (upErr && upErr.message?.includes('Bucket not found')) {
        uploadBucket = 'health-images';
        const res2 = await supabase.storage.from(uploadBucket).upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });
        upErr = res2.error;
      }
      if (upErr) throw new Error(`Upload falhou (bucket ${uploadBucket}): ${upErr.message}. Crie o bucket 'uploads' (público) no Supabase Dashboard → Storage.`);
      const rel = `${uploadBucket}/${filePath}`;
      return { data: { url: rel } };
    }

    if (path === '/health/records') {
      let payload = { ...body };
      delete payload.kind;
      if ((!payload.child_id || payload.child_id === '') && !payload.patient_user_id && userId) {
        const { data: ch } = await supabase.from('children').select('id').eq('user_id', userId).maybeSingle();
        if (ch?.id) payload = { ...payload, child_id: ch.id };
      }
      const ins = buildHealthRecordInsert(payload, familyId, userId);
      const { data, error } = await supabase.from('health_records').insert([ins]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/health/appointments') {
      const ins = buildAppointmentInsert(body, familyId);
      if (!ins.date) throw new Error('Data da consulta é obrigatória.');
      const { data, error } = await supabase.from('health_appointments').insert([ins]).select().single();
      if (error) throw new Error(error.message);
      return { data: mapAppointmentFromDb(data, null) };
    }

    if (path === '/health/medications') {
      const ins = buildMedicationInsert(body, familyId, userId);
      const { data, error } = await supabase.from('medications').insert([ins]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/health/medication-logs') {
      const { data: med, error: mErr } = await supabase.from('medications').select('child_id').eq('id', body.medication_id).eq('family_id', familyId).single();
      if (mErr || !med) throw new Error('Medicamento não encontrado');
      const datePart = body.taken_date || toYMDLocal();
      const timePart = (body.taken_time && String(body.taken_time).trim()) || '12:00';
      const timeNorm = timePart.length <= 5 ? `${timePart}:00` : timePart;
      const takenAt = `${datePart}T${timeNorm}`;
      const ins = omitUndefined({
        id: uuidv4(),
        family_id: familyId,
        child_id: med.child_id ?? null,
        medication_id: body.medication_id,
        taken_at: takenAt,
        status: body.status || 'taken',
        notes: body.notes ?? null,
        logged_by: userId,
      });
      const { data, error } = await supabase.from('health_medication_logs').insert([ins]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }
    
    if (path.startsWith('/tasks') && !path.startsWith('/tasks/occurrences')) {
      const safeBody = { ...body };
      delete safeBody.allowance_rule;
      if (safeBody.end_date === '') safeBody.end_date = null;
      if (safeBody.due_time === '') safeBody.due_time = null;
      if (safeBody.start_date === '') safeBody.start_date = null;
      safeBody.start_date = normalizeDbDate(safeBody.start_date) || toYMDLocal();
      if (safeBody.end_date) safeBody.end_date = normalizeDbDate(safeBody.end_date);

      const { data: taskRow, error } = await supabase
        .from('tasks')
        .insert([{ ...safeBody, family_id: familyId, created_by: userId, id: uuidv4() }])
        .select()
        .single();
      if (error) throw new Error(error.message);

      const occDates = computeOccurrenceDatesForTask(taskRow);
      if (occDates.length && taskRow.child_id) {
        const occRows = occDates.map((od) => ({
          id: uuidv4(),
          task_id: taskRow.id,
          family_id: familyId,
          child_id: taskRow.child_id,
          occurrence_date: od,
          status: 'pending',
        }));
        const { error: ocErr } = await supabase.from('task_occurrences').insert(occRows);
        if (ocErr) console.warn('[tasks] ocorrências:', ocErr.message);
      }
      return { data: taskRow };
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
      // Usa RPC SECURITY DEFINER que auto-resolve child_id mesmo que não seja passado
      const { data, error } = await supabase.rpc('create_savings_goal', {
        p_title: body.title,
        p_target_amount: Number(body.target_amount),
        p_child_id: body.child_id || null,
      });
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/allowance/piggy-requests') {
      // Resolver child_id e goal_title — a tabela não tem savings_goal_id
      let childId = body.child_id || null;
      let childName = body.child_name || null;
      let goalTitle = body.goal_title || null;

      // Auto-injectar child_id via sessão actual (criança logada)
      if (!childId) {
        const { data: cr } = await supabase.from('children').select('id, name').eq('user_id', userId).eq('family_id', familyId).maybeSingle();
        if (cr?.id) { childId = cr.id; childName = cr.name; }
      }
      if (!childId) throw new Error('Perfil de criança não encontrado. Verifique a conta.');

      // Buscar título da meta pelo savings_goal_id (se fornecido)
      if (!goalTitle && body.savings_goal_id) {
        const { data: goalRow } = await supabase.from('savings_goals').select('title').eq('id', body.savings_goal_id).maybeSingle();
        goalTitle = goalRow?.title || null;
      }

      const ins = {
        id: uuidv4(),
        family_id: familyId,
        child_id: childId,
        child_name: childName,
        goal_title: goalTitle,
        requested_amount: Number(body.requested_amount) || 0,
        message: body.message || null,
        status: 'pending',
      };
      const { data, error } = await supabase.from('piggy_requests').insert([ins]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/families/children') {
      const email = body?.email && String(body.email).trim() ? String(body.email).trim().toLowerCase() : null;
      let newUserId = null;

      if (email) {
        if (!supabaseSecondary) throw new Error('Configuração do Supabase secundário em falta.');
        const password = String(body.password || '').trim() || '123456';
        const { data: signUpData, error: signUpError } = await supabaseSecondary.auth.signUp({
          email,
          password,
          options: { data: { name: body.name || email.split('@')[0] } },
        });
        if (signUpError) throw new Error(signUpError.message);
        if (!signUpData?.user?.id) {
          throw new Error(
            'Não foi possível criar a conta de acesso. ' +
            'No Supabase Dashboard → Authentication → Settings, desative "Enable email confirmations".',
          );
        }
        newUserId = signUpData.user.id;

        // Aguarda um tick para o trigger on_auth_user_created concluir
        await new Promise((r) => setTimeout(r, 400));

        const { error: rpcErr } = await supabase.rpc('add_member_to_family', {
          p_target_user_id: newUserId,
          p_family_id: familyId,
          p_role: 'child',
          p_name: body.name || email.split('@')[0],
          p_must_change_password: !!body.must_change_password,
        });
        if (rpcErr) throw new Error(rpcErr.message);
      }

      const childId = uuidv4();
      const { data, error } = await supabase
        .from('children')
        .insert([{
          id: childId,
          name: body.name,
          age: body.age != null && body.age !== '' ? Number(body.age) : null,
          birthday: body.birthday || null,
          color: body.color || '#6C5CE7',
          avatar_preset: body.avatar_preset || 'explorer',
          nickname: body.nickname || null,
          emoji: body.emoji || null,
          notes: body.notes || null,
          family_id: familyId,
          user_id: newUserId || null,
        }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (path === '/families/relatives') {
      const email = String(body?.email || '').trim().toLowerCase();
      if (!email) throw new Error('Email é obrigatório para criar um parente/auxiliar.');
      if (!supabaseSecondary) throw new Error('Configuração do Supabase secundário em falta.');

      const password = String(body.password || '').trim() || '123456';
      const { data: signUpData, error: signUpError } = await supabaseSecondary.auth.signUp({
        email,
        password,
        options: { data: { name: body.name || email.split('@')[0] } },
      });
      if (signUpError) throw new Error(signUpError.message);
      if (!signUpData?.user?.id) {
        throw new Error(
          'Não foi possível criar a conta. ' +
          'No Supabase Dashboard → Authentication → Settings, desative "Enable email confirmations".',
        );
      }
      const newUserId = signUpData.user.id;

      await new Promise((r) => setTimeout(r, 400));

      const { error: rpcErr } = await supabase.rpc('add_member_to_family', {
        p_target_user_id: newUserId,
        p_family_id: familyId,
        p_role: 'relative',
        p_name: body.name || email.split('@')[0],
        p_must_change_password: !!body.must_change_password,
        p_relationship: body.relationship || null,
        p_access_profile: body.access_profile || null,
        p_phone: body.phone || null,
        p_emoji: body.emoji || null,
        p_display_color: body.display_color || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      if (Array.isArray(body.linked_child_ids) && body.linked_child_ids.length) {
        const rows = body.linked_child_ids.map((cid) => ({
          id: uuidv4(),
          relative_user_id: newUserId,
          child_id: cid,
          family_id: familyId,
        }));
        await supabase.from('relative_children').insert(rows).catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 200));
      const { data: newUser } = await supabase.from('users').select('*').eq('id', newUserId).maybeSingle();
      return { data: newUser || { id: newUserId, name: body.name, email, role: 'relative', family_id: familyId } };
    }

    if (path === '/families/members') {
      const email = String(body?.email || '').trim().toLowerCase();
      if (!email) throw new Error('Email é obrigatório para criar um responsável.');
      if (!supabaseSecondary) throw new Error('Configuração do Supabase secundário em falta.');

      const password = String(body.password || '').trim() || '123456';
      const { data: signUpData, error: signUpError } = await supabaseSecondary.auth.signUp({
        email,
        password,
        options: { data: { name: body.name || email.split('@')[0] } },
      });
      if (signUpError) throw new Error(signUpError.message);
      if (!signUpData?.user?.id) {
        throw new Error(
          'Não foi possível criar a conta. ' +
          'No Supabase Dashboard → Authentication → Settings, desative "Enable email confirmations".',
        );
      }
      const newUserId = signUpData.user.id;

      await new Promise((r) => setTimeout(r, 400));

      const memberRole = ['parent', 'relative'].includes(body.role) ? body.role : 'parent';
      const { error: rpcErr } = await supabase.rpc('add_member_to_family', {
        p_target_user_id: newUserId,
        p_family_id: familyId,
        p_role: memberRole,
        p_name: body.name || email.split('@')[0],
        p_must_change_password: !!body.must_change_password,
        p_access_profile: body.access_profile || null,
        p_phone: body.phone || null,
        p_emoji: body.emoji || null,
        p_display_color: body.display_color || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      await new Promise((r) => setTimeout(r, 200));
      const { data: newUser } = await supabase.from('users').select('*').eq('id', newUserId).maybeSingle();
      return { data: newUser || { id: newUserId, name: body.name, email, role: memberRole, family_id: familyId } };
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
          await supabase.from('notice_reads').delete().eq('notice_id', noticeId).eq('user_id', userId);
          const { error: nrErr } = await supabase.from('notice_reads').insert({
            id: uuidv4(),
            notice_id: noticeId,
            user_id: userId,
            read_at: new Date().toISOString(),
          });
          if (nrErr) throw new Error(nrErr.message);
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
      if (!body?.cycle_id || !body?.child_id || body.amount == null || !body?.type) {
        throw new Error('Mesada manual: cycle_id, child_id, amount e type são obrigatórios.');
      }
      const amt = Number(body.amount);
      const { data: inserted, error: insErr } = await supabase
        .from('allowance_transactions')
        .insert({
          id: uuidv4(),
          family_id: familyId,
          child_id: body.child_id,
          cycle_id: body.cycle_id,
          type: body.type,
          amount: amt,
          description: body.description ?? null,
          origin: 'manual',
          status: 'approved',
          approved_by: userId,
          balance_after: 0,
        })
        .select()
        .maybeSingle();
      if (insErr) throw new Error(insErr.message);

      const delta = body.type === 'credit' ? amt : -amt;
      const { data: cycle } = await supabase.from('allowance_cycles').select('manual_adjustments').eq('id', body.cycle_id).eq('family_id', familyId).single();
      const currentAdj = Number(cycle?.manual_adjustments || 0);
      await supabase.from('allowance_cycles').update({ manual_adjustments: currentAdj + delta }).eq('id', body.cycle_id).eq('family_id', familyId);

      return { data: inserted || {} };
    }

    if (path.startsWith('/allowance/cycles/') && path.endsWith('/close')) {
      const cycleId = path.split('/')[3];
      await supabase.from('allowance_cycles').update({ status: 'closed' }).eq('id', cycleId).eq('family_id', familyId);
      return { data: { ok: true } };
    }

    if (path.startsWith('/allowance/cycles/') && path.endsWith('/pay')) {
      const cycleId = path.split('/')[3];
      await supabase.from('allowance_cycles').update({ status: 'paid' }).eq('id', cycleId).eq('family_id', familyId);
      return { data: { ok: true } };
    }

    let table = path.split('/')[1];
    let safeBody = { ...body };
    if (table === 'calendar') table = 'calendar_events';
    if (table === 'shopping') {
      table = 'shopping_list';
      if (!safeBody.registered_by && userId) safeBody.registered_by = userId;
    }
    if (table === 'health') {
      if (path.includes('appointments')) table = 'health_appointments';
      else if (path.includes('medication-logs')) table = 'health_medication_logs';
      else if (path.includes('medications')) table = 'medications';
      else if (path.includes('records')) table = 'health_records';
      else throw new Error('Use rotas /health/records, /health/appointments, etc. (cliente atualizado).');

      Object.keys(safeBody).forEach(k => { if (safeBody[k] === '') safeBody[k] = null; });
    }

    const { data, error } = await supabase.from(table).insert([{ ...safeBody, family_id: familyId, id: uuidv4() }]).select().single();
    if (error) throw new Error(error.message);
    return { data };
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

      if (body instanceof FormData) {
        const preset = body.get('avatar_preset');
        const file = body.get('avatar');
        if (file && typeof file === 'object' && file.size > 0) {
          const ext = (file.name && String(file.name).split('.').pop()) || 'jpg';
          const filePath = childId
            ? `${familyId}/child-${childId}-${Date.now()}.${ext}`
            : `${familyId}/user-${userId}-${Date.now()}.${ext}`;

          // Tenta 'avatars' primeiro, cai em 'uploads' se não existir
          let rel = null;
          for (const bucket of ['avatars', 'uploads']) {
            const { error: upErr } = await supabase.storage
              .from(bucket)
              .upload(filePath, file, { upsert: true, contentType: file.type || undefined });
            if (!upErr) { rel = `${bucket}/${filePath}`; break; }
            if (!upErr?.message?.includes('not found') && !upErr?.message?.includes('does not exist')) {
              throw new Error(upErr.message);
            }
          }
          if (!rel) throw new Error('Bucket de avatares não encontrado. Crie "avatars" ou "uploads" no Supabase Storage.');

          if (childId) {
            await supabase.from('children').update({ avatar_url: rel, avatar_preset: null }).eq('id', childId).eq('family_id', familyId);
          } else {
            await supabase.from('users').update({ avatar_url: rel, avatar_preset: null }).eq('id', userId);
          }
          return { data: { avatar_url: rel, avatar_preset: preset || null } };
        }
        if (preset) {
          if (childId) {
            await supabase.from('children').update({ avatar_preset: preset, avatar_url: null }).eq('id', childId).eq('family_id', familyId);
          } else {
            await supabase.from('users').update({ avatar_preset: preset, avatar_url: null }).eq('id', userId);
          }
          return { data: { avatar_preset: preset } };
        }
      } else if (body && body.avatar_preset) {
        if (childId) {
          await supabase.from('children').update({ avatar_preset: body.avatar_preset, avatar_url: null }).eq('id', childId).eq('family_id', familyId);
        } else {
          await supabase.from('users').update({ avatar_preset: body.avatar_preset, avatar_url: null }).eq('id', userId);
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
      const patch = pickFamilyPatch(body);
      const { data, error } = await supabase.from('families').update(patch).eq('id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const memberAvatarMatch = path.match(/^\/families\/members\/([^/]+)\/avatar$/);
    if (memberAvatarMatch) {
      const targetUserId = memberAvatarMatch[1];
      const role = await getUserRole();
      // Permite que o próprio utilizador altere o seu avatar
      const isSelf = String(targetUserId) === String(userId);
      if (!isSelf && role !== 'parent') throw new Error('Apenas responsáveis podem alterar o avatar de outros membros.');
      const { data: target } = await supabase.from('users').select('id').eq('id', targetUserId).eq('family_id', familyId).maybeSingle();
      if (!target) throw new Error('Utilizador não encontrado na família.');

      if (body instanceof FormData) {
        const preset = body.get('avatar_preset');
        const file = body.get('avatar');
        if (file && typeof file === 'object' && file.size > 0) {
          const ext = (file.name && String(file.name).split('.').pop()) || 'jpg';
          const filePath = `${familyId}/user-${targetUserId}-${Date.now()}.${ext}`;

          // Tenta 'avatars' primeiro, cai em 'uploads' se não existir
          let rel = null;
          for (const bucket of ['avatars', 'uploads']) {
            const { error: upErr } = await supabase.storage
              .from(bucket)
              .upload(filePath, file, { upsert: true, contentType: file.type || undefined });
            if (!upErr) { rel = `${bucket}/${filePath}`; break; }
            if (!upErr?.message?.includes('not found') && !upErr?.message?.includes('does not exist')) {
              throw new Error(upErr.message);
            }
          }
          if (!rel) throw new Error('Bucket de avatares não encontrado. Crie "avatars" ou "uploads" no Supabase Storage.');

          await supabase.from('users').update({ avatar_url: rel, avatar_preset: null }).eq('id', targetUserId).eq('family_id', familyId);
          return { data: { avatar_url: rel, avatar_preset: preset || null } };
        }
        if (preset) {
          await supabase.from('users').update({ avatar_preset: preset, avatar_url: null }).eq('id', targetUserId).eq('family_id', familyId);
          return { data: { avatar_preset: preset } };
        }
      } else if (body && body.avatar_preset) {
        await supabase.from('users').update({ avatar_preset: body.avatar_preset, avatar_url: null }).eq('id', targetUserId).eq('family_id', familyId);
        return { data: { avatar_preset: body.avatar_preset } };
      }
      throw new Error('Envie avatar (ficheiro) ou avatar_preset');
    }

    const childPwMatch = path.match(/^\/families\/children\/([^/]+)\/password$/);
    if (childPwMatch) {
      const childId = childPwMatch[1];
      const { data: ch } = await supabase.from('children').select('user_id').eq('id', childId).eq('family_id', familyId).maybeSingle();
      if (!ch?.user_id) throw new Error('Esta criança não tem conta de login. Defina email ao criar ou use convite.');
      const targetUid = ch.user_id;
      const pwd = body?.password;
      const must = !!body?.must_change_password;
      if (pwd && String(pwd).length >= 4) {
        if (targetUid === userId) {
          const { error } = await supabase.auth.updateUser({ password: String(pwd) });
          if (error) throw new Error(error.message);
        } else {
          // Usa RPC com SECURITY DEFINER para alterar senha de outro utilizador
          const { error: rpcErr } = await supabase.rpc('change_member_password', {
            p_target_user_id: targetUid,
            p_new_password: String(pwd),
          });
          if (rpcErr) throw new Error(rpcErr.message);
        }
      }
      const { error: uErr } = await supabase.from('users').update({ must_change_password: must }).eq('id', targetUid).eq('family_id', familyId);
      if (uErr) throw new Error(uErr.message);
      return { data: { ok: true } };
    }

    const memberPwMatch = path.match(/^\/families\/members\/([^/]+)\/password$/);
    if (memberPwMatch) {
      const targetUid = memberPwMatch[1];
      const pwd = body?.password;
      const must = !!body?.must_change_password;
      const { data: tgt } = await supabase.from('users').select('id').eq('id', targetUid).eq('family_id', familyId).maybeSingle();
      if (!tgt) throw new Error('Membro não encontrado.');
      if (pwd && String(pwd).length >= 4) {
        if (targetUid === userId) {
          const { error } = await supabase.auth.updateUser({ password: String(pwd) });
          if (error) throw new Error(error.message);
        } else {
          const { error: rpcErr } = await supabase.rpc('change_member_password', {
            p_target_user_id: targetUid,
            p_new_password: String(pwd),
          });
          if (rpcErr) throw new Error(rpcErr.message);
        }
      }
      const { error: uErr } = await supabase.from('users').update({ must_change_password: must }).eq('id', targetUid).eq('family_id', familyId);
      if (uErr) throw new Error(uErr.message);
      return { data: { ok: true } };
    }

    const childPutMatch = path.match(/^\/families\/children\/([^/]+)$/);
    if (childPutMatch) {
      const childId = childPutMatch[1];
      const patch = omitUndefined({
        name: body.name,
        nickname: body.nickname,
        age: body.age === '' || body.age === undefined ? null : Number(body.age),
        color: body.color,
        emoji: body.emoji,
        notes: body.notes,
        birthday: body.birthday === '' ? null : body.birthday,
        avatar_preset: body.avatar_preset,
      });
      const { data, error } = await supabase.from('children').update(patch).eq('id', childId).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const memberPutMatch = path.match(/^\/families\/members\/([^/]+)$/);
    if (memberPutMatch) {
      const uid = memberPutMatch[1];
      const patch = omitUndefined({
        name: body.name,
        phone: body.phone,
        emoji: body.emoji,
        display_color: body.display_color,
        access_profile: body.access_profile,
      });
      if (body.email !== undefined) patch.email = body.email;
      const { data, error } = await supabase.from('users').update(patch).eq('id', uid).eq('family_id', familyId).not('role', 'eq', 'master').select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const relativePutMatch = path.match(/^\/families\/relatives\/([^/]+)$/);
    if (relativePutMatch) {
      const uid = relativePutMatch[1];
      const patch = omitUndefined({
        name: body.name,
        phone: body.phone,
        emoji: body.emoji,
        display_color: body.display_color,
        access_profile: body.access_profile,
      });
      if (body.email !== undefined) patch.email = body.email;
      const { data, error } = await supabase.from('users').update(patch).eq('id', uid).eq('family_id', familyId).eq('role', 'relative').select().single();
      if (error) throw new Error(error.message);
      if (body.relationship != null) {
        await supabase.from('family_members').upsert(
          { family_id: familyId, user_id: uid, relationship: body.relationship },
          { onConflict: 'family_id,user_id' },
        ).catch(() => {});
      }
      if (Array.isArray(body.linked_child_ids)) {
        await supabase.from('relative_children').delete().eq('relative_user_id', uid).eq('family_id', familyId);
        const rows = body.linked_child_ids.map((cid) => ({
          id: uuidv4(),
          relative_user_id: uid,
          child_id: cid,
          family_id: familyId,
        }));
        if (rows.length) await supabase.from('relative_children').insert(rows).catch(() => {});
      }
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

    const healthPut = parseHealthSubResource(path);
    if (healthPut) {
      if (healthPut.table === 'health_records') {
        const patch = {};
        HEALTH_RECORD_FIELDS.forEach((k) => {
          if (body[k] !== undefined) patch[k] = body[k];
        });
        if (patch.child_id === '') patch.child_id = null;
        if (patch.patient_user_id === '') patch.patient_user_id = null;
        if (Array.isArray(patch.attachment_urls)) patch.attachment_urls = JSON.stringify(patch.attachment_urls);
        const { data, error } = await supabase.from('health_records').update(omitUndefined(patch)).eq('id', healthPut.id).eq('family_id', familyId).select().single();
        if (error) throw new Error(error.message);
        return { data };
      }
      if (healthPut.table === 'health_appointments') {
        const patch = buildAppointmentUpdate(body);
        const { data, error } = await supabase.from('health_appointments').update(patch).eq('id', healthPut.id).eq('family_id', familyId).select().single();
        if (error) throw new Error(error.message);
        return { data: mapAppointmentFromDb(data, null) };
      }
      if (healthPut.table === 'medications') {
        const patch = { ...body };
        ['kind', 'patient_mode', 'child_name', 'created_at', 'updated_at', 'id', 'family_id', 'children'].forEach((k) => delete patch[k]);
        if (patch.child_id === '') patch.child_id = null;
        if (patch.patient_user_id === '') patch.patient_user_id = null;
        if (Array.isArray(patch.scheduled_times)) patch.scheduled_times = JSON.stringify(patch.scheduled_times);
        if (Array.isArray(patch.attachment_urls)) patch.attachment_urls = JSON.stringify(patch.attachment_urls);
        const { data, error } = await supabase.from('medications').update(omitUndefined(patch)).eq('id', healthPut.id).eq('family_id', familyId).select().single();
        if (error) throw new Error(error.message);
        return { data };
      }
      const { data, error } = await supabase.from(healthPut.table).update(omitUndefined(body)).eq('id', healthPut.id).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (table === 'shopping' && !action) {
      const patch = { ...body };
      ['id', 'family_id', 'registered_by', 'bought_by', 'bought_at', 'created_at'].forEach((k) => delete patch[k]);
      const { data, error } = await supabase.from('shopping_list').update(omitUndefined(patch)).eq('id', id).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
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

      // Se não precisa de aprovação, atribuir pontos imediatamente
      if (newStatus === 'completed' && occ.child_id && (task?.points > 0 || task?.coins > 0)) {
        const taskPoints = task.points || 0;
        const taskCoins = task.coins || 0;
        await supabase.from('task_occurrences').update({ points_awarded: taskPoints }).eq('id', occId);
        const { data: child } = await supabase.from('children').select('points, coins, xp, xp_next_level, level, streak_current, streak_best, streak_last_date').eq('id', occ.child_id).single();
        if (child) {
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const lastDate = child.streak_last_date;
          const newStreak = lastDate === yesterday ? (child.streak_current || 0) + 1 : lastDate === today ? child.streak_current : 1;
          const newXp = (child.xp || 0) + taskPoints;
          let newLevel = child.level || 1;
          let newXpNext = child.xp_next_level || 100;
          if (newXp >= newXpNext) { newLevel++; newXpNext = Math.round(newXpNext * 1.5); }
          await supabase.from('children').update({
            points: (child.points || 0) + taskPoints,
            coins: (child.coins || 0) + taskCoins,
            xp: newXp,
            level: newLevel,
            xp_next_level: newXpNext,
            streak_current: newStreak,
            streak_best: Math.max(newStreak, child.streak_best || 0),
            streak_last_date: today,
          }).eq('id', occ.child_id);
          await checkAndAwardMedals(supabase, occ.child_id, familyId, newStreak);
        }
      }
      return { data: { message: 'Ocorrência atualizada', status: newStatus } };
    }

    const approveMatch = path.match(/^\/tasks\/occurrences\/([^/]+)\/approve$/);
    if (approveMatch) {
      const occId = approveMatch[1];
      const approved = !!body?.approved;
      const patch = approved
        ? { status: 'approved', approved_at: new Date().toISOString(), approved_by: userId }
        : { status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: userId, rejection_reason: body?.rejection_reason || null };
      const { data, error } = await supabase.from('task_occurrences').update(patch).eq('id', occId).eq('family_id', familyId).select('*, tasks(points, coins)').single();
      if (error) throw new Error(error.message);

      // Ao aprovar: atribuir pontos/moedas à criança e verificar medalhas
      if (approved && data?.child_id) {
        const taskPoints = data.tasks?.points || 0;
        const taskCoins = data.tasks?.coins || 0;
        if (taskPoints > 0 || taskCoins > 0) {
          // Atualiza points_awarded na ocorrência
          await supabase.from('task_occurrences').update({ points_awarded: taskPoints }).eq('id', occId);
          // Incrementa pontos/moedas/xp na criança
          const { data: child } = await supabase.from('children').select('points, coins, xp, xp_next_level, level, streak_current, streak_best, streak_last_date').eq('id', data.child_id).single();
          if (child) {
            const today = new Date().toISOString().split('T')[0];
            const lastDate = child.streak_last_date;
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const newStreak = lastDate === yesterday ? (child.streak_current || 0) + 1 : lastDate === today ? child.streak_current : 1;
            const newXp = (child.xp || 0) + taskPoints;
            let newLevel = child.level || 1;
            let newXpNext = child.xp_next_level || 100;
            if (newXp >= newXpNext) { newLevel++; newXpNext = Math.round(newXpNext * 1.5); }
            await supabase.from('children').update({
              points: (child.points || 0) + taskPoints,
              coins: (child.coins || 0) + taskCoins,
              xp: newXp,
              level: newLevel,
              xp_next_level: newXpNext,
              streak_current: newStreak,
              streak_best: Math.max(newStreak, child.streak_best || 0),
              streak_last_date: today,
              updated_at: new Date().toISOString(),
            }).eq('id', data.child_id);
            // Verificar e atribuir medalhas
            await checkAndAwardMedals(supabase, data.child_id, familyId, newStreak);
          }
        }
      }
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

      // 1. Buscar o pedido actual para obter valores
      const { data: reqRow, error: reqErr } = await supabase
        .from('piggy_requests')
        .select('*')
        .eq('id', reqId)
        .eq('family_id', familyId)
        .single();
      if (reqErr) throw new Error(reqErr.message);

      const newStatus = body.approved ? 'approved' : 'rejected';

      // 2. Se for rejeição: actualizar apenas o status e retornar
      if (!body.approved) {
        const { data: rejData, error: rejErr } = await supabase
          .from('piggy_requests')
          .update({ status: 'rejected', review_note: body.review_note ?? null })
          .eq('id', reqId).eq('family_id', familyId).select().single();
        if (rejErr) throw new Error(rejErr.message);
        return { data: rejData };
      }

      // 3. Aprovação — tentar primeiro via RPC atómica
      try {
        const { data: rpcData, error: rpcErr } = await supabase
          .rpc('approve_piggy_request', { p_request_id: reqId, p_family_id: familyId });
        if (!rpcErr && rpcData?.ok) {
          // Actualizar note de revisão se fornecida
          if (body.review_note) {
            await supabase.from('piggy_requests')
              .update({ review_note: body.review_note })
              .eq('id', reqId);
          }
          return { data: { ...reqRow, status: 'approved' } };
        }
      } catch (_) { /* RPC não existe ainda, continua com fallback */ }

      // Fallback manual (caso a RPC ainda não tenha sido criada no Supabase)
      const { data: updatedReq, error: updErr } = await supabase
        .from('piggy_requests')
        .update({ status: 'approved', review_note: body.review_note ?? null })
        .eq('id', reqId)
        .eq('family_id', familyId)
        .select()
        .single();
      if (updErr) throw new Error(updErr.message);

      // Se aprovado: creditar meta + debitar mesada
      if (reqRow.child_id && reqRow.requested_amount > 0) {
        const amount = Number(reqRow.requested_amount);

        // 3a. Creditar a meta do cofrinho (procurar por child_id + title)
        try {
          const { data: goalRows } = await supabase
            .from('savings_goals')
            .select('id, current_amount, target_amount')
            .eq('child_id', reqRow.child_id)
            .eq('family_id', familyId)
            .ilike('title', reqRow.goal_title ?? '')
            .limit(1);

          const goal = goalRows?.[0];
          if (goal) {
            const newCurrentAmount = Number(goal.current_amount || 0) + amount;
            const reachedTarget = goal.target_amount && newCurrentAmount >= Number(goal.target_amount);
            await supabase
              .from('savings_goals')
              .update({
                current_amount: newCurrentAmount,
                ...(reachedTarget ? { status: 'completed' } : {}),
              })
              .eq('id', goal.id);
          }
        } catch (_) { /* não bloqueia se meta não encontrada */ }

        // 3b. Debitar da mesada: ajustar o ciclo aberto da criança
        // NOTA: a tabela allowance_cycles tem (month, year), não period_start
        let openCycleId = null;
        try {
          const { data: openCycle } = await supabase
            .from('allowance_cycles')
            .select('id, manual_adjustments')
            .eq('child_id', reqRow.child_id)
            .eq('family_id', familyId)
            .eq('status', 'open')
            .order('year', { ascending: false })
            .order('month', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (openCycle) {
            openCycleId = openCycle.id;
            await supabase
              .from('allowance_cycles')
              .update({ manual_adjustments: Number(openCycle.manual_adjustments || 0) - amount })
              .eq('id', openCycle.id);
          }
        } catch (_) { /* não bloqueia */ }

        // 3c. Registar transacção para histórico (type: 'debit' — não 'deduction')
        try {
          await supabase
            .from('allowance_transactions')
            .insert([{
              id: uuidv4(),
              family_id: familyId,
              child_id: reqRow.child_id,
              cycle_id: openCycleId,
              type: 'debit',
              amount: Math.abs(amount),
              description: `Cofrinho: ${reqRow.goal_title || 'Meta'}`,
              created_at: new Date().toISOString(),
            }]);
        } catch (_) { /* não bloqueia */ }
      }

      return { data: updatedReq };
    }

    const occUpdateOnly = path.match(/^\/tasks\/occurrences\/([^/]+)$/);
    if (occUpdateOnly) {
      const occId = occUpdateOnly[1];
      const { data, error } = await supabase.from('task_occurrences').update({ ...body }).eq('id', occId).eq('family_id', familyId).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    // Editar aviso do mural — DEVE ficar antes do handler genérico
    const muralNoticeUpdateMatch = path.match(/^\/mural\/notices\/([^/]+)$/);
    if (muralNoticeUpdateMatch) {
      const noticeId = muralNoticeUpdateMatch[1];
      const allowedFields = [
        'title', 'content', 'type', 'priority', 'status',
        'target_type', 'target_user_ids', 'target_child_ids',
        'start_datetime', 'due_datetime', 'notice_time',
        'is_recurring', 'recurrence_rule', 'is_pinned',
        'requires_read_confirmation',
      ];
      const patch = {};
      allowedFields.forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
      const { data, error } = await supabase
        .from('family_notices')
        .update(patch)
        .eq('id', noticeId)
        .eq('family_id', familyId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { data };
    }

    if (table === 'families' && id) {
      throw new Error('Rota inválida: use PUT /families para a família ou PUT /families/children/:id, /families/members/:id, /families/relatives/:id.');
    }

    const safeBody = { ...body };
    if (table === 'tasks') {
      delete safeBody.allowance_rule;
      if (safeBody.end_date === '') safeBody.end_date = null;
      if (safeBody.due_time === '') safeBody.due_time = null;
      if (safeBody.start_date === '') safeBody.start_date = null;
    } else if (table === 'calendar_events' || table === 'calendar') {
      const calPatch = pickCalendarRow(safeBody, familyId, userId, false);
      delete calPatch.family_id;
      delete calPatch.created_by;
      Object.keys(safeBody).forEach((k) => delete safeBody[k]);
      Object.assign(safeBody, calPatch);
    } else if (table === 'grades') {
      const patch = omitUndefined(normalizeGradeRow({ ...safeBody, id }, familyId, id));
      delete patch.id;
      delete patch.family_id;
      Object.keys(safeBody).forEach((k) => delete safeBody[k]);
      Object.assign(safeBody, patch);
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

    const healthDel = parseHealthSubResource(path);
    if (healthDel) {
      await supabase.from(healthDel.table).delete().eq('id', healthDel.id).eq('family_id', familyId);
      return { data: { success: true } };
    }

    let targetTable = table;
    if (targetTable === 'shopping') targetTable = 'shopping_list';
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
