import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase, mapAuthNetworkError, reconnectSupabaseRealtime } from '../lib/supabase';
import { famDiag } from '../lib/famDiag';

const AuthContext = createContext(null);

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
  const um = user.user_metadata || {};
  const am = user.app_metadata || {};
  const raw = um.child_id || um.childId || am.child_id || am.childId;
  const meta = raw != null ? String(raw).trim() : '';
  if (!meta || meta === 'undefined') return null;

  const { data: byMeta } = await supabaseClient
    .from('children')
    .select('*')
    .eq('family_id', familyId)
    .eq('id', meta)
    .maybeSingle();
  return byMeta || null;
}

/** Fallback cliente se RPC get_effective_subscription ainda não estiver deployado. */
function buildEffectiveSubscriptionFallback(profileRow, resolvedFamily, userId) {
  const fam = resolvedFamily;
  if (!fam || !profileRow?.family_id) {
    return {
      ok: true,
      has_access: false,
      reason: 'no_family',
      family_id: profileRow?.family_id ?? null,
      gestor_id: null,
      subscription_status: null,
      trial_ends_at: null,
      can_manage_billing: false,
      is_billing_contact: false,
    };
  }
  const sub = fam.subscription_status || 'trial';
  let hasAccess = false;
  let reason = 'no_subscription';
  const endsTs = fam.trial_ends_at ? new Date(fam.trial_ends_at).getTime() : null;
  const trialAlive = endsTs != null && !Number.isNaN(endsTs) ? endsTs >= Date.now() : false;

  if (sub === 'active') {
    hasAccess = true;
    reason = 'subscription_active';
  } else if (sub === 'trial') {
    if (trialAlive || fam.trial_ends_at == null) {
      hasAccess = true;
      reason = 'trial_active';
    } else {
      reason = 'trial_expired';
    }
  } else if (sub === 'past_due') {
    reason = 'subscription_past_due';
  } else if (sub === 'expired' || sub === 'cancelled') {
    reason = 'subscription_blocked';
  }

  let canManage = false;
  if (profileRow.role === 'parent') {
    const ap = profileRow.access_profile ?? profileRow.accessProfile ?? 'gestor';
    const isGestProf = ap === 'gestor';
    if (isGestProf) {
      const gid = fam.gestor_user_id;
      canManage = !gid ? true : gid === userId;
    }
  }

  return {
    ok: true,
    has_access: hasAccess,
    reason,
    family_id: fam.id,
    gestor_id: fam.gestor_user_id ?? null,
    subscription_status: fam.subscription_status,
    trial_ends_at: fam.trial_ends_at,
    can_manage_billing: canManage,
    is_billing_contact: canManage,
  };
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);

  const [effectiveSubscription, setEffectiveSubscription] = useState(null);
  const profileInflightRef = useRef(null);
  const profileLoadGenerationRef = useRef(0);
  /** Evita re-fetch completo logo após recuperação de sessão (same tab / visibility). */
  const profileFreshRef = useRef({ uid: null, at: 0 });
  /** Invalida hides antigos (StrictMode unmount antes de terminar hydrate). */
  const authHydrateSeqRef = useRef(0);
  const userRef = useRef(null);
  const loadingRef = useRef(true);
  const tabHiddenAtRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const clearState = useCallback(() => {
    setUser(null);
    setFamily(null);
    setChildProfile(null);
    setModules({});
    setEffectiveSubscription(null);
  }, []);

  const PROFILE_LOAD_TIMEOUT_MS = 70_000;

  function rejectAfter(ms, message) {
    return new Promise((_, rej) => {
      setTimeout(() => rej(new Error(message)), ms);
    });
  }

  const loadUserProfile = useCallback(async (userId, emailHint, opts = {}) => {
    const force = !!opts?.force;
    if (force) {
      profileInflightRef.current = null;
    }
    const prev = profileInflightRef.current;
    // Utilizador diferente: novo carregamento (não reutilizar promessa pendente de outra conta).
    if (prev?.userId && prev.userId !== userId) {
      profileInflightRef.current = null;
    }
    if (profileInflightRef.current?.userId === userId && profileInflightRef.current?.promise) {
      return profileInflightRef.current.promise;
    }

    const generation = ++profileLoadGenerationRef.current;

    const promise = (async () => {
      try {
        await Promise.race([
          (async () => {
            const { data: profile, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .single();

            let profileRow = profile;

            if (error?.code === 'PGRST116') {
              const { error: rpcErr } = await supabase.rpc('register_family_and_user', {
                p_family_name: null,
                p_user_name: null,
              });
              const retry = await supabase.from('users').select('*').eq('id', userId).single();
              if (!rpcErr && !retry.error && retry.data) {
                profileRow = retry.data;
              } else {
                console.warn('[auth] Sem linha em public.users (registo?):', rpcErr?.message || retry.error?.message || '');
                if (generation === profileLoadGenerationRef.current) clearState();
                return;
              }
            } else if (error) {
              console.error('Erro ao carregar public.users:', error.code, error.message);
              await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
              throw new Error(
                'Não foi possível ler o perfil na base de dados (erro do servidor). ' +
                  'No Supabase, execute o script supabase_baas_complete_fix.sql no SQL Editor.',
              );
            }

            if (!profileRow) {
              if (generation === profileLoadGenerationRef.current) clearState();
              return;
            }

            if (!profileRow.family_id) {
              const { error: provErr } = await supabase.rpc('register_family_and_user', {
                p_family_name: null,
                p_user_name: null,
              });
              if (provErr) {
                console.error('[auth] RPC register_family:', provErr.message);
              } else {
                const refill = await supabase.from('users').select('*').eq('id', userId).single();
                if (!refill.error && refill.data) {
                  profileRow = refill.data;
                }
              }
            }

            if (!profileRow?.family_id) {
              console.warn('[auth] Conta sem família; complete registo ou SQL de correção.');
            }

            if (generation !== profileLoadGenerationRef.current) return;

            const emailResolved = emailHint || profileRow.email || '';

            setUser({ ...profileRow, email: emailResolved });
            setMustChangePassword(!!profileRow.must_change_password);

            const fid = profileRow.family_id;
            const wantsChildRow = profileRow.role === 'child';

            const familyQ = fid
              ? supabase.from('families').select('*').eq('id', fid).maybeSingle()
              : Promise.resolve({ data: null });
            const modsQ = fid
              ? supabase.from('family_modules').select('module_key, is_enabled').eq('family_id', fid)
              : Promise.resolve({ data: [] });
            const childQ = wantsChildRow
              ? supabase.from('children').select('*').eq('user_id', userId).maybeSingle()
              : Promise.resolve({ data: null });

            const [{ data: familyData }, { data: fmRows }, { data: cData }] = await Promise.all([
              familyQ,
              modsQ,
              childQ,
            ]);

            if (generation !== profileLoadGenerationRef.current) return;

            let effectiveChildRow = cData;
            if (!effectiveChildRow && wantsChildRow && fid) {
              effectiveChildRow = await fetchChildProfileRowByAuth(supabase, userId, fid);
            }

            let resolvedFamily = familyData;

            try {
              const rpcDeadlineMs = 12_000;
              const rpcRes = await Promise.race([
                supabase.rpc('get_effective_subscription'),
                new Promise((_, rej) =>
                  setTimeout(() => rej(Object.assign(new Error('subscription_rpc_deadline'), { code: 'DEADLINE' })), rpcDeadlineMs),
                ),
              ]);
              const { data: effData, error: effErr } = rpcRes;
              if (!effErr && effData != null && typeof effData === 'object') {
                if (generation !== profileLoadGenerationRef.current) return;
                setEffectiveSubscription(effData);
                const fidEFF = effData.family_id ?? fid;
                if (resolvedFamily && fidEFF && String(resolvedFamily.id) === String(fidEFF)) {
                  resolvedFamily = {
                    ...resolvedFamily,
                    subscription_status: effData.subscription_status ?? resolvedFamily.subscription_status,
                    trial_ends_at: effData.trial_ends_at ?? resolvedFamily.trial_ends_at,
                  };
                }
              } else {
                throw effErr || new Error('rpc_effective_subscription');
              }
            } catch (_) {
              if (generation !== profileLoadGenerationRef.current) return;
              setEffectiveSubscription(buildEffectiveSubscriptionFallback(profileRow, resolvedFamily ?? null, userId));
            }

            if (generation !== profileLoadGenerationRef.current) return;

            setFamily(resolvedFamily ?? null);

            if (!fid || !fmRows?.length) {
              setModules({ ...DEFAULT_MODULES });
            } else {
              const mergedMods = { ...DEFAULT_MODULES };
              fmRows.forEach((r) => {
                if (r.module_key != null) mergedMods[r.module_key] = !!r.is_enabled;
              });
              setModules(mergedMods);
            }

            setChildProfile(wantsChildRow ? (effectiveChildRow ?? null) : null);
            profileFreshRef.current = { uid: userId, at: Date.now() };
          })(),
          rejectAfter(PROFILE_LOAD_TIMEOUT_MS, 'profile_load_timeout'),
        ]);
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg === 'profile_load_timeout') {
          profileInflightRef.current = null;
          profileLoadGenerationRef.current += 1;
          console.warn(
            '[auth] Carregamento do perfil excedeu o tempo seguro. Mantém-se a sessão — se a UI falhar, actualize a página. ' +
              '(Rede lenta, RPC get_effective_subscription ou RLS no projeto.)',
          );
          // IMPORTANT: após incrementar a geração, o finally abaixo não desliga loading — fazemo-lo aqui
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('familia-app-visible'));
          }
          setLoading(false);
        } else {
          console.error('Erro ao carregar perfil:', err);
          throw err;
        }
      } finally {
        if (generation === profileLoadGenerationRef.current) setLoading(false);
      }
    })();

    profileInflightRef.current = { userId, promise };
    promise.finally(() => {
      if (profileInflightRef.current?.promise === promise) profileInflightRef.current = null;
    });

    return promise;
  }, [clearState]);

  useEffect(() => {
    const hydrateId = ++authHydrateSeqRef.current;

    async function hydrateFromStorage() {
      try {
        setLoading(true);
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (hydrateId !== authHydrateSeqRef.current) return;
        if (error) throw error;
        if (session?.user) {
          famDiag('auth/hydrate', 'session_ok');
          const em =
            session.user.email ||
            session.user.user_metadata?.email ||
            session.user.new_email ||
            '';
          await loadUserProfile(session.user.id, em);
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
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      /** StrictMode faz subscribe/unsubscribe: INITIAL_SESSION pode perder-se; hydrateFromStorage garante entrada. */
      if (event === 'INITIAL_SESSION') return;
      /** Evitar re-fetch completo a cada renovação silenciosa de token → loops e flashes. */
      if (event === 'TOKEN_REFRESHED') return;

      try {
        if (event === 'SIGNED_OUT' || !session?.user) {
          profileFreshRef.current = { uid: null, at: 0 };
          clearState();
          return;
        }
        const uid = session.user.id;
        const fresh = profileFreshRef.current;
        if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED')
          && fresh.uid === uid
          && Date.now() - fresh.at < 15000
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
        console.error('[auth] onAuthStateChange', event, e);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearState();
      } finally {
        setLoading(false);
      }
    });

    return () => {
      authHydrateSeqRef.current += 1;
      subscription?.unsubscribe();
    };
  }, [loadUserProfile, clearState]);

  /** Marca instante em que a aba passou a oculta (invalidação de cargas “zombie”). */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const markHidden = () => {
      if (document.visibilityState === 'hidden') tabHiddenAtRef.current = Date.now();
    };
    document.addEventListener('visibilitychange', markHidden);
    return () => document.removeEventListener('visibilitychange', markHidden);
  }, []);

  /**
   * Chamado pelo useAppResume global ao regressar ao primeiro plano.
   * Importante: faz sempre loadUserProfile com force=true (sessão válida mesmo com mesmo user.id).
   */
  const refreshAfterBackground = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const t = tabHiddenAtRef.current;
    if (t) {
      tabHiddenAtRef.current = 0;
      if (Date.now() - t > 280) {
        profileInflightRef.current = null;
        profileLoadGenerationRef.current += 1;
      }
    }

    try {
      const sessWrap = await raceMs(supabase.auth.getSession(), 6000);
      if (!sessWrap) {
        famDiag('auth/resume', 'getSession_timeout');
        return;
      }
      const { data: sessData, error: sessErr } = sessWrap;
      if (sessErr || !sessData?.session?.user?.id) return;

      await raceMs(supabase.auth.refreshSession(), 6000).catch(() => {});

      const refreshed = await raceMs(supabase.auth.getSession(), 5000);

      let session = sessData.session;
      let accessToken = session?.access_token ?? null;
      if (refreshed?.data?.session) {
        session = refreshed.data.session;
        accessToken = session?.access_token ?? null;
      }

      const uid = session?.user?.id;
      if (!uid) return;

      await reconnectSupabaseRealtime(supabase, accessToken ?? undefined);

      const em =
        session.user.email ||
        session.user.user_metadata?.email ||
        session.user.new_email ||
        '';
      await loadUserProfile(uid, em, { force: true }).catch(console.warn);
    } catch (e) {
      console.warn('[auth] refreshAfterBackground:', e);
    } finally {
      try {
        window.dispatchEvent(new CustomEvent('familia-app-visible'));
      } catch {
        /* noop */
      }
    }
  }, [loadUserProfile]);

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      await loadUserProfile(data.user.id, email);
      return { user: data.user };
    } catch (e) {
      throw mapAuthNetworkError(e);
    }
  };

  const register = async (formData) => {
    const email = String(formData.email || '').trim().toLowerCase();
    const password = String(formData.password || '');
    const familyName = formData.familyName || null;
    const name = formData.name || null;
    const profileNorm = String(formData.profileType || 'pai').toLowerCase().replace(/ã/g, 'a').trim();
    if (!['pai', 'mae'].includes(profileNorm)) {
      throw new Error('O registo público só é permitido para Pai ou Mãe (gestor principal). Para filhos, o gestor cria o acesso na administração da família.');
    }
    const profileType = profileNorm;
    let data;
    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, family_name: familyName, profile_type: profileType },
        },
      });
      data = signUpData;
      if (error) {
        let hint = '';
        if (error.message?.includes('already registered') || error.code === 'user_already_exists') {
          hint = ' Este email já tem conta — faça login ou use outro email.';
        } else if (/invalid/i.test(error.message || '') && /email/i.test(error.message || '')) {
          hint =
            ' O Supabase pode rejeitar alguns domínios (DNS/MX). Experimente Gmail/Outlook ou confira ' +
            'Authentication → Providers → Email no painel Supabase.';
        }
        throw new Error(`${error.message}${hint}`);
      }
    } catch (e) {
      throw mapAuthNetworkError(e);
    }

    // 2. Se Supabase exige confirmação de email, não há sessão -> tentar login
    let session = data.session;
    if (!session) {
      try {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw new Error(
            'Conta criada, mas o Supabase pede confirmação por email. ' +
              'No Supabase Dashboard → Authentication → Settings, desative "Enable email confirmations" ' +
              'para permitir login imediato.',
          );
        }
        session = signInData.session;
      } catch (e) {
        throw mapAuthNetworkError(e);
      }
    }
    if (!session?.user?.id) throw new Error('Não foi possível iniciar sessão após o registo.');

    // 3. RPC para criar família com trial e perfil
    const { error: rpcErr } = await supabase.rpc('register_family_and_user', {
      p_family_name:  familyName,
      p_user_name:    name,
      p_profile_type: profileType,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // 4. Recarregar perfil
    await loadUserProfile(session.user.id, email);
    return { ...data, session };
  };

  const logout = async () => {
    setLoading(false);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* 403 em logout global: scope local limpa sessão na mesma */
    }
    clearState();
  };

  const fetchMe = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadUserProfile(user.id, user.email, { force: true });
  };

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
      login,
      register,
      logout,
      fetchMe,
      ensureChildProfile,
      clearMustChangePassword,
      refreshAfterBackground,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
