// store/requestStore.js
//
// State for blood requests — both as a requester and a donor.
//
// This store is NOT persisted (unlike authStore) because request data
// should always be fresh from the server.

import { create } from 'zustand';
import api from '../services/api';

export const useRequestStore = create((set) => ({
  activeRequests:  [],  // requester's open requests
  currentRequest:  null, // the request currently being viewed
  loading:         false,
  error:           null,

  // Fetch the requester's own open requests
  fetchActiveRequests: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/requests/active');
      set({ activeRequests: res.data.requests, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.error || 'Failed to load requests', loading: false });
    }
  },

  // Fetch a single request by ID (full details with donor responses)
  fetchRequest: async (requestId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get(`/requests/${requestId}`);
      set({ currentRequest: res.data.request, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.error || 'Failed to load request', loading: false });
    }
  },

  // Create a new blood request
  createRequest: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/requests', data);
      // Add to local list so the requester sees it immediately
      set((state) => ({
        activeRequests: [res.data.request, ...state.activeRequests],
        loading: false,
      }));
      return res.data;
    } catch (err) {
      set({ error: err.response?.data?.error || 'Failed to create request', loading: false });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
