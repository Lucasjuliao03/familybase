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
        setFamily(familyData);

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
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: { name: formData.name, family_name: formData.familyName },
      },
    });
    if (error) throw new Error(error.message);
    if (data.session?.user) {
      const { error: rpcErr } = await supabase.rpc('register_family_and_user', {
        p_family_name: formData.familyName || null,
        p_user_name: formData.name || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      await loadUserProfile(data.user.id, formData.email);
    }
    return data;
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
