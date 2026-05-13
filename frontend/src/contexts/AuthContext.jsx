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

        // Mescla os módulos ativos da família com os padrões
        const defaultMods = { tasks: true, calendar: true, routines: true, medals: true, reports: true, shopping: true, mural: true, family_shop: true, allowance: true, piggy_bank: true, goals: true, notifications: true, health: true };
        const savedMods = familyData.active_modules || {};
        
        // Se a família nunca salvou nada, usa os padrões. Se salvou, usa os salvos.
        const mergedMods = Object.keys(savedMods).length > 0 ? savedMods : defaultMods;
        setModules(mergedMods);
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
    // Cadastro de família + gestor diretamente pelo frontend via RPC ou Supabase Auth
    // Neste contexto BaaS, normalmente criamos via Edge Function ou uma lógica direta
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: { name: formData.name }
      }
    });
    if (error) throw new Error(error.message);
    // (A criação das tabelas 'users' e 'families' pode depender de Triggers no banco
    // ou ser feita em seguida no frontend caso o RLS permita insert sem family_id).
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
