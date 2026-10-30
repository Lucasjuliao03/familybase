import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase, mapAuthNetworkError, reconnectSupabaseRealtime, shouldReconnectSupabaseRealtime } from '../lib/supabase';
import { dispatchFamiliaControlledResume } from '../lib/appResumeEvents';
import { famDiag } from '../lib/famDiag';
import { loadExistingFamilyProfile, registerLegacyFamilyAccount as registerFamilyAccount, signInExistingAccount as signInFamilyAccount } from '../lib/legacyFamilyAuth';
import { clearFamilyAssets, warmFamilyProfileAssets } from '../lib/familyAssets';
import { loadFamilyEntitlement, unavailableFamilyAccess } from '../lib/familyWebAccess';

const AuthContext = createContext(null);

// ─── Cache local no localStorage ─────────────────────────────────────────────
const CACHE_KEY = 'familia_profile_cache';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
/** Tempo máximo para verificar sessão no arranque (login aparece logo se expirar). */
const SESSION_CHECK_MS = 3_000;
const PROFILE_FRESH_TTL_MS = 5 * 60 * 1000;
const PROFILE_LOAD_TIMEOUT_MS = 30_000;

function saveProfileCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, _at: Date.now() }));
  } catch { /* storage cheio */ }
}

function loadProfileCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?._at || Date.now() - obj._at > CACHE_TTL_MS) return null;
    return obj;
  } catch { return null; }
}

function clearProfileCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODULES = {
  tasks: true,
  calendar: true,
  routines: true,
  medals: true,
  reports: true,
  shopping: true,
  mural: true,
  family_shop: true,
  allowance: true,
  piggy_bank: true,
  goals: true,
  notifications: true,
  health: true,
  location: true,
};

/**
 * Perfil na tabela children para conta com login de criança:
 * primeiro `children.user_id` = Auth; fallback a `child_id` nos metadados JWT (sessão válida).
 */
async function fetchChildProfileRowByAuth(supabaseClient, userId, familyId) {
  if (!userId || !familyId || !supabaseClient) return null;
  const { data: byUser } = await supabaseClient
    .from('children')
    .select('*')
    .eq('user_id', userId)
    .eq('family_id', familyId)
    .maybeSingle();
  if (byUser) return byUser;

  const { data: sessWrap, error: sessErr } = await supabaseClient.auth.getSession();
  if (sessErr || !sessWrap?.session?.user || sessWrap.session.user.id !== userId) return null;
  const { user } = sessWrap.session;
  const am = user.app_metadata || {};
  const raw = am.child_id || am.childId;
  const meta = raw != null ? String(raw).trim() : '';
  if (!meta || meta === 'undefined') return null;

  const { data: byMeta } = await supabaseClient
    .from('children')
    .select('*')
    .eq('family_id', familyId)
    .eq('id', meta)
    .eq('user_id', userId)
    .maybeSingle();
  return byMeta || null;
}

/**
 * Evita `await` infinito quando a aba esteve suspensa (ligações HTTP congeladas até morrerem).
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T|undefined>}
 */
async function raceMs(promise, ms) {
  const boxed = await Promise.race([
    promise.then((v) => ({ ok: true, v })),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false }), ms)),
  ]);
  return boxed.ok ? boxed.v : undefined;
}

function readInitialProfileCache() {
  if (typeof window === 'undefined') return null;
  const cached = loadProfileCache();
  return cached?.user ? cached : null;
}

export function AuthProvider({ children }) {
  const initialCache = readInitialProfileCache();
  const [user, setUser] = useState(initialCache?.user ?? null);
  const [family, setFamily] = useState(initialCache?.family ?? null);
  const [childProfile, setChildProfile] = useState(initialCache?.childProfile ?? null);
  const [mustChangePassword, setMustChangePassword] = useState(!!initialCache?.user?.must_change_password);
  const [modules, setModules] = useState(initialCache?.modules ?? {});
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const [effectiveSubscription, setEffectiveSubscription] = useState(null);
  const profileInflightRef = useRef(null);
  const profileLoadGenerationRef = useRef(0);
  /**
   * TTL de 5 minutos — evita re-fetch completo logo após recuperação de sessão.
   * Apenas operações de escrita ou logout invalidam o cache.
   */
  const profileFreshRef = useRef({ uid: null, at: 0 });
  /** Invalida hides antigos (StrictMode unmount antes de terminar hydrate). */
  const authHydrateSeqRef = useRef(0);
  const userRef = useRef(null);
  const loadingRef = useRef(true);
  const tabHiddenAtRef = useRef(0);
  /** Partilha a mesma Promessa se `performControlledResume` é chamado em paralelo. */
  const controlledResumeInflightRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    if (!user?.id || !family?.id) return;
    let active = true;
    const timer = setInterval(() => { void warmFamilyProfileAssets(supabase,family.id,family,true).then(() => {
      if (active) setFamily(p => p?.id===family.id ? { ...p }:p);
    }).catch(console.warn); },20*60*1000);
    return () => { active=false; clearInterval(timer); };
  },[user?.id,family]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const clearState = useCallback(() => {
    profileLoadGenerationRef.current += 1;
    clearFamilyAssets();
    clearProfileCache();
    profileFreshRef.current = { uid: null, at: 0 };
    setUser(null);
    setFamily(null);
    setChildProfile(null);
    setModules({});
    setEffectiveSubscription(null);
    setProfileLoading(false);
    setMustChangePassword(false);
  }, []);

  /**
   * Aplica snapshot de cache no estado React — UI aparece instantaneamente.
   * Não muda `loading` — isso é feito pelo chamador.
   */
  const applyProfileCache = useCallback((cached) => {
    if (!cached?.user) return false;
    setUser(cached.user);
    setFamily(cached.family ?? null);
    setModules(cached.modules ?? { ...DEFAULT_MODULES });
    setEffectiveSubscription(null); // Cached UI data never authorizes a family route.
    setChildProfile(cached.childProfile ?? null);
    setMustChangePassword(!!cached.user.must_change_password);
    return true;
  }, []);

  function rejectAfter(ms, message) {
    return new Promise((_, rej) => {
      setTimeout(() => rej(new Error(message)), ms);
    });
  }

  const loadUserProfile = useCallback(async (userId, emailHint, opts = {}) => {
    const force = !!opts?.force;
    const awaitFull = !!opts?.awaitFull;
    const awaitReady = !!opts?.awaitReady;
    if (force) {
      profileInflightRef.current = null;
    }
    const prev = profileInflightRef.current;
    if (prev?.userId && prev.userId !== userId) {
      profileInflightRef.current = null;
    }
    if (profileInflightRef.current?.userId === userId && profileInflightRef.current?.promise) {
      return profileInflightRef.current.promise;
    }

    const generation = ++profileLoadGenerationRef.current;
    let resolveReady;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

    const promise = (async () => {
      setProfileLoading(true);
      setEffectiveSubscription(null);
      try {
        const profileRow = await loadExistingFamilyProfile(supabase,userId);
        if (profileRow.status !== 'active') {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error('Acesso indisponível. Fale com o gestor da família.');
        }

        if (generation !== profileLoadGenerationRef.current) return;

        const emailResolved = profileRow.display_login || profileRow.email || emailHint || '';
        const userObj = { ...profileRow, email: emailResolved };
        const fid = profileRow.family_id;
        const wantsChildRow = profileRow.role === 'child';

        // Fase 1 — perfil mínimo disponível de imediato (role, email, family_id)
        setUser(userObj);
        setMustChangePassword(!!profileRow.must_change_password);
        resolveReady?.();

        return await Promise.race([
          (async () => {
            const [{ data: familyData }, { data: fmRows }, { data: cData }, effData] = await Promise.all([
              fid ? supabase.from('families').select('*').eq('id', fid).maybeSingle() : Promise.resolve({ data: null }),
              fid ? supabase.from('family_modules').select('module_key, is_enabled').eq('family_id', fid) : Promise.resolve({ data: [] }),
              wantsChildRow ? supabase.from('children').select('*').eq('user_id', userId).eq('family_id', fid).maybeSingle() : Promise.resolve({ data: null }),
              loadFamilyEntitlement(supabase, profileRow).catch(() => unavailableFamilyAccess(fid)),
            ]);

            if (generation !== profileLoadGenerationRef.current) return;

            let effectiveChildRow = cData;
            if (!effectiveChildRow && wantsChildRow && fid) {
              effectiveChildRow = await fetchChildProfileRowByAuth(supabase, userId, fid);
            }

            let resolvedFamily = familyData;

            setEffectiveSubscription(effData);
            if (resolvedFamily && effData.ok === true && effData.family_id === fid) {
              resolvedFamily = {
                ...resolvedFamily,
                subscription_status: effData.subscription_status ?? resolvedFamily.subscription_status,
                trial_ends_at: effData.trial_ends_at ?? resolvedFamily.trial_ends_at,
              };
            }

            if (generation !== profileLoadGenerationRef.current) return;

            const mergedMods = { ...DEFAULT_MODULES };
            (fmRows || []).forEach((r) => {
              if (r.module_key != null) mergedMods[r.module_key] = !!r.is_enabled;
            });

            await warmFamilyProfileAssets(supabase,fid,resolvedFamily);
            if (generation !== profileLoadGenerationRef.current) return;
            setFamily(resolvedFamily ?? null);
            setModules(mergedMods);
            setChildProfile(wantsChildRow ? (effectiveChildRow ?? null) : null);

            profileFreshRef.current = { uid: userId, at: Date.now() };
            saveProfileCache({
              user: userObj,
              family: resolvedFamily ?? null,
              modules: mergedMods,
              effectiveSubscription: null,
              childProfile: wantsChildRow ? (effectiveChildRow ?? null) : null,
            });
            return effData;
          })(),
          rejectAfter(PROFILE_LOAD_TIMEOUT_MS, 'profile_load_timeout'),
        ]);
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg === 'profile_load_timeout') {
          if (generation !== profileLoadGenerationRef.current) return;
          profileInflightRef.current = null;
          setEffectiveSubscription(unavailableFamilyAccess(null));
          setProfileLoading(false);
          profileLoadGenerationRef.current += 1;
          console.warn(
            '[auth] Carregamento do perfil excedeu o tempo seguro. Mantém-se a sessão — se a UI falhar, actualize a página.',
          );
          if (typeof window !== 'undefined') {
            dispatchFamiliaControlledResume();
          }
        } else {
          console.error('Erro ao carregar perfil:', err);
          throw err;
        }
      } finally {
        if (generation === profileLoadGenerationRef.current) {
          setProfileLoading(false);
        }
      }
    })();

    profileInflightRef.current = { userId, promise };
    const clearInflight = () => {
      if (profileInflightRef.current?.promise === promise) profileInflightRef.current = null;
    };
    promise.then(clearInflight, clearInflight);

    if (awaitFull) {
      await promise;
    } else if (awaitReady) {
      await readyPromise;
      promise.catch((e) => console.warn('[auth] loadUserProfile background:', e));
    } else {
      promise.catch((e) => console.warn('[auth] loadUserProfile background:', e));
    }
    return promise;
  }, []);

  useEffect(() => {
    const hydrateId = ++authHydrateSeqRef.current;
    let active=true;

    async function hydrateFromStorage() {
      try {
        const cached = loadProfileCache();
        if (cached?.user) {
          applyProfileCache(cached);
        }

        const sessWrap = await raceMs(supabase.auth.getSession(), SESSION_CHECK_MS);
        if (hydrateId !== authHydrateSeqRef.current) return;

        if (!sessWrap) {
          famDiag('auth/hydrate', 'getSession_timeout');
          if (cached?.user) {
            setLoading(false);
            return;
          }
          clearState();
          return;
        }

        const { data: { session }, error } = sessWrap;
        if (error) throw error;

        if (session?.user) {
          famDiag('auth/hydrate', 'session_ok');
          const em =
            session.user.email ||
            session.user.user_metadata?.email ||
            session.user.new_email ||
            '';

          setLoading(false);
          loadUserProfile(session.user.id, em).catch(console.warn);
        } else {
          famDiag('auth/hydrate', 'session_empty');
          clearState();
        }
      } catch (e) {
        if (hydrateId === authHydrateSeqRef.current) {
          console.error('[auth] hydrate getSession:', e);
          clearState();
        }
      } finally {
        if (hydrateId === authHydrateSeqRef.current) setLoading(false);
      }
    }

    hydrateFromStorage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      /** StrictMode faz subscribe/unsubscribe: INITIAL_SESSION pode perder-se; hydrateFromStorage garante entrada. */
      if (event === 'INITIAL_SESSION') return;
      /** Evitar re-fetch completo a cada renovação silenciosa de token → loops e flashes. */
      if (event === 'TOKEN_REFRESHED') return;
      setTimeout(() => { void (async () => {
      if (!active) return;
      try {
        if (event === 'SIGNED_OUT' || !session?.user) {
          profileFreshRef.current = { uid: null, at: 0 };
          clearState();
          return;
        }
        const uid = session.user.id;
        const fresh = profileFreshRef.current;
        // TTL de 5 minutos — evita re-fetch desnecessário
        if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED')
          && fresh.uid === uid
          && Date.now() - fresh.at < PROFILE_FRESH_TTL_MS
        ) {
          return;
        }
        const em =
          session.user.email ||
          session.user.user_metadata?.email ||
          session.user.new_email ||
          '';
        await loadUserProfile(uid, em);
      } catch (e) {
        if (!active) return;
        console.error('[auth] onAuthStateChange', event, e);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearState();
      }
      })().catch(console.warn); },0);
    });

    return () => {
      active=false;
      authHydrateSeqRef.current += 1;
      subscription?.unsubscribe();
    };
  }, [loadUserProfile, clearState, applyProfileCache]);

  /** Marca instante em que a aba passou a oculta (invalidação de cargas "zombie"). */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const markHidden = () => {
      if (document.visibilityState === 'hidden') tabHiddenAtRef.current = Date.now();
    };
    document.addEventListener('visibilitychange', markHidden);
    return () => document.removeEventListener('visibilitychange', markHidden);
  }, []);

  /**
   * Uma só rotina ao voltar à aba — OTIMIZADA:
   * 1. Se perfil ainda fresco (< 5min) → só reconecta Realtime, sem re-fetch de perfil
   * 2. Se perfil expirou → refresh em background (não bloqueia a UI)
   * 3. Token só é refrescado se necessário (< 10min para expirar)
   */
  const performControlledResume = useCallback(async () => {
    if (controlledResumeInflightRef.current) {
      return controlledResumeInflightRef.current;
    }

    const p = (async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      const hiddenStarted = tabHiddenAtRef.current;
      const hiddenMs = hiddenStarted ? Date.now() - hiddenStarted : 0;
      tabHiddenAtRef.current = 0;

      try {
        // Verificar sessão (timeout curto — 4s)
        const sessWrap = await raceMs(supabase.auth.getSession(), 4000);
        if (!sessWrap) {
          famDiag('auth/resume', 'getSession_timeout');
          return;
        }
        const { data: sessData, error: sessErr } = sessWrap;
        if (sessErr || !sessData?.session?.user?.id) return;

        const session = sessData.session;
        const uid = session?.user?.id;
        if (!uid) return;

        const accessToken = session?.access_token ?? null;
        const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
        const msToExpiry = expiresAt ? expiresAt - Date.now() : Infinity;

        // Só refrescar token se estiver a < 10min de expirar
        if (msToExpiry < 10 * 60 * 1000) {
          raceMs(supabase.auth.refreshSession(), 5000).catch(() => {});
        }

        // Reconectar Realtime se necessário (não bloqueia a UI)
        const needsRealtimeKick =
          hiddenMs >= 4200 ||
          shouldReconnectSupabaseRealtime(supabase, hiddenMs);
        if (needsRealtimeKick) {
          reconnectSupabaseRealtime(supabase, accessToken ?? undefined).catch(() => {});
        }

        // Verificar se o perfil ainda está fresco
        const fresh = profileFreshRef.current;
        const profileStale = !fresh.uid || fresh.uid !== uid || Date.now() - fresh.at >= PROFILE_FRESH_TTL_MS;

        if (profileStale || hiddenMs > 280) {
          // Reset inflight para permitir novo carregamento
          profileInflightRef.current = null;
          profileLoadGenerationRef.current += 1;

          const em =
            session.user.email ||
            session.user.user_metadata?.email ||
            session.user.new_email ||
            '';

          // Carregar perfil em background — não bloqueia a UI (React já tem dados do cache)
          loadUserProfile(uid, em, { force: true }).catch(console.warn);
        }
      } catch (e) {
        console.warn('[auth] performControlledResume:', e);
      } finally {
        dispatchFamiliaControlledResume();
      }
    })();

    controlledResumeInflightRef.current = p.catch(() => {}).finally(() => {
      controlledResumeInflightRef.current = null;
    });

    return controlledResumeInflightRef.current;
  }, [loadUserProfile]);

  const login = async (email, password, familyCode) => {
    try {
      const data = await signInFamilyAccount(supabase, email, password, familyCode);
      await loadUserProfile(data.user.id, undefined, { awaitFull: true });
      return { user: data.user };
    } catch (e) { throw mapAuthNetworkError(e); }
  };

  const register = async (formData) => {
    try {
      const result = await registerFamilyAccount(supabase, formData,new URL('/login',window.location.origin).href);
      if (result.status === 'registered') await loadUserProfile(result.userId, undefined, { awaitFull: true,force:true });
      return result;
    } catch (e) { throw mapAuthNetworkError(e); }
  };

  const logout = async () => {
    setLoading(false);
    clearProfileCache();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* 403 em logout global: scope local limpa sessão na mesma */
    }
    clearState();
  };

  const fetchMe = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return loadUserProfile(user.id, user.email, { force: true });
  }, [loadUserProfile]);

  /** Re-resolve children.* após login tardio ou vínculo recente (sem exigir reload). */
  const ensureChildProfile = useCallback(async () => {
    const u = userRef.current;
    if (!u?.id || u.role !== 'child' || !u.family_id) return null;
    const row = await fetchChildProfileRowByAuth(supabase, u.id, u.family_id);
    if (row) setChildProfile(row);
    return row;
  }, []);

  const clearMustChangePassword = () => setMustChangePassword(false);

  return (
    <AuthContext.Provider value={{
      user,
      family,
      effectiveSubscription,
      childProfile,
      mustChangePassword,
      modules,
      setModules,
      loading,
      profileLoading,
      login,
      register,
      logout,
      fetchMe,
      ensureChildProfile,
      clearMustChangePassword,
      performControlledResume,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// The provider and its consumer hook intentionally share the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
