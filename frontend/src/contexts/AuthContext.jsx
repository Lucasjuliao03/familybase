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
        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email);
        } else {
          clearState();
          setLoading(false);
        }
      }
    );

    // 2. Busca inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user.id, session.user.email);
      } else {
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
      // Busca o perfil do usuário
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !profile) {
        // Se o auth user existe mas não tem na tabela users, precisamos criar
        console.warn('Perfil não encontrado para o usuário:', email);
        clearState();
        setLoading(false);
        return;
      }

      setUser({ ...profile, email });
      setMustChangePassword(!!profile.must_change_password);

      // Busca dados da família e módulos persistentes
      if (profile.family_id) {
        const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).single();
        setFamily(familyData);

        const defaultMods = { tasks: true, calendar: true, routines: true, medals: true, reports: true, shopping: true, mural: true, family_shop: true, allowance: true, piggy_bank: true, goals: true, notifications: true, health: true };
        const { data: fmRows } = await supabase.from('family_modules').select('module_key, is_enabled').eq('family_id', profile.family_id);
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
      if (profile.role === 'child') {
        const { data: cData } = await supabase.from('children').select('*').eq('user_id', userId).single();
        setChildProfile(cData);
      } else {
        setChildProfile(null);
      }
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
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
    await supabase.auth.signOut();
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
