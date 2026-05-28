// store/authStore.js
//
// Global authentication state using Zustand.
//
// What is Zustand?
//   A lightweight state management library. Unlike Redux, there's no boilerplate:
//   just create a store with `create()`, define state + actions, and call
//   `useAuthStore()` in any component to read or update state.
//
// Persistence:
//   We use Zustand's `persist` middleware with AsyncStorage so the token
//   survives app restarts. AsyncStorage is React Native's equivalent of
//   localStorage in web browsers.
//
// Usage in a component:
//   const { user, token, login, logout } = useAuthStore();

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user:  null,

      // Called after successful sign-in or sign-up
      login: (token, user) => set({ token, user }),

      // Called on logout or 401 — clears all auth state
      logout: () => set({ token: null, user: null }),

      // Called after profile updates (name, bloodGroup, etc.)
      // Merges partial updates into the existing user object
      updateUser: (updates) =>
        set((state) => ({ user: { ...state.user, ...updates } })),
    }),
    {
      name:    'blood-bridge-auth',             // AsyncStorage key
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
