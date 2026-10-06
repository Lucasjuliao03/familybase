/**
 * Helpers PUROS (sem dependências de React Native / Supabase) para o modo
 * "proxy de perfil do filho". Mantidos isolados para serem testáveis com
 * `node --test` sem precisar do runtime do Expo.
 */

export interface ProxySession {
  /** id do registro em `children` (perfil do filho). */
  childProfileId: string;
  /** id de login do filho em `users` (pode ser null se o filho não tem conta). */
  childUserId: string | null;
  childName: string;
  childColor?: string | null;
  childAvatarUrl?: string | null;
  childAvatarPreset?: string | null;
  /** id do pai/gestor que está atuando como o filho. */
  parentId: string;
  parentName?: string | null;
  familyId: string;
  startedAt: string;
}

export interface ProxyAuditRow {
  child_id: string;
  performed_by: string;
  action: string;
  http_method: string | null;
  path: string | null;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
}

/** Métodos HTTP que mutam dados e portanto devem ser auditados em modo filho. */
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(String(method || '').toLowerCase());
}

/** Remove querystring de uma URL relativa. */
export function normalizePath(url: string): string {
  return String(url || '').split('?')[0];
}

/** Extrai o id final de um path REST tipo `/tasks/occurrences/<id>/complete`. */
export function extractEntityId(path: string): string | null {
  const segs = normalizePath(path).split('/').filter(Boolean);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (uuidRe.test(segs[i])) return segs[i];
  }
  return null;
}

/**
 * Deriva um rótulo de ação legível a partir do método e do path REST.
 * Ex.: PUT /tasks/occurrences/<id>/complete -> 'task_complete'.
 */
export function deriveProxyAction(method: string, url: string): string {
  const path = normalizePath(url);
  const m = String(method || '').toLowerCase();

  if (/\/tasks\/occurrences\/[^/]+\/complete$/.test(path)) return 'task_complete';
  if (/\/tasks\/occurrences\/[^/]+\/approve$/.test(path)) return 'task_review';
  if (/\/tasks\/occurrences\/[^/]+$/.test(path)) return 'task_occurrence_update';
  if (path.startsWith('/tasks')) return m === 'post' ? 'task_suggest' : 'task_update';
  if (path.startsWith('/health/medication-logs')) return 'health_medication_log';
  if (path.startsWith('/health')) return 'health_update';
  if (path.startsWith('/grades')) return 'grade_update';
  if (path.startsWith('/allowance/redemptions')) return 'allowance_redemption';
  if (path.startsWith('/allowance')) return 'allowance_update';
  if (path.startsWith('/calendar')) return 'calendar_update';
  if (path.startsWith('/shopping')) return 'shopping_update';
  if (path.startsWith('/mural')) return 'mural_update';
  if (path.startsWith('/store') || path.startsWith('/family-shop')) return 'store_update';

  const top = path.split('/').filter(Boolean)[0] || 'action';
  return `${top}_${m}`;
}

/** Resume o corpo de uma requisição para o log, sem vazar dados volumosos/sensíveis. */
export function summarizeBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object') return {};
  const out: Record<string, unknown> = {};
  const SENSITIVE = new Set(['password', 'senha', 'token', 'access_token', 'logo', 'file']);
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE.has(k.toLowerCase())) continue;
    if (typeof v === 'string') {
      out[k] = v.length > 280 ? `${v.slice(0, 277)}…` : v;
    } else if (v == null || ['number', 'boolean'].includes(typeof v)) {
      out[k] = v;
    } else {
      out[k] = '[obj]';
    }
  }
  return out;
}

/**
 * Monta a linha de auditoria para uma mutação executada em modo filho.
 * `user_id` lógico = filho (child_id); `performed_by` = pai.
 */
export function buildProxyAuditRow(
  session: ProxySession,
  method: string,
  url: string,
  body?: unknown,
): ProxyAuditRow {
  return {
    child_id: session.childProfileId,
    performed_by: session.parentId,
    action: deriveProxyAction(method, url),
    http_method: String(method || '').toUpperCase() || null,
    path: normalizePath(url) || null,
    entity: normalizePath(url).split('/').filter(Boolean)[0] || null,
    entity_id: extractEntityId(url),
    metadata: {
      child_profile_id: session.childProfileId,
      child_user_id: session.childUserId,
      child_name: session.childName,
      body: summarizeBody(body),
    },
  };
}

// ─── Reducer puro do estado do proxy (transições enter/exit) ───────────────

export interface EnterArgs {
  child: {
    id: string;
    user_id?: string | null;
    name?: string | null;
    color?: string | null;
    avatar_url?: string | null;
    avatar_preset?: string | null;
    family_id?: string | null;
  };
  parent: { id: string; name?: string | null; family_id?: string | null };
  now?: () => string;
}

/** Constrói uma ProxySession a partir do filho e do pai (sem efeitos colaterais). */
export function makeProxySession({ child, parent, now }: EnterArgs): ProxySession {
  if (!child?.id) throw new Error('Filho inválido para entrar em modo filho.');
  if (!parent?.id) throw new Error('Responsável inválido para entrar em modo filho.');
  const familyId = String(child.family_id || parent.family_id || '');
  return {
    childProfileId: String(child.id),
    childUserId: child.user_id ? String(child.user_id) : null,
    childName: child.name || 'Filho(a)',
    childColor: child.color ?? null,
    childAvatarUrl: child.avatar_url ?? null,
    childAvatarPreset: child.avatar_preset ?? null,
    parentId: String(parent.id),
    parentName: parent.name ?? null,
    familyId,
    startedAt: (now ? now() : new Date().toISOString()),
  };
}

/**
 * Valida se um responsável pode entrar no perfil de um filho.
 * Regra de segurança (requisito 6): apenas pais/gestores/parentes/master,
 * e o filho precisa pertencer à mesma família.
 */
export function canActAsChild(
  parentRole: string | undefined | null,
  parentFamilyId: string | undefined | null,
  childFamilyId: string | undefined | null,
): boolean {
  const role = String(parentRole || '');
  if (!['parent', 'relative', 'master'].includes(role)) return false;
  if (role === 'master') return true;
  if (!parentFamilyId || !childFamilyId) return false;
  return String(parentFamilyId) === String(childFamilyId);
}
