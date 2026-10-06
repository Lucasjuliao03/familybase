/**
 * Store de runtime do modo "proxy de perfil do filho".
 *
 * Mantém, fora do React, qual filho o pai está a "encarnar". É usado por:
 *  - AuthContext (estado/UI),
 *  - services/api.js (escopo de leituras/escritas + auditoria de mutações).
 *
 * Ter o estado fora do React permite que o `api.js` (que não é um componente)
 * saiba qual o filho ativo sem ter de passar o id em todas as chamadas.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  ProxySession,
  isMutatingMethod,
  buildProxyAuditRow,
  deriveProxyAction,
} from './proxyAudit';

export type { ProxySession } from './proxyAudit';

const STORAGE_KEY = 'familia_child_proxy';

let current: ProxySession | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
}

export function subscribeChildProxy(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getChildProxy(): ProxySession | null {
  return current;
}

export function isChildProxyActive(): boolean {
  return current != null;
}

/** id do perfil (`children.id`) do filho ativo, ou '' se não houver proxy. */
export function getProxyChildId(): string {
  return current?.childProfileId ?? '';
}

/** id do pai/gestor que está a atuar como o filho, ou '' se não houver proxy. */
export function getProxyActorId(): string {
  return current?.parentId ?? '';
}

function persist(session: ProxySession | null) {
  try {
    if (session) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  } catch { /* noop */ }
}

/** Define a sessão de proxy ativa e notifica subscritores. */
export function setChildProxy(session: ProxySession | null) {
  current = session;
  persist(session);
  emit();
  if (session) {
    // Marca a entrada no perfil do filho na trilha de auditoria.
    void recordProxyEvent('proxy_enter', { started_at: session.startedAt });
  }
}

/** Encerra o modo filho (volta ao perfil do pai). */
export async function clearChildProxy() {
  const ending = current;
  if (ending) {
    await recordProxyEvent('proxy_exit', { started_at: ending.startedAt });
  }
  current = null;
  persist(null);
  emit();
}

/** Restaura o proxy persistido (chamado na hidratação do AuthContext). */
export async function hydrateChildProxy(): Promise<ProxySession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProxySession;
    if (parsed?.childProfileId && parsed?.parentId) {
      current = parsed;
      emit();
      return parsed;
    }
  } catch { /* noop */ }
  return null;
}

/**
 * Registra um evento de proxy (entrada/saída) na auditoria do Supabase.
 * Falhas são engolidas para nunca quebrar a navegação.
 */
async function recordProxyEvent(action: string, metadata: Record<string, unknown> = {}) {
  const session = current;
  if (!session) return;
  try {
    await supabase.rpc('log_child_proxy_action', {
      p_child_id: session.childProfileId,
      p_action: action,
      p_method: null,
      p_path: null,
      p_entity: 'proxy',
      p_entity_id: null,
      p_metadata: {
        child_name: session.childName,
        child_user_id: session.childUserId,
        parent_id: session.parentId,
        ...metadata,
      },
    });
  } catch { /* auditoria best-effort */ }
}

/**
 * Audita uma mutação (PUT/POST/DELETE) executada enquanto em modo filho.
 * Chamado pelo wrapper de `api.js`. Best-effort: nunca lança.
 */
export async function auditProxyMutation(method: string, url: string, body?: unknown) {
  const session = current;
  if (!session) return;
  if (!isMutatingMethod(method)) return;
  // Não auditar chamadas de leitura disfarçadas de POST (ex.: cycles/current).
  const path = String(url || '').split('?')[0];
  if (path.endsWith('/cycles/current') || path.endsWith('/estimated-balance')) return;

  try {
    const row = buildProxyAuditRow(session, method, url, body);
    await supabase.rpc('log_child_proxy_action', {
      p_child_id: row.child_id,
      p_action: row.action,
      p_method: row.http_method,
      p_path: row.path,
      p_entity: row.entity,
      p_entity_id: row.entity_id,
      p_metadata: row.metadata,
    });
  } catch { /* auditoria best-effort */ }
}

export { deriveProxyAction };
