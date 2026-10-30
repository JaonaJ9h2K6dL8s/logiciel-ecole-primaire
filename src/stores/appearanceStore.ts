'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Préférences d'apparence personnelles (étape 22) — miroir du schéma
 * user_appearance_settings (migration 031).
 *
 * - persisted en localStorage : application instantanée sans rechargement.
 * - synchronisé avec le serveur (GET/PUT /appearance/settings) : les
 *   préférences suivent l'utilisateur sur ses autres appareils.
 * - null = valeur non personnalisée -> défaut (aligné sur APPEARANCE_DEFAULTS
 *   côté backend).
 */

export type ThemeModePref = 'light' | 'dark' | 'system';
export type BackgroundType = 'none' | 'solid' | 'gradient' | 'pattern' | 'scene';
export type BackgroundScope = 'dashboard' | 'app';
export type MascotAnimationName = 'idle' | 'wave' | 'bounce' | 'cheer' | 'think' | 'read' | 'dance' | 'walk';

export interface AppearanceSettings {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  themeMode: ThemeModePref | null;
  backgroundType: BackgroundType | null;
  backgroundId: string | null;
  backgroundOpacity: number | null;
  backgroundScope: BackgroundScope | null;
  borderRadius: number | null;
  selectedMascotId: string | null;
  mascotAnimation: MascotAnimationName | null;
  mascotCarouselEnabled: boolean | null;
  mascotCarouselInterval: number | null;
  mascotEnabled: boolean | null;
}

export const EMPTY_APPEARANCE: AppearanceSettings = {
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  themeMode: null,
  backgroundType: null,
  backgroundId: null,
  backgroundOpacity: null,
  backgroundScope: null,
  borderRadius: null,
  selectedMascotId: null,
  mascotAnimation: null,
  mascotCarouselEnabled: null,
  mascotCarouselInterval: null,
  mascotEnabled: null,
};

/** Valeurs effectives par défaut (miroir de APPEARANCE_DEFAULTS backend). */
export const APPEARANCE_DEFAULTS = {
  themeMode: 'system' as ThemeModePref,
  backgroundOpacity: 30,
  borderRadius: 12,
  mascotCarouselInterval: 8,
};

interface AppearanceStore {
  settings: AppearanceSettings;
  setSettings: (s: Partial<AppearanceSettings>) => void;
  resetSettings: () => void;
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      settings: { ...EMPTY_APPEARANCE },
      setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      resetSettings: () => set({ settings: { ...EMPTY_APPEARANCE } }),
    }),
    { name: 'scolaire-appearance' }
  )
);

/** Valeur effective (défaut si null). */
export function effective<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

/** Récupère les préférences serveur de l'utilisateur connecté. */
export async function loadAppearanceFromServer(): Promise<AppearanceSettings | null> {
  try {
    const res = await fetch('/api/v1/appearance/settings', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { settings: Partial<AppearanceSettings> };
    return { ...EMPTY_APPEARANCE, ...data.settings };
  } catch {
    return null;
  }
}

/** Enregistre les préférences serveur de l'utilisateur connecté. */
export async function saveAppearanceToServer(settings: AppearanceSettings): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/appearance/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(settings),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fuse les préférences serveur dans le store local (après connexion). */
export function mergeServerSettings(server: AppearanceSettings): void {
  useAppearanceStore.getState().setSettings(server);
}
