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

export default api;
