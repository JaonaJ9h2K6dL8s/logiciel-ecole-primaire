'use client';

import { usePathname } from 'next/navigation';
import { getBackground } from './backgrounds';
import { effective, useAppearanceStore } from '@/stores/appearanceStore';

/**
 * Couche de fond personnalisée (étape 22). Rendue DERRIÈRE le contenu :
 * les Paper/Card MUI restent opaques, la lisibilité est donc préservée.
 * - Portée « app » : visible sur toutes les pages.
 * - Portée « dashboard » : visible uniquement sur /dashboard.
 * Les deux variantes sont montées par AdminShell ; la couche s'affiche
 * selon la portée choisie par l'utilisateur.
 */
export default function BackgroundLayer({ scope }: { scope: 'dashboard' | 'app' }) {
  const pathname = usePathname();
  const settings = useAppearanceStore((s) => s.settings);
  const bg = getBackground(settings.backgroundId);
  if (!bg || settings.backgroundType === 'none') return null;
  const layerScope = effective(settings.backgroundScope, 'dashboard');
  if (layerScope !== scope) return null;
  if (scope === 'dashboard' && pathname !== '/dashboard') return null;
  const opacity = effective(settings.backgroundOpacity, 30) / 100;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        ...bg.css,
        opacity,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
