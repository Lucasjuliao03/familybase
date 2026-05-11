import axios from 'axios';

/** Raiz do servidor (sem /api). Imagens e uploads usam este origin. */
function normalizeServerOrigin(raw) {
  const fallback = 'http://localhost:3001';
  if (raw == null || String(raw).trim() === '') return fallback;
  let s = String(raw).trim().replace(/\/+$/, '');
  // VITE_API_URL costuma vir como .../api — evita POST .../api/api/auth/login
  if (/\/api$/i.test(s)) s = s.replace(/\/api$/i, '');
  return s || fallback;
}

export const apiOrigin =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? normalizeServerOrigin(import.meta.env.VITE_API_URL)
    : 'http://localhost:3001';

const api = axios.create({
  baseURL: `${apiOrigin}/api`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fb_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
