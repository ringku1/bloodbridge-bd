// services/api.js
//
// Axios instance pre-configured for the Blood Bridge backend.
//
// Two key features:
//
// 1. Request interceptor — automatically adds the JWT Authorization header
//    to every request, so individual screens don't have to.
//
// 2. Response interceptor — if the server responds with 401 (Unauthorized),
//    the token has expired. We clear the auth store and the navigation
//    will automatically redirect to the login screen.
//
// How interceptors work:
//   axios.interceptors.request.use(fn)  → runs before every request is sent
//   axios.interceptors.response.use(fn) → runs after every response is received

import axios from 'axios';
import { API_BASE_URL } from '../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10s timeout — shows error instead of hanging forever
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the JWT token to every outgoing request.
// The token is read from the Zustand store at request time (not at setup time),
// so it always reflects the latest value even after login/logout.
api.interceptors.request.use((config) => {
  // Dynamic import to avoid circular dependency (api ← store ← api)
  const { useAuthStore } = require('../store/authStore');
  const token = useAuthStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the server returns 401, log out and redirect to auth screen.
api.interceptors.response.use(
  (response) => response, // pass through successful responses
  (error) => {
    if (error.response?.status === 401) {
      const { useAuthStore } = require('../store/authStore');
      useAuthStore.getState().logout();
      // Navigation to AuthScreen happens automatically because App.js
      // watches the auth store's token and conditionally renders screens.
    }
    return Promise.reject(error);
  }
);

export default api;
