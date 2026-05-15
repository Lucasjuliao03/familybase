import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase, mapAuthNetworkError } from '../lib/supabase';

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);

  const [effectiveSubscription, setEffectiveSubscription] = useState(null);
  const profileInflightRef = useRef(null);

  const clearState = useCallback(() => {
    setUser(null);
    setFamily(null);
    setChildProfile(null);
    setModules({});
    setEffectiveSubscription(null);
  }, []);

  const loadUserProfile = useCallback(async (userId, emailHint) => {
    const prev = profileInflightRef.current;
    if (prev?.userId === userId && prev.promise) return prev.promise;

    const promise = (async () => {
      try {
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
            console.warn('Sem linha em public.users para:', emailHint, rpcErr?.message || retry.error?.message || '');
            clearState();
            return;
          }
        } else if (error) {
          console.error('Erro ao carregar public.users:', error.code, error.message, error.details);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error(
            'Não foi possível ler o perfil na base de dados (erro do servidor). ' +
            'No Supabase, execute o script supabase_baas_complete_fix.sql no SQL Editor.',
          );
        }

        if (!profileRow) {
          clearState();
          return;
        }

        if (!profileRow.family_id) {
          const { error: provErr } = await supabase.rpc('register_family_and_user', {
            p_family_name: null,
            p_user_name: null,
          });
          if (provErr) {
            console.error('Criar família (RPC):', provErr.message);
          } else {
            const refill = await supabase.from('users').select('*').eq('id', userId).single();
            if (!refill.error && refill.data) {
              profileRow = refill.data;
            }
          }
        }

        if (!profileRow?.family_id) {
          console.warn('Conta sem família associada; complete o registo ou execute o SQL de correção.');
        }

        const emailResolved =
          emailHint ||
          profileRow.email ||
          '';

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

        let resolvedFamily = familyData;

        try {
          const { data: effData, error: effErr } = await supabase.rpc('get_effective_subscription');
          if (!effErr && effData != null && typeof effData === 'object') {
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
          setEffectiveSubscription(buildEffectiveSubscriptionFallback(profileRow, resolvedFamily ?? null, userId));
        }

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

        setChildProfile(wantsChildRow ? cData ?? null : null);
      } catch (err) {
        console.error('Erro ao carregar perfil:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    })();

    profileInflightRef.current = { userId, promise };
    promise.finally(() => {
      if (profileInflightRef.current?.promise === promise) profileInflightRef.current = null;
    });

    return promise;
  }, [clearState]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          if (session?.user) {
            const em =
              session.user.email ||
              session.user.user_metadata?.email ||
              session.user.new_email ||
              '';
            await loadUserProfile(session.user.id, em);
          } else {
            clearState();
          }
        } catch (e) {
          console.error('Auth state + perfil:', e);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          clearState();
        } finally {
          setLoading(false);
        }
      },
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [loadUserProfile, clearState]);

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
    if (user) await loadUserProfile(user.id, user.email);
  };

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
      clearMustChangePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
