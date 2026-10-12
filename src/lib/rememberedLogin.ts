import { normalizeEmail, normalizeFamilyCode, normalizeUsername } from './familyIdentity.js';

export type RememberedLogin =
  | { version: 1; mode: 'family'; familyCode: string; username: string }
  | { version: 1; mode: 'email'; email: string };

export function loginIdentity(login: string, familyCode?: string): RememberedLogin | null {
  if (familyCode !== undefined) {
    const code = normalizeFamilyCode(familyCode);
    const username = normalizeUsername(login);
    return code && username ? { version: 1, mode: 'family', familyCode: code, username } : null;
  }
  const email = normalizeEmail(login);
  // Legacy child emails remain valid. Internal Auth aliases are never suggested.
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('.invalid')
    ? { version: 1, mode: 'email', email } : null;
}

export function parseRememberedLogin(raw: string | null): RememberedLogin | null {
  if (!raw || raw.length > 512) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1) return null;
    if (value.mode === 'family' && typeof value.familyCode === 'string' && typeof value.username === 'string') {
      return loginIdentity(value.username, value.familyCode);
    }
    if (value.mode === 'email' && typeof value.email === 'string') return loginIdentity(value.email);
  } catch { /* Invalid or obsolete data cannot prefill a login. */ }
  return null;
}

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
const KEY = 'tdf.remembered-login.v1';

/** One last confirmed identity, explicit fields only; no passwords, tokens or IPs. */
export function createRememberedLoginStore(storage: Storage) {
  let pending: Promise<unknown> = Promise.resolve();
  function queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation);
    pending = result.catch(() => {});
    return result;
  }
  return {
    read: () => queue(async () => parseRememberedLogin(await storage.getItem(KEY))),
    save: (identity: RememberedLogin) => queue(async () => {
      const clean = parseRememberedLogin(JSON.stringify(identity));
      if (!clean) throw new Error('Dados de acesso inválidos.');
      await storage.setItem(KEY, JSON.stringify(clean));
    }),
    clear: () => queue(() => storage.removeItem(KEY)),
  };
}
