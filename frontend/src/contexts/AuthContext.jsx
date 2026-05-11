import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('fb_token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchMe = async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setFamily(data.family);
      setChildProfile(data.childProfile);
      setMustChangePassword(!!data.mustChangePassword || !!data.user?.must_change_password);
      setModules(data.modules || {});
    } catch {
      localStorage.removeItem('fb_token');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
      setFamily(null);
      setChildProfile(null);
      setModules({});
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('fb_token', data.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    setFamily(data.family);
    setChildProfile(data.childProfile);
    setMustChangePassword(!!data.mustChangePassword || !!data.user?.must_change_password);
    setModules(data.modules || {});
    return data;
  };

  const register = async (formData) => {
    const { data } = await api.post('/auth/register', formData);
    localStorage.setItem('fb_token', data.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    setFamily(data.family);
    setMustChangePassword(!!data.mustChangePassword || !!data.user?.must_change_password);
    setModules(data.modules || {});
    return data;
  };

  const logout = () => {
    localStorage.removeItem('fb_token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setFamily(null);
    setChildProfile(null);
    setMustChangePassword(false);
    setModules({});
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
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
