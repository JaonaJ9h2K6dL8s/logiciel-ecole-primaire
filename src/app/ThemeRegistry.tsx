'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveMode, useThemeStore, watchSystemMode } from '@/stores/themeStore';
import { effective, loadAppearanceFromServer, mergeServerSettings, useAppearanceStore } from '@/stores/appearanceStore';
import { buildTheme } from '@/theme/theme';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';

export default function ThemeRegistry({ children }: { children: ReactNode }) {
  const { preference, accentColor } = useThemeStore();
  const settings = useAppearanceStore((s) => s.settings);
  // Le mode effectif est recalculé quand la préférence change et quand le
  // système bascule (préférence « system »).
  const [systemMode, setSystemMode] = useState(() => resolveMode(preference));

  useEffect(() => {
    setSystemMode(resolveMode(preference));
    return watchSystemMode(setSystemMode);
  }, [preference]);

  // Synchronisation des préférences serveur (personnalisation par utilisateur,
  // étape 22) : uniquement si une session existe ; silencieux sur /login.
  useEffect(() => {
    let cancelled = false;
    loadAppearanceFromServer().then((s) => {
      if (!cancelled && s) mergeServerSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Le mode serveur (theme_mode) prime sur la préférence locale si défini :
  // c'est la valeur persistée par l'utilisateur dans « Apparence ».
  const mode = effective(settings.themeMode, preference);
  const theme = useMemo(
    () =>
      buildTheme(mode === 'system' ? systemMode : mode, accentColor, {
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        borderRadius: settings.borderRadius,
      }),
    [mode, systemMode, accentColor, settings.primaryColor, settings.secondaryColor, settings.accentColor, settings.borderRadius]
  );

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          autoHideDuration={3000}
        >
          {children}
        </SnackbarProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
