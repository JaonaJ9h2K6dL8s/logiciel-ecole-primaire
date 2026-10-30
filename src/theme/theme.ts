'use client';

import { THEME_COLORS, type ThemeColor } from '@/stores/themeStore';
import { createTheme, type ThemeOptions } from '@mui/material/styles';

const commonTheme: ThemeOptions = {
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    // Titres en serif (identité visuelle « éducation »), corps de texte en sans-serif.
    h1: { fontWeight: 700, fontSize: '2.5rem', letterSpacing: '-0.02em', fontFamily: '"Georgia", "Cambria", "Times New Roman", serif' },
    h2: { fontWeight: 700, fontSize: '2rem', letterSpacing: '-0.02em', fontFamily: '"Georgia", "Cambria", "Times New Roman", serif' },
    h3: { fontWeight: 700, fontSize: '1.75rem', letterSpacing: '-0.01em', fontFamily: '"Georgia", "Cambria", "Times New Roman", serif' },
    h4: { fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.01em', fontFamily: '"Georgia", "Cambria", "Times New Roman", serif' },
    h5: { fontWeight: 700, fontSize: '1.3rem', letterSpacing: '-0.01em', fontFamily: '"Georgia", "Cambria", "Times New Roman", serif' },
    h6: { fontWeight: 700, fontSize: '1.05rem' },
    subtitle1: { fontWeight: 600, fontSize: '1rem' },
    subtitle2: { fontWeight: 600, fontSize: '0.85rem' },
    body1: { fontSize: '0.938rem' },
    body2: { fontSize: '0.85rem' },
    caption: { fontSize: '0.75rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  shadows: [
    'none',
    '0 1px 2px rgba(16,24,40,0.05)',
    '0 2px 8px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
    '0 4px 16px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.04)',
    '0 8px 24px rgba(16,24,40,0.10), 0 4px 8px rgba(16,24,40,0.04)',
    '0 12px 32px rgba(16,24,40,0.12), 0 6px 12px rgba(16,24,40,0.06)',
    '0 16px 40px rgba(16,24,40,0.14), 0 8px 16px rgba(16,24,40,0.06)',
    ...Array(17).fill('0 16px 40px rgba(16,24,40,0.14), 0 8px 16px rgba(16,24,40,0.06)'),
    ...Array(1).fill('0 20px 48px rgba(16,24,40,0.16)'),
  ] as unknown as ThemeOptions['shadows'],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          padding: '9px 22px',
          fontWeight: 600,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, var(--grad-from), var(--grad-to))',
          boxShadow: '0 4px 14px rgba(46,125,111,0.30)',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(46,125,111,0.42)',
            transform: 'translateY(-1px)',
            background: 'linear-gradient(135deg, var(--grad-from), var(--grad-to))',
            filter: 'brightness(1.06)',
          },
        },
        outlined: {
          borderWidth: 1.5,
          '&:hover': { borderWidth: 1.5 },
        },
        sizeSmall: { padding: '5px 14px', borderRadius: 10 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 22,
          border: '1px solid rgba(31,36,48,0.05)',
          backgroundImage: 'none',
          boxShadow: '0 2px 10px rgba(31,36,48,0.04)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: 16 },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: { '& .MuiOutlinedInput-root': { borderRadius: 12 } },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 999, fontSize: '0.72rem' },
        sizeSmall: { height: 22 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          color: 'text.secondary',
          borderBottomWidth: 2,
        },
        root: { borderColor: 'rgba(0,0,0,0.05)' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background 0.15s ease',
          '&:hover': { backgroundColor: 'rgba(46,125,111,0.035) !important' },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 20, boxShadow: '0 24px 64px rgba(16,24,40,0.22)' },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 800, fontSize: '1.1rem', paddingBottom: 8 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { border: 'none' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 8, fontSize: '0.75rem', fontWeight: 500 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 10, transition: 'all 0.2s ease' },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: 'none !important',
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, borderRadius: '3px 3px 0 0' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { fontWeight: 600, textTransform: 'none', minHeight: 44 },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 6, height: 8 },
      },
    },
  },
};

/** Éclaircit (amount > 0) ou assombrit (amount < 0) une couleur hex #RRGGBB. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + Math.round(2.55 * amount));
  const g = clamp(((n >> 8) & 0xff) + Math.round(2.55 * amount));
  const b = clamp((n & 0xff) + Math.round(2.55 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Surcharge optionnelle des couleurs/arrondis (personnalisation par
 * utilisateur, étape 22). Toute valeur null/absente revient au thème courant.
 */
export interface ThemeOverrides {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  borderRadius?: number | null;
}

export function buildTheme(mode: 'light' | 'dark', accentColor: ThemeColor, overrides?: ThemeOverrides) {
  const base = THEME_COLORS[accentColor];
  const color = overrides?.primaryColor
    ? { main: overrides.primaryColor, light: shade(overrides.primaryColor, 16), dark: shade(overrides.primaryColor, -16) }
    : overrides?.accentColor
      ? { main: overrides.accentColor, light: shade(overrides.accentColor, 16), dark: shade(overrides.accentColor, -16) }
      : base;
  const secondaryColor = overrides?.secondaryColor
    ? { main: overrides.secondaryColor, light: shade(overrides.secondaryColor, 16), dark: shade(overrides.secondaryColor, -16) }
    : null;

  const gradVars: Record<string, string> = {
    '--grad-from': mode === 'dark' ? color.light : color.main,
    '--grad-to': mode === 'dark' ? color.main : color.dark,
  };

  // Arrondi global personnalisé : surcharge les valeurs par défaut des
  // surfaces et boutons (les autres composants héritent de shape).
  const radiusOverride =
    typeof overrides?.borderRadius === 'number'
      ? {
          MuiCard: { styleOverrides: { root: { borderRadius: overrides.borderRadius } } },
          MuiPaper: { styleOverrides: { root: { borderRadius: overrides.borderRadius } } },
          MuiButton: { styleOverrides: { root: { borderRadius: Math.round(overrides.borderRadius / 2) } } },
        }
      : {};

  const withGradVars = (options: ThemeOptions): ThemeOptions => ({
    ...options,
    components: {
      ...options.components,
      ...radiusOverride,
      MuiCssBaseline: {
        styleOverrides: {
          ':root': gradVars,
          'body': { scrollbarWidth: 'thin', scrollbarColor: 'rgba(120,130,150,0.4) transparent' },
        },
      },
    },
  });

  if (mode === 'dark') {
    return createTheme(withGradVars({
      ...commonTheme,
      palette: {
        mode: 'dark',
        primary: {
          main: color.light,
          light: color.light,
          dark: color.main,
          contrastText: '#FFFFFF',
        },
        secondary: secondaryColor ?? {
          main: '#FF8A5C',
          light: '#FFAB8A',
          dark: '#FF6B35',
        },
        background: {
          default: '#0B1220',
          paper: '#131C2E',
        },
        text: {
          primary: '#E8ECF2',
          secondary: '#8899AA',
        },
        success: { main: '#22C55E', light: '#14532D' },
        warning: { main: '#F59E0B', light: '#78350F' },
        error: { main: '#EF4444', light: '#7F1D1D' },
        info: { main: '#3B82F6', light: '#1E3A5F' },
        divider: 'rgba(255,255,255,0.08)',
      },
      components: {
        ...commonTheme.components,
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.07)',
              backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))',
            },
          },
        },
        MuiTableRow: {
          styleOverrides: {
            root: {
              transition: 'background 0.15s ease',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.04) !important' },
            },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            head: {
              fontWeight: 700,
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: 'text.secondary',
              borderBottomWidth: 2,
            },
            root: { borderColor: 'rgba(255,255,255,0.06)' },
          },
        },
        MuiAccordion: {
          styleOverrides: {
            root: {
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'none !important',
              '&:before': { display: 'none' },
              '&.Mui-expanded': { margin: 0 },
            },
          },
        },
      },
    }));
  }

  return createTheme(withGradVars({
    ...commonTheme,
    palette: {
      mode: 'light',
      primary: {
        main: color.main,
        light: color.light,
        dark: color.dark,
        contrastText: '#FFFFFF',
      },
      secondary: secondaryColor ?? {
        main: '#FF6B35',
        light: '#FF8A5C',
        dark: '#E55A2B',
      },
      background: {
        default: '#ECE9E1',
        paper: '#FFFFFF',
      },
      text: {
        primary: '#1F2430',
        secondary: '#6B7280',
      },
      success: { main: '#16A34A', light: '#DCFCE7' },
      warning: { main: '#D97706', light: '#FEF3C7' },
      error: { main: '#DC2626', light: '#FEE2E2' },
      info: { main: '#2563EB', light: '#DBEAFE' },
      divider: 'rgba(31,36,48,0.08)',
    },
  }));
}

// Keep exports for backward compatibility
export const lightTheme = buildTheme('light', 'teal');
export const darkTheme = buildTheme('dark', 'teal');
