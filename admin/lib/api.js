import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use((config) => {
  const secret = Cookies.get('admin_secret');
  if (secret) config.headers['x-admin-secret'] = secret;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (err) => {
    console.error('[API]', err.response?.status, err.config?.url, err.message);
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('admin_secret');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
