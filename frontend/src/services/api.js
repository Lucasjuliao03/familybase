import axios from 'axios';

export const apiOrigin = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
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
