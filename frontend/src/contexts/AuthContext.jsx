import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Ouvinte global de mudanças de sessão do Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          if (session?.user) {
            await loadUserProfile(session.user.id, session.user.email);
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

    // 2. Busca inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('Sessão inicial + perfil:', e);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearState();
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const clearState = () => {
    setUser(null);
    setFamily(null);
    setChildProfile(null);
    setModules({});
    setMustChangePassword(false);
  };

  const loadUserProfile = async (userId, email) => {
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
          console.warn('Sem linha em public.users para:', email, rpcErr?.message || retry.error?.message || '');
          clearState();
          setLoading(false);
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
        setLoading(false);
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

      setUser({ ...profileRow, email });
      setMustChangePassword(!!profileRow.must_change_password);

      // Busca dados da família e módulos persistentes
      if (profileRow.family_id) {
        const { data: familyData } = await supabase.from('families').select('*').eq('id', profileRow.family_id).single();
        let resolvedFamily = familyData;

        // Auto-expira o trial no cliente se a data já passou
        if (resolvedFamily?.subscription_status === 'trial' && resolvedFamily?.trial_ends_at) {
          const ends = new Date(resolvedFamily.trial_ends_at).getTime();
          if (Number.isFinite(ends) && ends < Date.now()) {
            await supabase.from('families').update({ subscription_status: 'expired' }).eq('id', profileRow.family_id);
            resolvedFamily = { ...resolvedFamily, subscription_status: 'expired' };
          }
        }
        setFamily(resolvedFamily);

        const defaultMods = { tasks: true, calendar: true, routines: true, medals: true, reports: true, shopping: true, mural: true, family_shop: true, allowance: true, piggy_bank: true, goals: true, notifications: true, health: true };
        const { data: fmRows } = await supabase.from('family_modules').select('module_key, is_enabled').eq('family_id', profileRow.family_id);
        if (!fmRows?.length) {
          setModules(defaultMods);
        } else {
          const mergedMods = { ...defaultMods };
          fmRows.forEach((r) => {
            if (r.module_key != null) mergedMods[r.module_key] = !!r.is_enabled;
          });
          setModules(mergedMods);
        }
      }

      // Se for criança, busca o perfil de child
      if (profileRow.role === 'child') {
        const { data: cData } = await supabase.from('children').select('*').eq('user_id', userId).single();
        setChildProfile(cData);
      } else {
        setChildProfile(null);
      }
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    await loadUserProfile(data.user.id, email);
    return { user: data.user };
  };

  const register = async (formData) => {
    const email = String(formData.email || '').trim().toLowerCase();
    const password = String(formData.password || '');
    const familyName = formData.familyName || null;
    const name = formData.name || null;
    const profileType = (formData.profileType || 'pai').toLowerCase();

    // 1. signUp em Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, family_name: familyName, profile_type: profileType },
      },
    });
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

    // 2. Se Supabase exige confirmação de email, não há sessão -> tentar login
    let session = data.session;
    if (!session) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Provavelmente "Email not confirmed". Devolver erro amigável.
        throw new Error(
          'Conta criada, mas o Supabase pede confirmação por email. ' +
          'No Supabase Dashboard → Authentication → Settings, desative "Enable email confirmations" ' +
          'para permitir login imediato.'
        );
      }
      session = signInData.session;
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
