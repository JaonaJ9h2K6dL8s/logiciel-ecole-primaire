'use client';

import { create } from 'zustand';
import { api } from '@/services/api';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role_code: string;
  role_label: string;
  theme_preference: ThemePreference | null;
  permissions: string[];
}

interface AuthState {
  user: SessionUser | null;
  checked: boolean;
  checkSession: () => Promise<SessionUser | null>;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Enregistre la préférence de thème côté serveur (session uniquement). */
  setThemePreference: (preference: ThemePreference) => Promise<void>;
}

/**
 * La session vit dans un cookie HttpOnly géré par le backend.
 * Aucun jeton n'est stocké dans le navigateur (ni localStorage, ni sessionStorage).
 */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  checked: false,

  checkSession: async () => {
    try {
      const res = await api.get<{ user: SessionUser }>('/auth/me');
      set({ user: res.user, checked: true });
      return res.user;
    } catch {
      set({ user: null, checked: true });
      return null;
    }
  },

  login: async (username, password) => {
    await api.post('/auth/login', { username, password });
    const res = await api.get<{ user: SessionUser }>('/auth/me');
    set({ user: res.user, checked: true });
    return res.user;
  },

  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null, checked: true });
  },

  setThemePreference: async (preference) => {
    // L'identité vient du cookie de session : aucun userId envoyé.
    const res = await api.patch<{ themePreference: ThemePreference | null }>('/auth/me/theme', { preference });
    set((state) => (state.user ? { user: { ...state.user, theme_preference: res.themePreference } } : state));
  },
}));
