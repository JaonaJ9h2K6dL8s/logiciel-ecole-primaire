'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeColor = 'teal' | 'blue' | 'red' | 'pink' | 'purple' | 'orange' | 'green' | 'indigo' | 'amber' | 'cyan' | 'lime' | 'lightGreen' | 'yellow' | 'deepOrange' | 'brown' | 'grey' | 'blueGrey' | 'deepPurple' | 'lightBlue' | 'emerald' | 'rose' | 'fuchsia' | 'violet' | 'sky' | 'slate' | 'zinc' | 'stone' | 'neutral' | 'crimson' | 'sapphire';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

interface ThemeStore {
  /** Préférence utilisateur : light, dark ou system (défaut). */
  preference: ThemePreference;
  accentColor: ThemeColor;
  setPreference: (preference: ThemePreference) => void;
  setAccentColor: (color: ThemeColor) => void;
}

/** Préférence par défaut : suivre le système d'exploitation. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const THEME_COLORS: Record<ThemeColor, { label: string; main: string; light: string; dark: string }> = {
  teal:   { label: 'Teal',    main: '#2E7D6F', light: '#4CAF9C', dark: '#1B5E50' },
  blue:   { label: 'Bleu',    main: '#1976D2', light: '#42A5F5', dark: '#1565C0' },
  red:    { label: 'Rouge',   main: '#D32F2F', light: '#EF5350', dark: '#C62828' },
  pink:   { label: 'Rose',    main: '#C2185B', light: '#EC407A', dark: '#AD1457' },
  purple: { label: 'Violet',  main: '#7B1FA2', light: '#AB47BC', dark: '#6A1B9A' },
  orange: { label: 'Orange',  main: '#E65100', light: '#FF9800', dark: '#BF360C' },
  green:  { label: 'Vert',    main: '#2E7D32', light: '#66BB6A', dark: '#1B5E20' },
  indigo: { label: 'Indigo',  main: '#303F9F', light: '#5C6BC0', dark: '#283593' },
  amber:  { label: 'Ambre',   main: '#FF8F00', light: '#FFB300', dark: '#E65100' },
  cyan:   { label: 'Cyan',    main: '#00838F', light: '#26C6DA', dark: '#006064' },
  lime:   { label: 'Lime',    main: '#AFB42B', light: '#D4E157', dark: '#9E9D24' },
  lightGreen: { label: 'Vert Clair', main: '#689F38', light: '#9CCC65', dark: '#33691E' },
  yellow: { label: 'Jaune',   main: '#FBC02D', light: '#FFEE58', dark: '#F57F17' },
  deepOrange: { label: 'Orange Foncé', main: '#E64A19', light: '#FF7043', dark: '#BF360C' },
  brown:  { label: 'Marron',  main: '#795548', light: '#8D6E63', dark: '#4E342E' },
  grey:   { label: 'Gris',    main: '#757575', light: '#9E9E9E', dark: '#424242' },
  blueGrey: { label: 'Gris Bleu', main: '#607D8B', light: '#78909C', dark: '#37474F' },
  deepPurple: { label: 'Violet Foncé', main: '#512DA8', light: '#AB47BC', dark: '#311B92' },
  lightBlue: { label: 'Bleu Clair', main: '#0288D1', light: '#29B6F6', dark: '#01579B' },
  emerald: { label: 'Émeraude', main: '#10B981', light: '#34D399', dark: '#047857' },
  rose:    { label: 'Rose (Vif)', main: '#F43F5E', light: '#FB7185', dark: '#BE123C' },
  fuchsia: { label: 'Fuchsia', main: '#D946EF', light: '#E879F9', dark: '#A21CAF' },
  violet:  { label: 'Violet Clair', main: '#6C5CE7', light: '#9B8CFA', dark: '#4F3ED9' },
  sky:     { label: 'Ciel', main: '#0EA5E9', light: '#38BDF8', dark: '#0369A1' },
  slate:   { label: 'Ardoise', main: '#64748B', light: '#94A3B8', dark: '#334155' },
  zinc:    { label: 'Zinc', main: '#71717A', light: '#A1A1AA', dark: '#3F3F46' },
  stone:   { label: 'Pierre', main: '#78716C', light: '#A8A29E', dark: '#44403C' },
  neutral: { label: 'Neutre', main: '#737373', light: '#A3A3A3', dark: '#404040' },
  crimson: { label: 'Cramoisi', main: '#DC143C', light: '#ED4765', dark: '#90001B' },
  sapphire: { label: 'Saphir', main: '#0F52BA', light: '#4B7FDA', dark: '#082A63' },
};

/** Résout la préférence en mode effectif (écoute le système si « system »). */
export function resolveMode(preference: ThemePreference): ResolvedMode {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** S'abonne aux changements du thème système (retourne la fonction de nettoyage). */
export function watchSystemMode(onChange: (mode: ResolvedMode) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      preference: DEFAULT_THEME_PREFERENCE,
      accentColor: 'violet',
      setPreference: (preference) => set({ preference }),
      setAccentColor: (accentColor) => set({ accentColor }),
    }),
    { name: 'scolaire-theme' }
  )
);
