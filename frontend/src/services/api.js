import { supabase, fetchNoStore } from '../lib/supabase';
import { ensureAuthResumeBeforeNetwork } from '../lib/authResumeCoordinator';
import { famDiagWarn } from '../lib/famDiag';
import { createClient } from '@supabase/supabase-js';
import { normalizeHex } from '../lib/userDisplayColors';
import {
  canonicalMedalRequirementType,
  dedupeEarnedMedalsForDisplay,
  dedupeMedalsForAwardingCatalog,
  normalizedMedalDedupeKey,
} from '../lib/childDashboardDedupe';

const BASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Cliente secundário para permitir registo de novos membros/crianças sem encerrar a sessão atual (master/parent)
const supabaseSecondary = BASE_URL && ANON_KEY ? createClient(BASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchNoStore },
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

async function refreshSessionForApiGate() {
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error && import.meta.env.DEV) {
      console.warn('[Familia:api] refreshSession (gate)', error.message);
    }
  } catch {
    /* rede pausada / WebView suspensa */
  }
}

/**
 * Garante família atual após pequenas janelas em que getSession falha ou RT ainda renova token.
 */
async function getFamilyId(opts = {}) {
  const tries = opts.tries ?? 4;
  for (let i = 0; i < tries; i++) {
    const {
      data: { session },
      error: sessErr,
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!sessErr && uid) {
      const { data, error } = await supabase.from('users').select('family_id').eq('id', uid).single();
      if (!error && data?.family_id) return data.family_id;
    }
    if (i === 1) await refreshSessionForApiGate();
    await new Promise((r) => setTimeout(r, 90 + i * 110));
  }
  famDiagWarn('api/getFamilyId', 'null_after_retries');
  return null;
}

async function getUserRole() {
  for (let i = 0; i < 3; i++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { data } = await supabase.from('users').select('role').eq('id', session.user.id).single();
      if (data?.role) return data.role;
    }
    if (i === 1) await refreshSessionForApiGate();
    await new Promise((r) => setTimeout(r, 80 + i * 100));
  }
  return null;
}

async function getChildIdForLoggedInUser(userId, familyId) {
  if (!userId || !familyId) return null;
  const { data } = await supabase
    .from('children')
    .select('id')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

/** UUID string ou vazio — evita `"undefined"` e strings vazias. */
function normalizeAuthChildUuid(v) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null') return '';
  return s;
}

/**
 * Valida `child.id` declarado nos metadados JWT contra `children` × família actual.
 */
async function expandChildUuidFromJwtMetadataValidated(familyId, authUserId) {
  if (!familyId || !authUserId) return '';
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== authUserId) return '';
    const um = session.user.user_metadata || {};
    const am = session.user.app_metadata || {};
    const raw = um.child_id ?? um.childId ?? am.child_id ?? am.childId;
    const meta = normalizeAuthChildUuid(raw);
    if (!meta) return '';
    const { data: chByMeta } = await supabase
      .from('children')
      .select('id')
      .eq('family_id', familyId)
      .eq('id', meta)
      .maybeSingle();
    return chByMeta?.id ? normalizeAuthChildUuid(chByMeta.id) : '';
  } catch {
    return '';
  }
}

/**
 * child_id efectivo para escrita — criança: só o próprio filho da sessão (ignora spoof no body).
 * Pais/auxiliares: usam body.child_id se legítimo OU lookup por vínculo.
 */
async function resolveAuthorizedChildUuidForWrites(body, familyId, authUserId) {
  const fromHint =
    normalizeAuthChildUuid(body?.child_id) ||
    normalizeAuthChildUuid(body?.child_profile_id) ||
    normalizeAuthChildUuid(body?.childId);

  if (!authUserId || !familyId) return '';

  const role = await getUserRole();

  if (role === 'child') {
    const linked =
      normalizeAuthChildUuid(await getChildIdForLoggedInUser(authUserId, familyId)) ||
      (await expandChildUuidFromJwtMetadataValidated(familyId, authUserId));
    if (!linked) return '';
    if (fromHint && fromHint !== linked) {
      throw new Error('Operação não permitida: só podes registar dados do teu perfil.');
    }
    return linked;
  }

  if (role === 'parent' || role === 'relative' || role === 'master') {
    if (fromHint) {
      const { data: childOk } = await supabase
        .from('children')
        .select('id')
        .eq('family_id', familyId)
        .eq('id', fromHint)
        .maybeSingle();
      if (childOk?.id) return fromHint;
    }
    const fromLink = normalizeAuthChildUuid(await getChildIdForLoggedInUser(authUserId, familyId));
    return fromLink || '';
  }

  if (fromHint) return fromHint;
  const fromLink = normalizeAuthChildUuid(await getChildIdForLoggedInUser(authUserId, familyId));
  return fromLink || '';
}

/**
 * Para listagens READ: mesmo âmbito de filho para contas role=child.
 */
async function resolveViewerChildScope(familyId, authUserId) {
  if (!authUserId || !familyId) return '';
  const role = await getUserRole();
  if (role !== 'child') return '';
  const linked =
    normalizeAuthChildUuid(await getChildIdForLoggedInUser(authUserId, familyId)) ||
    (await expandChildUuidFromJwtMetadataValidated(familyId, authUserId));
  return linked || '';
}

/** Colunas permitidas ao criar uma linha em `tasks` (evita chaves estranhas no corpo REST). */
const TASK_INSERT_COLUMNS = [
  'title',
  'description',
  'type',
  'category',
  'points',
  'coins',
  'frequency',
  'recurrence_days',
  'start_date',
  'end_date',
  'due_time',
  'deadline',
  'is_recurring',
  'status',
  'priority',
  'child_id',
  'assignee_user_id',
  'source_medication_id',
  'is_health_reminder',
  'requires_approval',
  'affects_allowance',
  'visible_on_calendar',
  'generate_notification',
];

/** Apenas campos físicos da tabela `tasks` (UI/API podem incluir bonus_amount, ícones ou JSON aninhados). */
function pickTaskColumnsFromBody(body) {
  const picked = {};
  if (!body || typeof body !== 'object') return picked;
  for (const col of TASK_INSERT_COLUMNS) {
    if (body[col] !== undefined) picked[col] = body[col];
  }
  return picked;
}

/** datas / horário / dias de recorrência antes de PATCH/POST. */
function normalizeTaskPickedDatesAndRecurrence(picked) {
  const row = { ...picked };
  if (row.recurrence_days != null && Array.isArray(row.recurrence_days)) {
    row.recurrence_days = row.recurrence_days.join(',');
  }
  if (row.end_date === '') row.end_date = null;
  if (row.start_date === '') row.start_date = null;
  if (row.due_time === '') row.due_time = null;
  else if (row.due_time != null && row.due_time !== '') row.due_time = normalizeTimeForDb(row.due_time);
  if (row.start_date != null && row.start_date !== '') row.start_date = normalizeDbDate(row.start_date);
  if (row.end_date != null && row.end_date !== '') row.end_date = normalizeDbDate(row.end_date);
  return row;
}

/** Resposta com descontos/bónus vindos da tabela relacionada task_allowance_rules. */
function mapTaskRowWithAllowance(t) {
  if (!t || typeof t !== 'object') return t;
  const rRaw = t.task_allowance_rules;
  const r = Array.isArray(rRaw) ? rRaw[0] : rRaw;
  const { task_allowance_rules: _drop, ...rest } = t;
  return {
    ...rest,
    bonus_amount: r?.bonus_amount ?? 0,
    discount_amount: r?.discount_amount ?? 0,
    apply_discount_if_late: !!r?.apply_discount_if_late,
  };
}

const CALENDAR_EVENT_SELECT =
  '*, children:child_id(name, color), creator:users!calendar_events_created_by_fkey(id, name)';

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

/** FK embutida pelo PostgREST: objeto singular ou um elemento num array. */
function unwrapEmbeddedRow(v) {
  if (!v || typeof v !== 'object') return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

/** Soma dos custos em pontos de resgates `pending` desta criança (compromisso até aprovação/rejeição). */
async function sumPendingRedemptionPointsForChild(supabaseClient, childId) {
  if (!childId) return 0;
  const { data: pending, error } = await supabaseClient
    .from('redemptions')
    .select('reward_id')
    .eq('child_id', childId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  const ids = [...new Set((pending || []).map((p) => p.reward_id).filter(Boolean))];
  if (!ids.length) return 0;
  const { data: rews, error: rewErr } = await supabaseClient.from('rewards').select('id, point_cost').in('id', ids);
  if (rewErr) throw new Error(rewErr.message);
  const costById = new Map((rews || []).map((r) => [r.id, Number(r.point_cost ?? 0)]));
  return (pending || []).reduce((sum, p) => sum + (costById.get(p.reward_id) ?? 0), 0);
}

/**
 * Lista `/allowance/redemptions/list`: formato plano como o SQLite antigo (`reward_name`, `child_name`, ícone…).
 */
function mapRedemptionListRow(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const rew = unwrapEmbeddedRow(raw.rewards);
  const ch = unwrapEmbeddedRow(raw.children);
  const { rewards: _rw, children: _chd, ...rest } = raw;
  const pcMerge = rew?.point_cost ?? rest.point_cost;
  const parsedCost =
    pcMerge != null && pcMerge !== '' && Number.isFinite(Number(pcMerge)) ? Number(pcMerge) : null;
  return {
    ...rest,
    reward_name: rew?.name || rest.reward_name || '',
    icon: rew?.icon || '🎁',
    /** null quando embed falhou — hydrate corrigiu depois ou UI usa "—" */
    point_cost: parsedCost,
    child_name: ch?.name || rest.child_name || '',
  };
}

/** Nome/custo do resgate: join embutido pode vir null com conta criança (PostgREST/RLS). */
async function hydrateRedemptionsListRows(supabase, familyId, rows) {
  const list = rows || [];
  const ridSet = [...new Set(list.map((r) => r.reward_id).filter(Boolean))];
  const cidSet = [...new Set(list.map((r) => r.child_id).filter(Boolean))];
  const rmap = new Map();
  const cmap = new Map();
  if (ridSet.length) {
    const { data: rews } = await supabase
      .from('rewards')
      .select('id,name,icon,point_cost,type')
      .eq('family_id', familyId)
      .in('id', ridSet);
    (rews || []).forEach((x) => rmap.set(x.id, x));
  }
  if (cidSet.length) {
    const { data: chs } = await supabase
      .from('children')
      .select('id,name')
      .eq('family_id', familyId)
      .in('id', cidSet);
    (chs || []).forEach((x) => cmap.set(x.id, x));
  }
  return list.map((raw) => {
    const embR = unwrapEmbeddedRow(raw.rewards);
    const embC = unwrapEmbeddedRow(raw.children);
    const rw =
      embR && (embR.name != null || embR.point_cost != null || embR.icon != null)
        ? embR
        : raw.reward_id
          ? rmap.get(raw.reward_id)
          : null;
    const chName =
      embC?.name ??
      cmap.get(raw.child_id)?.name ??
      '';
    return mapRedemptionListRow({
      ...raw,
      rewards: rw || null,
      children: chName ? { name: chName } : null,
    });
  });
}

/** Senha mínima para contas de criança criadas pelo gestor (login próprio). */
const CHILD_LOGIN_PASSWORD_MIN = 6;

/**
 * Cria utilizador Auth + associa à família como role child (RPC).
 * Retorna o novo auth user id.
 */
async function createLinkedChildAuthUser({
  email,
  password,
  displayName,
  familyId,
  mustChangePassword,
}) {
  if (!supabaseSecondary) throw new Error('Configuração do Supabase secundário em falta (VITE_SUPABASE_*).');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const pwd = String(password || '').trim();
  if (!normalizedEmail) throw new Error('O email de acesso da criança é obrigatório.');
  if (pwd.length < CHILD_LOGIN_PASSWORD_MIN) {
    throw new Error(`A senha deve ter pelo menos ${CHILD_LOGIN_PASSWORD_MIN} caracteres.`);
  }

  const { data: signUpData, error: signUpError } = await supabaseSecondary.auth.signUp({
    email: normalizedEmail,
    password: pwd,
    options: { data: { name: displayName || normalizedEmail.split('@')[0] } },
  });

  if (signUpError) {
    const msg = signUpError.message || '';
    if (/already registered|already exists|User already|duplicate/i.test(msg)) {
      throw new Error('Este email já está registado. Use outro email ou peça ao utilizador para iniciar sessão com essa conta.');
    }
    throw new Error(signUpError.message);
  }
  if (!signUpData?.user?.id) {
    throw new Error(
      'Não foi possível criar a conta de acesso. No Supabase Dashboard → Authentication → Settings, ' +
      'desative "Enable email confirmations" para cadastro imediato de filhos.',
    );
  }

  const newUserId = signUpData.user.id;
  const label = displayName || normalizedEmail.split('@')[0];

  const backoffMs = [120, 280, 520, 900, 1400];
  let lastRpcErr = null;
  for (let i = 0; i <= backoffMs.length; i++) {
    const { error: rpcErr } = await supabase.rpc('add_member_to_family', {
      p_target_user_id: newUserId,
      p_family_id: familyId,
      p_role: 'child',
      p_name: label,
      p_must_change_password: !!mustChangePassword,
    });
    if (!rpcErr) return newUserId;
    lastRpcErr = rpcErr;
    if (i < backoffMs.length) await new Promise((r) => setTimeout(r, backoffMs[i]));
  }
  throw new Error(lastRpcErr?.message || 'Não foi possível associar o filho à família (RPC add_member_to_family).');
}

// Verifica e atribui medalhas à criança (tarefas, notas máximas, mesada, recompensas, etc.)
async function loadMedalProgressSnapshot(supabase, childId) {
  const [taskRes, childRes, gradesRes, redemptionRes, cycleRes] = await Promise.all([
    supabase
      .from('task_occurrences')
      .select('*', { count: 'exact', head: true })
      .eq('child_id', childId)
      .eq('status', 'approved'),
    supabase.from('children').select('points, streak_current').eq('id', childId).maybeSingle(),
    supabase.from('grades').select('score, max_score').eq('child_id', childId),
    supabase
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('child_id', childId)
      .eq('status', 'approved'),
    supabase
      .from('allowance_cycles')
      .select('*', { count: 'exact', head: true })
      .eq('child_id', childId)
      .eq('status', 'paid'),
  ]);

  let perfectGradesCount = 0;
  for (const g of gradesRes.data || []) {
    const sc = Number(g.score);
    const mx = Number(g.max_score);
    const cap = Number.isFinite(mx) && mx > 0 ? mx : 10;
    if (Number.isFinite(sc) && sc >= cap) perfectGradesCount += 1;
  }

  return {
    taskCount: taskRes.count ?? 0,
    streakCurrent: Number(childRes.data?.streak_current) || 0,
    points: Number(childRes.data?.points) || 0,
    perfectGradesCount,
    approvedRedemptions: redemptionRes.count ?? 0,
    paidAllowanceCycles: cycleRes.count ?? 0,
  };
}

function medalRequirementThresholdMedalAward(medal, crt) {
  const rv = Number(medal.requirement_value);
  if (!Number.isFinite(rv) || rv < 1) return 1;
  if (
    crt === 'task_count' ||
    crt === 'task_streak' ||
    crt === 'perfect_grade' ||
    crt === 'reward_redemptions' ||
    crt === 'allowance_paid_cycles'
  ) {
    return Math.max(1, Math.floor(rv));
  }
  if (crt === 'points_goal') return Math.max(1, Math.floor(rv));
  return rv;
}

function isMedalQualifiedBySnapshot(medal, snap, streakUse) {
  const crt = canonicalMedalRequirementType(medal.requirement_type);
  const thr = medalRequirementThresholdMedalAward(medal, crt);
  if (crt === 'task_count' && snap.taskCount >= thr) return true;
  if (crt === 'task_streak' && streakUse >= thr) return true;
  if (crt === 'perfect_grade' && snap.perfectGradesCount >= thr) return true;
  if (crt === 'points_goal' && snap.points >= thr) return true;
  if (crt === 'reward_redemptions' && snap.approvedRedemptions >= thr) return true;
  if (crt === 'allowance_paid_cycles' && snap.paidAllowanceCycles >= thr) return true;
  return false;
}

async function checkAndAwardMedals(supabase, childId, familyId, currentStreakHint, opts = {}) {
  try {
    const omitSpendableBonus = !!opts.omitSpendableBonus;
    const snap = await loadMedalProgressSnapshot(supabase, childId);
    const streakUse =
      currentStreakHint != null && Number.isFinite(Number(currentStreakHint))
        ? Number(currentStreakHint)
        : snap.streakCurrent;

    const { data: medals } = await supabase
      .from('medals')
      .select('*')
      .eq('is_active', true)
      .or(`family_id.eq.${familyId},family_id.is.null`);

    if (!medals?.length) return;

    const catalog = dedupeMedalsForAwardingCatalog(medals);

    const { data: earnedRows } = await supabase
      .from('earned_medals')
      .select('medal_id, medals(*)')
      .eq('child_id', childId);
    const earnedIds = new Set((earnedRows || []).map((e) => e.medal_id));
    const earnedKeys = new Set();
    for (const e of earnedRows || []) {
      let md = e.medals;
      if (Array.isArray(md)) md = md[0];
      const k = md ? normalizedMedalDedupeKey(md) : '';
      if (k) earnedKeys.add(k);
    }

    const toAward = [];
    let bonusPoints = 0;

    for (const medal of catalog) {
      const achievementKey = normalizedMedalDedupeKey(medal);
      if (achievementKey && earnedKeys.has(achievementKey)) continue;
      if (earnedIds.has(medal.id)) continue;
      if (!isMedalQualifiedBySnapshot(medal, snap, streakUse)) continue;
      toAward.push({ id: uuidv4(), medal_id: medal.id, child_id: childId });
      if (achievementKey) earnedKeys.add(achievementKey);
      if (!omitSpendableBonus) bonusPoints += medal.extra_points || 0;
    }

    if (toAward.length) {
      const { error: upEmErr } = await supabase
        .from('earned_medals')
        .upsert(toAward, { onConflict: 'medal_id,child_id', ignoreDuplicates: true });
      if (upEmErr) console.warn('earned_medals upsert:', upEmErr.message);
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

async function ensureOpenAllowanceCycleRow(supabase, familyId, childId) {
  const ymd = toYMDLocal(new Date());
  const ym = ymd.match(/^(\d{4})-(\d{2})-\d{2}$/);
  const year = ym ? Number(ym[1]) : NaN;
  const month = ym ? Number(ym[2]) : NaN;
  if (!month || !year || Number.isNaN(month) || Number.isNaN(year)) return null;

  const { data: existing } = await supabase
    .from('allowance_cycles')
    .select('*')
    .eq('child_id', childId)
    .eq('family_id', familyId)
    .eq('month', month)
    .eq('year', year)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) return existing;

  const { data: settings } = await supabase.from('allowance_settings').select('base_amount, allow_accumulation').eq('child_id', childId).maybeSingle();
  const base = settings?.base_amount ?? 0;
  const { data: prevRow } = await supabase
    .from('allowance_cycles')
    .select('final_amount')
    .eq('child_id', childId)
    .eq('family_id', familyId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();

  const opening = settings?.allow_accumulation && prevRow?.final_amount != null ? Number(prevRow.final_amount) : 0;

  const { data: inserted, error } = await supabase
    .from('allowance_cycles')
    .insert({
      family_id: familyId,
      child_id: childId,
      month,
      year,
      status: 'open',
      opening_balance: opening,
      base_amount: base,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.warn('[allowance] ciclo aberto:', error.message);
    return null;
  }
  return inserted || null;
}

async function allowanceTaskTxnPosted(supabase, occId) {
  const { data } = await supabase
    .from('allowance_transactions')
    .select('id')
    .eq('task_occurrence_id', occId)
    .eq('origin', 'task')
    .maybeSingle();
  return !!data?.id;
}

async function syncTaskAllowanceRules(supabase, taskId, allowanceRule) {
  if (!taskId) return;
  if (!allowanceRule || !allowanceRule.affects_allowance) {
    const { error: dErr } = await supabase.from('task_allowance_rules').delete().eq('task_id', taskId);
    if (dErr) throw new Error(dErr.message || 'Erro ao limpar regras de mesada da tarefa.');
    const { error: tErr } = await supabase.from('tasks').update({ affects_allowance: false }).eq('id', taskId);
    if (tErr) throw new Error(tErr.message);
    return;
  }

  const row = {
    id: uuidv4(),
    task_id: taskId,
    affects_allowance: true,
    bonus_amount: Number(allowanceRule.bonus_amount ?? 0),
    discount_amount: Number(allowanceRule.discount_amount ?? 0),
    apply_discount_if_late: !!allowanceRule.apply_discount_if_late,
  };

  /**
   * Nunca usar upsert(onConflict: task_id) aqui: (1) PostgREST devolve 400 se não existir UNIQUE em task_id;
   * (2) linhas duplicadas antigas fazem maybeSingle falhar. Estratégia idempotente: apagar + inserir uma linha.
   */
  const { error: delErr } = await supabase.from('task_allowance_rules').delete().eq('task_id', taskId);
  if (delErr) throw new Error(delErr.message || 'Erro ao actualizar regras de mesada (eliminar registos antigos).');

  const { error: insErr } = await supabase.from('task_allowance_rules').insert(row);
  if (insErr) throw new Error(insErr.message || 'Erro ao guardar regras de mesada da tarefa.');

  const { error: tErr } = await supabase.from('tasks').update({ affects_allowance: true }).eq('id', taskId);
  if (tErr) throw new Error(tErr.message);
}

async function applyTaskOccurrenceAllowanceOnDecision(supabase, { familyId, userId, occurrenceId, approved, task }) {
  if (!task || task.is_health_reminder) return;

  const { data: rule } = await supabase.from('task_allowance_rules').select('*').eq('task_id', task.id).maybeSingle();
  if (!rule?.affects_allowance) return;
  if (await allowanceTaskTxnPosted(supabase, occurrenceId)) return;

  const cycle = await ensureOpenAllowanceCycleRow(supabase, familyId, task.child_id);
  if (!cycle?.id) return;

  const title = task.title || 'Tarefa';

  if (approved && Number(rule.bonus_amount) > 0) {
    const amt = Number(rule.bonus_amount);
    const { error: insErr } = await supabase.from('allowance_transactions').insert({
      id: uuidv4(),
      family_id: familyId,
      child_id: task.child_id,
      cycle_id: cycle.id,
      task_id: task.id,
      task_occurrence_id: occurrenceId,
      type: 'credit',
      origin: 'task',
      description: `Bônus: ${title}`,
      amount: amt,
      status: 'approved',
      approved_by: userId,
      balance_after: 0,
    });
    if (insErr && !/duplicate key|unique constraint/i.test(insErr.message || '')) {
      console.warn('[task] bônus mesada:', insErr.message);
      return;
    }
    if (!insErr) {
      const { data: cyc } = await supabase.from('allowance_cycles').select('total_bonus').eq('id', cycle.id).maybeSingle();
      await supabase.from('allowance_cycles').update({ total_bonus: Number(cyc?.total_bonus ?? 0) + amt }).eq('id', cycle.id);
    }
    return;
  }

  if (!approved && Number(rule.discount_amount) > 0) {
    const amt = Number(rule.discount_amount);
    const { error: insErr } = await supabase.from('allowance_transactions').insert({
      id: uuidv4(),
      family_id: familyId,
      child_id: task.child_id,
      cycle_id: cycle.id,
      task_id: task.id,
      task_occurrence_id: occurrenceId,
      type: 'debit',
      origin: 'task',
      description: `Desconto: ${title} reprovada`,
      amount: amt,
      status: 'approved',
      approved_by: userId,
      balance_after: 0,
    });
    if (insErr && !/duplicate key|unique constraint/i.test(insErr.message || '')) {
      console.warn('[task] desconto mesada:', insErr.message);
      return;
    }
    if (!insErr) {
      const { data: cyc } = await supabase.from('allowance_cycles').select('total_discount').eq('id', cycle.id).maybeSingle();
      await supabase.from('allowance_cycles').update({ total_discount: Number(cyc?.total_discount ?? 0) + amt }).eq('id', cycle.id);
    }
  }
}

function mapCalendarEventFromDb(d) {
  if (!d) return d;
  const crRaw = d.creator;
  const cr = Array.isArray(crRaw) ? crRaw[0] : crRaw;
  const creatorName = cr?.name ?? null;
  const childName = d.children?.name ?? null;
  return {
    ...d,
    date: normalizeDbDate(d.date),
    end_date: d.end_date != null ? normalizeDbDate(d.end_date) : d.end_date,
    time: d.time != null ? String(d.time).slice(0, 8) : d.time,
    child_name: childName,
    child_color: d.children?.color,
    creator_name: creatorName,
    linked_user_label:
      childName || (!d.child_id ? (creatorName ? `Família · ${creatorName}` : 'Família') : '—'),
  };
}

function dedupeCalendarEvents(rows) {
  const byId = new Map();
  (rows || []).forEach((r) => {
    if (!r?.id) return;
    if (!byId.has(r.id)) byId.set(r.id, r);
  });
  return [...byId.values()];
}

/** Janela (dias civis) em que criamos várias linhas para recorrências não-diárias. */
const RECURRING_MATERIALIZE_OTHER_DAYS = 14;

function occurrenceInsideTaskCalendarBounds(task, ymd) {
  const sd = normalizeDbDate(task.start_date);
  const ed = task.end_date ? normalizeDbDate(task.end_date) : null;
  const d = normalizeDbDate(ymd);
  if (!sd || !d) return false;
  if (d < sd) return false;
  if (ed && d > ed) return false;
  return true;
}

/**
 * Garante uma linha de ocorrência PENDING por (tarefa diária × criança × dia).
 * “Amanhã aparece outra”: não materializamos 365 dias à frente.
 */
async function ensureDailyOccurrencesForDate(supabase, familyId, ymd) {
  const d = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, child_id, start_date, end_date, frequency, is_recurring, due_time')
    .eq('family_id', familyId)
    .eq('is_recurring', true)
    .eq('frequency', 'daily');
  if (error || !(tasks || []).length) return;
  const rows = [];
  for (const t of tasks) {
    if (!t.child_id) continue;
    if (!occurrenceInsideTaskCalendarBounds(t, d)) continue;
    const timePart = t.due_time ? normalizeTimeForDb(t.due_time) : null;
    rows.push({
      id: uuidv4(),
      task_id: t.id,
      family_id: familyId,
      child_id: t.child_id,
      occurrence_date: d,
      due_datetime: timePart ? `${d}T${timePart}` : null,
      status: 'pending',
    });
  }
  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error: upDailyErr } = await supabase
      .from('task_occurrences')
      .upsert(chunk, { onConflict: 'task_id,child_id,occurrence_date', ignoreDuplicates: true });
    if (upDailyErr && import.meta.env.DEV) console.warn('[tasks] ensure occurrences:', upDailyErr.message);
  }
}

function dedupeOccurrencesSameTaskSameDay(rows) {
  const m = new Map();
  const score = (r) => {
    const ts = Number(new Date(r.updated_at || r.created_at || 0).getTime()) || 0;
    let w = ts / 1e15;
    if (r.status === 'pending' || r.status === 'delayed' || r.status === 'in_progress') w += 10;
    return w;
  };
  for (const r of rows || []) {
    if (!r?.task_id || !r?.occurrence_date) {
      m.set(r?.id ?? `__anon_${m.size}`, r);
      continue;
    }
    const day = normalizeDbDate(r.occurrence_date);
    const k = `${r.task_id}|${day}`;
    const prev = m.get(k);
    if (!prev || score(r) >= score(prev)) m.set(k, r);
  }
  return [...m.values()];
}

/** Gera ocorrências ao criar tarefa — diárias: só o dia corrente (ou o primeiro dia se ainda no futuro). */
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
  const end = endStr ? parseLocal(endStr) : new Date(start.getTime() + 365 * 86400000);
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

  if (freq === 'daily') {
    const todayY = toYMDLocal();
    const sd = normalizeDbDate(startStr) || toYMDLocal(start);
    let targetDay;
    if (todayY < sd) targetDay = sd;
    else if (occurrenceInsideTaskCalendarBounds(task, todayY)) targetDay = todayY;
    else return []; // intervalo já terminado — sem ocorrências a criar
    add(targetDay);
    return out.sort();
  }

  /** Semanal/mensal/outras — janela curta para não criar meses de pendentes. */
  let iter = new Date(Math.min(start.getTime(), today.getTime()));
  iter.setHours(0, 0, 0, 0);
  const horizon = RECURRING_MATERIALIZE_OTHER_DAYS * 86400000;
  const limit = new Date(Math.max(today.getTime(), start.getTime()) + horizon);
  const endCap = new Date(Math.min(end.getTime(), limit.getTime()));

  while (iter <= endCap) {
    const ds = toYMDLocal(iter);
    if (iter >= start && occurrenceInsideTaskCalendarBounds(task, ds)) {
      if (freq === 'weekly') {
        const days = recurrence.length ? recurrence : [start.getDay()];
        if (days.includes(iter.getDay())) add(ds);
      } else if (freq === 'monthly') {
        if (iter.getDate() === start.getDate()) add(ds);
      } else {
        add(ds);
      }
    }
    iter.setDate(iter.getDate() + 1);
  }
  if (!out.length) add(normalizeDbDate(startStr));
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

/** Cor de evento válida (#RRGGBB) ou vazio */
function sanitizeCalendarColor(v) {
  const h = normalizeHex(v);
  return h && /^#[0-9A-F]{6}$/.test(h) ? h : '';
}

async function mergeChildCalendarColorAndScope(supabaseClient, row, scopeChildId) {
  if (!row || !scopeChildId) return row;
  row.child_id = scopeChildId;
  if (!sanitizeCalendarColor(row.color)) {
    const { data: chRow } = await supabaseClient
      .from('children')
      .select('color')
      .eq('id', scopeChildId)
      .maybeSingle();
    const fromProfile = sanitizeCalendarColor(chRow?.color);
    if (fromProfile) row.color = fromProfile;
  }
  return row;
}

/** Saldo previsível do ciclo de mesada (igual à lógica em MyAllowance). */
function computePredictedAllowanceBalance(settings, cycle) {
  if (!settings || !cycle) return 0;
  const ob = Number(cycle.opening_balance ?? 0);
  const basePart = settings.model_type !== 'accumulative' ? Number(cycle.base_amount ?? 0) : 0;
  const tb = Number(cycle.total_bonus ?? 0);
  const td = Number(cycle.total_discount ?? 0);
  const ma = Number(cycle.manual_adjustments ?? 0);
  return ob + basePart + tb + ma - td;
}

/** Símbolo para UI (settings.currency pode ser R$ ou BRL). */
function allowanceCurrencySymbol(currency) {
  const c = String(currency ?? '').trim().toUpperCase();
  if (!c || c === 'BRL') return 'R$';
  return currency || 'R$';
}

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

/** Sem `plan`, `subscription_status`, `trial_*`: estes campos só podem mudar por Edge Functions/webhook/RPC. */
const FAMILY_PATCH_KEYS = new Set([
  'name', 'language', 'contact_email', 'contact_phone', 'emoji', 'primary_color', 'secondary_color', 'logo_url',
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

    await ensureAuthResumeBeforeNetwork();

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
      let subjQ = supabase.from('grades').select('subject').eq('family_id', familyId);
      const { data: { session: sessSub } } = await supabase.auth.getSession();
      const uidSub = sessSub?.user?.id;
      if ((await getUserRole()) === 'child' && uidSub) {
        const scopeSub = await resolveViewerChildScope(familyId, uidSub);
        if (!scopeSub) return { data: [] };
        subjQ = subjQ.eq('child_id', scopeSub);
      }
      const { data: grades } = await subjQ;
      const uniq = [...new Set((grades || []).map((g) => g.subject).filter(Boolean))];
      return { data: uniq.sort() };
    }

    if (path.startsWith('/grades')) {
      let q = supabase.from('grades').select('*, children:child_id(name, color, avatar_url, avatar_preset)').eq('family_id', familyId);
      const { data: { session: sessGr } } = await supabase.auth.getSession();
      const uidGr = sessGr?.user?.id;
      let childIdParam = normalizeAuthChildUuid(config.params?.child_id);
      if ((await getUserRole()) === 'child' && uidGr) {
        const scopeGr = await resolveViewerChildScope(familyId, uidGr);
        if (!scopeGr) return { data: [] };
        childIdParam = scopeGr;
      }
      if (childIdParam) q = q.eq('child_id', childIdParam);
      const { data } = await q.order('date', { ascending: false });
      return { data: (data || []).map(mapGradeFromDb) };
    }
    
    if (path.startsWith('/calendar')) {
      const params = config.params || {};
      let fromStr = params.from ? String(params.from).slice(0, 10) : '';
      let toStr = params.to ? String(params.to).slice(0, 10) : '';

      const y = params.year != null ? parseInt(String(params.year), 10) : null;
      const m = params.month != null ? parseInt(String(params.month), 10) : null;
      if ((!fromStr || !toStr) && y != null && m != null && m >= 1 && m <= 12) {
        const pad = (n) => String(n).padStart(2, '0');
        fromStr = `${y}-${pad(m)}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        toStr = `${y}-${pad(m)}-${pad(lastDay)}`;
      }

      let filterChildUuid = '';
      let rawFc = params.filter_child_id ?? params.filterChildId ?? '';
      if (rawFc != null && rawFc !== '' && rawFc !== 'all') filterChildUuid = String(rawFc).trim();

      const role = await getUserRole();
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      /** Dependente não escolhe filtro por outra conta; segurança mesmo com RLS ampla na família. */
      if (role === 'child') filterChildUuid = '';

      let q = supabase
        .from('calendar_events')
        .select(CALENDAR_EVENT_SELECT)
        .eq('family_id', familyId)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (fromStr && toStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
        q = q.gte('date', fromStr).lte('date', toStr);
      }

      if ((role === 'parent' || role === 'relative') && filterChildUuid) {
        q = q.eq('child_id', filterChildUuid);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      let rows = data || [];

      if (role === 'child' && authUserId) {
        const myChildId = await getChildIdForLoggedInUser(authUserId, familyId);
        rows = rows.filter((ev) => {
          if (!ev || typeof ev !== 'object') return false;
          if (ev.visibility === 'private') return false;
          if (ev.visible_to_child === false) return false;
          if (!ev.child_id) return true;
          return myChildId != null && String(ev.child_id) === String(myChildId);
        });
      }

      rows = dedupeCalendarEvents(rows);
      return { data: rows.map(mapCalendarEventFromDb) };
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
      const expandAll = config.params?.all_dates === true || String(config.params?.all_dates || '') === '1';
      let d = config.params?.date || config.params?.occurrence_date;
      const rangeFrom = config.params?.from;
      const rangeTo = config.params?.to;

      if (!expandAll && !d && !rangeFrom && !rangeTo) {
        d = toYMDLocal();
      }

      /** Garante slot do dia civil para cada tarefa diária (sem pré-gerar meses à frente). */
      if (!expandAll && d && !rangeFrom && !rangeTo) {
        const ds = String(d).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
          await ensureDailyOccurrencesForDate(supabase, familyId, ds);
        }
      }

      if (!expandAll && rangeFrom && rangeTo) {
        const fromS = String(rangeFrom).slice(0, 10);
        const toS = String(rangeTo).slice(0, 10);
        const todayS = toYMDLocal();
        const reDate = /^\d{4}-\d{2}-\d{2}$/;
        if (reDate.test(fromS) && reDate.test(toS) && todayS >= fromS && todayS <= toS) {
          await ensureDailyOccurrencesForDate(supabase, familyId, todayS);
        }
      }

      let q = supabase.from('task_occurrences').select('*, tasks(*, task_allowance_rules(*))').eq('family_id', familyId);
      if (!expandAll && rangeFrom && rangeTo) {
        q = q.gte('occurrence_date', String(rangeFrom).slice(0, 10)).lte('occurrence_date', String(rangeTo).slice(0, 10));
      } else if (!expandAll && d && String(d).length >= 10) {
        q = q.eq('occurrence_date', String(d).slice(0, 10));
      }
      const { data: { session: sessOc } } = await supabase.auth.getSession();
      const uidOc = sessOc?.user?.id;
      let occChildFilter = normalizeAuthChildUuid(config.params?.child_id);
      if ((await getUserRole()) === 'child' && uidOc) {
        const scopeOc = await resolveViewerChildScope(familyId, uidOc);
        if (!scopeOc) return { data: [] };
        occChildFilter = scopeOc;
      }
      if (occChildFilter) q = q.eq('child_id', occChildFilter);
      const statusParam = config.params?.status;
      if (statusParam) q = q.eq('status', statusParam);
      const { data, error } = await q.order('occurrence_date', { ascending: true });
      if (error) throw new Error(error.message);
      const mapOcc = (o) => {
        const t = o.tasks || {};
        const rRaw = t.task_allowance_rules;
        const r = Array.isArray(rRaw) ? rRaw[0] : rRaw;
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
          affects_allowance: !!t.affects_allowance || !!r?.affects_allowance,
          bonus_amount: r?.bonus_amount ?? null,
          discount_amount: r?.discount_amount ?? null,
        };
      };
      const seenIds = new Set();
      const uniqData = (data || []).filter((o) => {
        if (!o?.id || seenIds.has(o.id)) return false;
        seenIds.add(o.id);
        return true;
      });
      const mapped = uniqData.map(mapOcc);
      const rows = dedupeOccurrencesSameTaskSameDay(mapped);
      const childIds = [...new Set(rows.map((r) => r.child_id).filter(Boolean))];
      let colors = {};
      if (childIds.length) {
        const { data: ch } = await supabase.from('children').select('id, name, color').in('id', childIds);
        (ch || []).forEach((c) => {
          colors[c.id] = { name: c.name, color: c.color };
        });
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
      let tq = supabase.from('tasks').select('*, task_allowance_rules(*)').eq('family_id', familyId);
      const { data: { session: sessTk } } = await supabase.auth.getSession();
      const uidTk = sessTk?.user?.id;
      if ((await getUserRole()) === 'child' && uidTk) {
        const scopeTk = await resolveViewerChildScope(familyId, uidTk);
        if (!scopeTk) return { data: [] };
        tq = tq.eq('child_id', scopeTk);
      }
      const { data, error } = await tq;
      if (error) throw new Error(error.message);
      return { data: (data || []).map(mapTaskRowWithAllowance) };
    }

    if (path === '/families') {
      const { data: family } = await supabase.from('families').select('*').eq('id', familyId).single();
      const { data: rawChildren } = await supabase.from('children').select('*').eq('family_id', familyId);
      const rows = rawChildren || [];
      const uids = [...new Set(rows.map((c) => c.user_id).filter(Boolean))];
      let emailMap = {};
      if (uids.length) {
        const { data: usRows } = await supabase.from('users').select('id, email').in('id', uids);
        (usRows || []).forEach((u) => {
          emailMap[u.id] = u.email;
        });
      }
      const children = rows.map((c) => ({
        ...c,
        user_email: c.user_id ? emailMap[c.user_id] ?? null : null,
      }));
      return { data: { family: family || {}, children } };
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
          supabase.from('medals').select('*').is('family_id', null).order('catalog_slug', { ascending: true }).order('created_at', { ascending: true }),
        ]);
        const fam = famMedals || [];
        const glob = dedupeMedalsForAwardingCatalog(globalMedals || []);
        glob.sort((a, b) =>
          String(a.catalog_slug || a.name || '').localeCompare(String(b.catalog_slug || b.name || ''), 'pt'),
        );
        return { data: [...fam, ...glob] };
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
      let redQ = supabase.from('redemptions').select('*').order('created_at', { ascending: false });

      const roleList = await getUserRole();
      const { data: { session: sessRed } } = await supabase.auth.getSession();
      const uidRed = sessRed?.user?.id;

      if (roleList === 'child' && uidRed) {
        const scopeRd = await resolveViewerChildScope(familyId, uidRed);
        if (!scopeRd) return { data: [] };
        redQ = redQ.eq('child_id', scopeRd);
      } else {
        const { data: kids } = await supabase.from('children').select('id').eq('family_id', familyId);
        const childIds = (kids || []).map((c) => c.id);
        if (!childIds.length) return { data: [] };
        redQ = redQ.in('child_id', childIds);
      }

      const { data: rows, error: redErr } = await redQ;
      if (redErr) throw new Error(redErr.message);
      const hydrated = await hydrateRedemptionsListRows(supabase, familyId, rows || []);
      return { data: hydrated };
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

    if (path === '/allowance/estimated-balance') {
      const {
        data: { session: sEb },
      } = await supabase.auth.getSession();
      const uidEb = sEb?.user?.id;
      let targetChildEb = normalizeAuthChildUuid(config.params?.child_id);
      const roleEb = await getUserRole();
      if (roleEb === 'child' && uidEb) {
        const scopeEb = await resolveViewerChildScope(familyId, uidEb);
        targetChildEb = scopeEb || '';
      }
      if (!targetChildEb) {
        return { data: { balance: 0, currency: 'BRL', symbol: 'R$', partial: true } };
      }
      const { data: chEb } = await supabase
        .from('children')
        .select('id')
        .eq('id', targetChildEb)
        .eq('family_id', familyId)
        .maybeSingle();
      if (!chEb?.id) {
        return { data: { balance: 0, currency: 'BRL', symbol: 'R$', partial: true } };
      }
      const { data: settingsEb } = await supabase
        .from('allowance_settings')
        .select('*')
        .eq('child_id', targetChildEb)
        .eq('family_id', familyId)
        .maybeSingle();
      if (!settingsEb) {
        return { data: { balance: 0, currency: 'BRL', symbol: 'R$', partial: true } };
      }
      const monthEb = new Date().getMonth() + 1;
      const yearEb = new Date().getFullYear();
      const { data: cycEb } = await supabase
        .from('allowance_cycles')
        .select('*')
        .eq('child_id', targetChildEb)
        .eq('month', monthEb)
        .eq('year', yearEb)
        .eq('status', 'open')
        .maybeSingle();
      const symEb = allowanceCurrencySymbol(settingsEb.currency);
      if (!cycEb) {
        const { data: prevEb } = await supabase
          .from('allowance_cycles')
          .select('final_amount')
          .eq('child_id', targetChildEb)
          .order('year', { ascending: false })
          .order('month', { ascending: false })
          .limit(1)
          .maybeSingle();
        const openingEb =
          settingsEb.allow_accumulation && prevEb?.final_amount != null ? Number(prevEb.final_amount) : 0;
        const baseEb = Number(settingsEb.base_amount ?? 0);
        const sliceEb = settingsEb.model_type !== 'accumulative' ? baseEb : 0;
        const estEb = openingEb + sliceEb;
        return {
          data: {
            balance: Math.max(estEb, 0),
            currency: settingsEb.currency || 'BRL',
            symbol: symEb,
            partial: true,
          },
        };
      }
      const balEb = computePredictedAllowanceBalance(settingsEb, cycEb);
      return {
        data: {
          balance: Math.max(balEb, 0),
          currency: settingsEb.currency || 'BRL',
          symbol: symEb,
          partial: false,
        },
      };
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

      const medalObjects = [];
      const byMedalPk = new Map();
      for (const e of earned || []) {
        let m = e.medals;
        if (Array.isArray(m)) m = m[0];
        if (!m?.id) continue;
        if (!byMedalPk.has(m.id)) {
          byMedalPk.set(m.id, m);
          medalObjects.push(m);
        }
      }
      const medalsForUi = dedupeEarnedMedalsForDisplay(medalObjects);

      return {
        data: {
          child: child || {},
          stats: { medalsEarned: medalsForUi.length },
          medals: medalsForUi,
          recentHistory: [],
        },
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

      const medalObjects = [];
      const byMedalPk = new Map();
      for (const e of earned || []) {
        let m = e.medals;
        if (Array.isArray(m)) m = m[0];
        if (!m?.id) continue;
        if (!byMedalPk.has(m.id)) {
          byMedalPk.set(m.id, m);
          medalObjects.push(m);
        }
      }
      const medalsForReports = dedupeEarnedMedalsForDisplay(medalObjects);

      return {
        data: {
          child: child || {},
          taskStats: { approved, pending },
          medals: medalsForReports,
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
      /** Só conta o que é “para fazer hoje”, não todas as pendências futuras/passadas das recorrentes */
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

      const pending = pendingToday;
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

    await ensureAuthResumeBeforeNetwork();

    const familyId = await getFamilyId();
    if (!familyId) throw new Error('Not authenticated');
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (path.startsWith('/calendar') && !userId) throw new Error('Sessão inválida: inicie sessão novamente.');

    if (path.startsWith('/grades')) {
      let gradePayload = { ...body };
      const forcedGradeChild = await resolveAuthorizedChildUuidForWrites(gradePayload, familyId, userId);
      if (!forcedGradeChild) {
        throw new Error(
          'Perfil da criança ainda não está disponível. Aguarde alguns segundos e volte a tentar, ou peça ao gestor para confirmar na família que a tua conta está ligada ao teu perfil.',
        );
      }
      const row = normalizeGradeRow({ ...gradePayload, child_id: forcedGradeChild }, familyId);
      /** Garante string explícita: o cliente Supabase omite chaves undefined no JSON para o REST. */
      const insertGrade = {
        ...omitUndefined(row),
        child_id: forcedGradeChild,
      };
      const { data, error } = await supabase.from('grades').insert([insertGrade]).select('*, children:child_id(name, color, avatar_url, avatar_preset)').single();
      if (error) throw new Error(error.message);
      const childIdAward = data?.child_id;
      if (childIdAward) {
        const { data: chAfter } = await supabase
          .from('children')
          .select('streak_current')
          .eq('id', childIdAward)
          .maybeSingle();
        await checkAndAwardMedals(supabase, childIdAward, familyId, chAfter?.streak_current || 0);
      }
      return { data: mapGradeFromDb(data) };
    }

    if (path.startsWith('/calendar')) {
      let row = omitNullish(pickCalendarRow(body, familyId, userId, true));
      if (!row.date) throw new Error('Indique a data do evento.');
      const roleCalPost = await getUserRole();
      if (roleCalPost === 'child' && userId) {
        const scopeCalPost = await resolveViewerChildScope(familyId, userId);
        if (scopeCalPost) await mergeChildCalendarColorAndScope(supabase, row, scopeCalPost);
      }
      const { data, error } = await supabase.from('calendar_events').insert([row]).select(CALENDAR_EVENT_SELECT).single();
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
      const allowanceRule = body.allowance_rule;
      const raw = { ...body };
      delete raw.allowance_rule;

      let picked = normalizeTaskPickedDatesAndRecurrence(pickTaskColumnsFromBody(raw));
      if (!picked.start_date) picked.start_date = toYMDLocal();
      picked.start_date = normalizeDbDate(picked.start_date) || toYMDLocal();
      picked.affects_allowance = !!(allowanceRule && allowanceRule.affects_allowance);

      const resolvedChildId = await resolveAuthorizedChildUuidForWrites(
        { ...raw, child_id: picked.child_id },
        familyId,
        userId,
      );

      if (!resolvedChildId) {
        throw new Error(
          'Perfil da criança ainda não está disponível para criar tarefas. Aguarde alguns segundos e volte a tentar, ou peça ao gestor para ligar a tua conta ao teu registo na família.',
        );
      }

      const role = await getUserRole();
      if (role === 'child') {
        picked.points = 0;
        picked.coins = 0;
        picked.is_recurring = false;
        picked.affects_allowance = false;
        picked.requires_approval = true;
      }

      const insertRow = omitUndefined({
        ...picked,
        family_id: familyId,
        created_by: userId || null,
        id: uuidv4(),
        child_id: resolvedChildId,
      });

      const { data: taskRow, error } = await supabase.from('tasks').insert([insertRow]).select('*, task_allowance_rules(*)').maybeSingle();
      if (error) throw new Error(error.message);

      if (allowanceRule !== undefined && taskRow?.id) {
        try {
          await syncTaskAllowanceRules(supabase, taskRow.id, allowanceRule);
        } catch (e) {
          console.warn('[tasks] regras mesada (post):', e instanceof Error ? e.message : e);
        }
      }

      let out = taskRow;
      if (taskRow?.id) {
        const { data: fr } = await supabase.from('tasks').select('*, task_allowance_rules(*)').eq('id', taskRow.id).eq('family_id', familyId).maybeSingle();
        if (fr) out = fr;
      }

      const occDates = computeOccurrenceDatesForTask(taskRow || out);
      if (occDates.length && (taskRow?.child_id || out?.child_id)) {
        const cid = taskRow?.child_id || out?.child_id;
        const timePart = (taskRow?.due_time ?? out?.due_time) ? normalizeTimeForDb(taskRow?.due_time ?? out?.due_time) : null;
        const occRows = occDates.map((od) => ({
          id: uuidv4(),
          task_id: taskRow?.id || out?.id,
          family_id: familyId,
          child_id: cid,
          occurrence_date: od,
          due_datetime: timePart ? `${od}T${timePart}` : null,
          status: 'pending',
        }));
        const { error: ocErr } = await supabase
          .from('task_occurrences')
          .upsert(occRows, { onConflict: 'task_id,child_id,occurrence_date', ignoreDuplicates: true });
        if (ocErr) console.warn('[tasks] ocorrências:', ocErr.message);
      }
      return { data: mapTaskRowWithAllowance(out || taskRow) };
    }

    if (path === '/allowance/rewards') {
      const { data, error } = await supabase.from('rewards').insert([{ ...body, family_id: familyId, id: uuidv4() }]).select().single();
      if (error) throw new Error(error.message);
      return { data };
    }

    const redeemMatch = path.match(/^\/allowance\/rewards\/([^/]+)\/redeem$/);
    if (redeemMatch) {
      const rewardId = redeemMatch[1];
      const { data: rew, error: rewErr } = await supabase
        .from('rewards')
        .select('id,name,icon,point_cost,family_id,is_active,available')
        .eq('id', rewardId)
        .eq('family_id', familyId)
        .maybeSingle();
      if (rewErr) throw new Error(rewErr.message);
      if (!rew?.id || rew.is_active === false || rew.available === false) {
        throw new Error('Esta recompensa não está disponível neste momento.');
      }

      const resolvedChildId = await resolveAuthorizedChildUuidForWrites(
        { ...body, child_id: body?.child_id ?? body?.childId },
        familyId,
        userId,
      );
      if (!resolvedChildId) {
        throw new Error(
          'Não conseguimos identificar o perfil para o resgate. Aguarda uns segundos ou pede ao gestor para ligar a conta ao nome da criança na família.',
        );
      }

      const { data: chRow } = await supabase
        .from('children')
        .select('points')
        .eq('id', resolvedChildId)
        .eq('family_id', familyId)
        .maybeSingle();
      if (!chRow) throw new Error('Perfil não encontrado nesta família.');
      const cost = Number(rew.point_cost ?? 0);
      const points = Number(chRow.points ?? 0);
      const reservedPending = await sumPendingRedemptionPointsForChild(supabase, resolvedChildId);
      const available = Math.max(0, points - reservedPending);
      if (cost > available) {
        if (cost > points) {
          throw new Error('Pontos insuficientes para pedir esta recompensa.');
        }
        throw new Error(
          'Saldo disponível não chega: parte dos pontos já está comprometida com outros resgates à espera de aprovação pelo gestor.',
        );
      }

      const { data, error } = await supabase
        .from('redemptions')
        .insert([{ reward_id: rewardId, child_id: resolvedChildId, status: 'pending', id: uuidv4() }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return {
        data: mapRedemptionListRow({
          ...data,
          rewards: { name: rew.name, icon: rew.icon ?? '🎁', point_cost: rew.point_cost },
        }),
      };
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
      const emailRaw = body?.email != null ? String(body.email).trim().toLowerCase() : '';
      if (!emailRaw) {
        throw new Error('Email e senha são obrigatórios para o filho poder iniciar sessão.');
      }

      const newUserId = await createLinkedChildAuthUser({
        email: emailRaw,
        password: body.password,
        displayName: body.name || emailRaw.split('@')[0],
        familyId,
        mustChangePassword: !!body.must_change_password,
      });

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
          user_id: newUserId,
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
        const { error: relChildErr } = await supabase.from('relative_children').insert(rows);
        if (relChildErr && import.meta.env.DEV) console.warn('[families] relative_children:', relChildErr.message);
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
      const { data, error } = await supabase
        .from('medals')
        .insert([omitNullish({ ...body, family_id: familyId, id: uuidv4() })])
        .select()
        .single();
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
      const { data: cyc } = await supabase
        .from('allowance_cycles')
        .select('child_id')
        .eq('id', cycleId)
        .eq('family_id', familyId)
        .maybeSingle();
      await supabase.from('allowance_cycles').update({ status: 'paid' }).eq('id', cycleId).eq('family_id', familyId);
      if (cyc?.child_id) {
        const { data: chAfter } = await supabase
          .from('children')
          .select('streak_current')
          .eq('id', cyc.child_id)
          .maybeSingle();
        await checkAndAwardMedals(supabase, cyc.child_id, familyId, chAfter?.streak_current || 0);
      }
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

    if (path.startsWith('/push/')) {
      return { data: { ok: true } };
    }

    await ensureAuthResumeBeforeNetwork();

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

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
      const { data: existing, error: exErr } = await supabase
        .from('children')
        .select('id, user_id')
        .eq('id', childId)
        .eq('family_id', familyId)
        .maybeSingle();
      if (exErr || !existing) throw new Error('Criança não encontrada.');

      let linkedUserId = existing.user_id;
      const emailRaw = body.email != null ? String(body.email).trim().toLowerCase() : '';

      if (!linkedUserId && emailRaw) {
        linkedUserId = await createLinkedChildAuthUser({
          email: emailRaw,
          password: body.password,
          displayName: body.name || emailRaw.split('@')[0],
          familyId,
          mustChangePassword: !!body.must_change_password,
        });
      }

      const patch = omitUndefined({
        name: body.name,
        nickname: body.nickname,
        age: body.age === '' || body.age === undefined ? null : Number(body.age),
        color: body.color,
        emoji: body.emoji,
        notes: body.notes,
        birthday: body.birthday === '' ? null : body.birthday,
        avatar_preset: body.avatar_preset,
        user_id: linkedUserId || undefined,
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
        const { error: famMemErr } = await supabase.from('family_members').upsert(
          { family_id: familyId, user_id: uid, relationship: body.relationship },
          { onConflict: 'family_id,user_id' },
        );
        if (famMemErr && import.meta.env.DEV) console.warn('[families] family_members:', famMemErr.message);
      }
      if (Array.isArray(body.linked_child_ids)) {
        await supabase.from('relative_children').delete().eq('relative_user_id', uid).eq('family_id', familyId);
        const rows = body.linked_child_ids.map((cid) => ({
          id: uuidv4(),
          relative_user_id: uid,
          child_id: cid,
          family_id: familyId,
        }));
        if (rows.length) {
          const { error: relRowsErr } = await supabase.from('relative_children').insert(rows);
          if (relRowsErr && import.meta.env.DEV) console.warn('[families] relative_children:', relRowsErr.message);
        }
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

    const updateTaskTemplateMatch = path.match(/^\/tasks\/([^/]+)$/);
    if (updateTaskTemplateMatch && updateTaskTemplateMatch[1] !== 'occurrences') {
      const taskId = updateTaskTemplateMatch[1];
      const allowanceRule = body.allowance_rule;
      let picked = normalizeTaskPickedDatesAndRecurrence(pickTaskColumnsFromBody(body));
      if (allowanceRule !== undefined) {
        picked.affects_allowance = !!(allowanceRule && allowanceRule.affects_allowance);
      }

      const { data: taskRow, error } = await supabase
        .from('tasks')
        .update(omitUndefined(picked))
        .eq('id', taskId)
        .eq('family_id', familyId)
        .select('*, task_allowance_rules(*)')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!taskRow) {
        throw new Error('Não foi possível atualizar a tarefa (nenhuma linha alterada ou sem permissão).');
      }

      if (allowanceRule !== undefined) {
        try {
          await syncTaskAllowanceRules(supabase, taskId, allowanceRule);
        } catch (e) {
          console.warn('[tasks] regras mesada (put):', e instanceof Error ? e.message : e);
        }
      }

      const { data: fresh } = await supabase
        .from('tasks')
        .select('*, task_allowance_rules(*)')
        .eq('id', taskId)
        .eq('family_id', familyId)
        .maybeSingle();
      return { data: mapTaskRowWithAllowance(fresh || taskRow) };
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

      /* Auto-concluídas (sem aprovação): mesada e gamificação na mesma transição */
      if (newStatus === 'completed' && occ.child_id && task && !task.is_health_reminder) {
        await applyTaskOccurrenceAllowanceOnDecision(supabase, { familyId, userId, occurrenceId: occId, approved: true, task });
      }

      if (newStatus === 'completed' && occ.child_id && task && !task.is_health_reminder && ((task.points || 0) > 0 || (task.coins || 0) > 0)) {
        const taskPoints = task.points || 0;
        const taskCoins = task.coins || 0;
        await supabase.from('task_occurrences').update({ points_awarded: taskPoints }).eq('id', occId);
        const { data: child } = await supabase.from('children').select('points, coins, xp, xp_next_level, level, streak_current, streak_best, streak_last_date').eq('id', occ.child_id).single();
        if (child) {
          const today = toYMDLocal(new Date());
          const y = new Date();
          y.setDate(y.getDate() - 1);
          const yesterday = toYMDLocal(y);
          const lastDate = child.streak_last_date ? normalizeDbDate(child.streak_last_date) : null;
          const newStreak = lastDate === yesterday ? (child.streak_current || 0) + 1 : lastDate === today ? child.streak_current : 1;
          const newXp = (child.xp || 0) + taskPoints;
          let newLevel = child.level || 1;
          let newXpNext = child.xp_next_level || 100;
          if (newXp >= newXpNext) {
            newLevel++;
            newXpNext = Math.round(newXpNext * 1.5);
          }
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
        }
      }

      if (newStatus === 'completed' && occ.child_id && task && !task.is_health_reminder) {
        const { data: chAfter } = await supabase.from('children').select('streak_current').eq('id', occ.child_id).maybeSingle();
        await checkAndAwardMedals(supabase, occ.child_id, familyId, chAfter?.streak_current || 0);
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

      const { data, error } = await supabase
        .from('task_occurrences')
        .update(patch)
        .eq('id', occId)
        .eq('family_id', familyId)
        .eq('status', 'waiting_approval')
        .select('*, tasks(*)')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        return { data: { ok: true, noop: true, message: 'Esta ocorrência já foi processada' } };
      }

      const task = data.tasks;
      if (task && !task.is_health_reminder) {
        await applyTaskOccurrenceAllowanceOnDecision(supabase, { familyId, userId, occurrenceId: occId, approved, task });
      }

      if (approved && data?.child_id && task && !task.is_health_reminder && ((task.points || 0) > 0 || (task.coins || 0) > 0)) {
        const taskPoints = task.points || 0;
        const taskCoins = task.coins || 0;
        await supabase.from('task_occurrences').update({ points_awarded: taskPoints }).eq('id', occId);
        const { data: child } = await supabase.from('children').select('points, coins, xp, xp_next_level, level, streak_current, streak_best, streak_last_date').eq('id', data.child_id).single();
        if (child) {
          const today = toYMDLocal(new Date());
          const y = new Date();
          y.setDate(y.getDate() - 1);
          const yesterday = toYMDLocal(y);
          const lastDate = child.streak_last_date ? normalizeDbDate(child.streak_last_date) : null;
          const newStreak = lastDate === yesterday ? (child.streak_current || 0) + 1 : lastDate === today ? child.streak_current : 1;
          const newXp = (child.xp || 0) + taskPoints;
          let newLevel = child.level || 1;
          let newXpNext = child.xp_next_level || 100;
          if (newXp >= newXpNext) {
            newLevel++;
            newXpNext = Math.round(newXpNext * 1.5);
          }
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
        }
      }

      if (approved && data?.child_id && task && !task.is_health_reminder) {
        const { data: chAfter } = await supabase.from('children').select('streak_current').eq('id', data.child_id).maybeSingle();
        await checkAndAwardMedals(supabase, data.child_id, familyId, chAfter?.streak_current || 0);
      }

      return { data };
    }

    if (path.match(/^\/gamification\/medals\/[^/]+$/)) {
      const mid = parts[2];
      const { data, error } = await supabase
        .from('medals')
        .update(omitNullish(body))
        .eq('id', mid)
        .eq('family_id', familyId)
        .select()
        .single();
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
      const roleAppr = await getUserRole();
      if (roleAppr !== 'master' && roleAppr !== 'parent' && roleAppr !== 'relative') {
        throw new Error('Sem permissão para aprovar resgates.');
      }

      const rid = parts[2];
      const { data: redemption, error: rdmErr } = await supabase
        .from('redemptions')
        .select('*')
        .eq('id', rid)
        .maybeSingle();
      if (rdmErr) throw new Error(rdmErr.message);
      if (!redemption) throw new Error('Pedido não encontrado.');

      const { data: reward, error: rwErr } = await supabase
        .from('rewards')
        .select('id,name,icon,point_cost,family_id')
        .eq('id', redemption.reward_id)
        .eq('family_id', familyId)
        .maybeSingle();
      if (rwErr) throw new Error(rwErr.message);
      if (!reward) throw new Error('Recompensa não encontrada nesta família.');

      const { data: childRow } = await supabase
        .from('children')
        .select('id,family_id,name')
        .eq('id', redemption.child_id)
        .maybeSingle();
      if (!childRow || childRow.family_id !== familyId) throw new Error('Pedido não pertence à tua família.');

      const wasPending = redemption.status === 'pending';
      const approved = !!body?.approved;
      const patch = {
        status: approved ? 'approved' : 'rejected',
        approved_by: userId ?? null,
        approved_at: new Date().toISOString(),
      };

      const { data: updatedRed, error: updRedErr } = await supabase
        .from('redemptions')
        .update(patch)
        .eq('id', rid)
        .select()
        .maybeSingle();
      if (updRedErr) throw new Error(updRedErr.message);

      if (approved && wasPending && updatedRed?.child_id) {
        const cost = Number(reward.point_cost ?? 0);
        if (cost > 0) {
          const { data: ptsRow } = await supabase
            .from('children')
            .select('points')
            .eq('id', redemption.child_id)
            .maybeSingle();
          const currentPts = Number(ptsRow?.points ?? 0);
          const nextPts = currentPts - cost;
          await supabase.from('children').update({ points: nextPts }).eq('id', redemption.child_id);

          const { error: txErr } = await supabase.from('allowance_transactions').insert({
            id: uuidv4(),
            family_id: familyId,
            child_id: redemption.child_id,
            reward_id: reward.id,
            type: 'debit',
            origin: 'reward',
            description: `Resgate: ${reward.name}`,
            amount: cost,
            status: 'approved',
            approved_by: userId ?? null,
            balance_after: 0,
          });
          if (txErr && import.meta.env.DEV) console.warn('[redemptions] lançamento mesada:', txErr.message);
        }

        const { data: chAfter } = await supabase.from('children').select('streak_current').eq('id', redemption.child_id).maybeSingle();
        await checkAndAwardMedals(supabase, redemption.child_id, familyId, chAfter?.streak_current || 0, {
          omitSpendableBonus: true,
        });
      }

      return {
        data: mapRedemptionListRow({
          ...updatedRed,
          rewards: reward,
          children: { name: childRow?.name ?? '' },
        }),
      };
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
      const allowanceRule = safeBody.allowance_rule;
      delete safeBody.allowance_rule;
      let picked = normalizeTaskPickedDatesAndRecurrence(pickTaskColumnsFromBody(safeBody));
      if (allowanceRule !== undefined) {
        picked.affects_allowance = !!(allowanceRule && allowanceRule.affects_allowance);
      }
      Object.keys(safeBody).forEach((k) => delete safeBody[k]);
      Object.assign(safeBody, omitUndefined(picked));
    } else if (table === 'calendar_events' || table === 'calendar') {
      const calPatch = pickCalendarRow(safeBody, familyId, userId, false);
      delete calPatch.family_id;
      delete calPatch.created_by;
      Object.keys(safeBody).forEach((k) => delete safeBody[k]);
      Object.assign(safeBody, calPatch);
      if (userId) {
        const roleCalPut = await getUserRole();
        if (roleCalPut === 'child') {
          const scopeCalPut = await resolveViewerChildScope(familyId, userId);
          if (scopeCalPut) await mergeChildCalendarColorAndScope(supabase, safeBody, scopeCalPut);
        }
      }
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

    await ensureAuthResumeBeforeNetwork();

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
      await supabase.from('medals').delete().eq('id', mid).eq('family_id', familyId);
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
