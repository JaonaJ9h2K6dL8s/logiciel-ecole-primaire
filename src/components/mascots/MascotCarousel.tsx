'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Stack, Typography, Paper } from '@mui/material';
import ChevronLeftOutlinedIcon from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import PauseOutlinedIcon from '@mui/icons-material/PauseOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import MascotCharacter, { MASCOTS, getMascot } from './MascotCharacter';
import { effective, useAppearanceStore, type MascotAnimationName } from '@/stores/appearanceStore';

/**
 * Carrousel de mascottes (étape 22) — réutilisable dans le dashboard.
 * - Défilement automatique (intervalle configurable par l'utilisateur) ;
 * - boutons précédent/suivant et sélection directe par pastilles ;
 * - pause automatique quand l'onglet est masqué ;
 * - animation préférée issue des préférences utilisateur ;
 * - aucun mouvement si prefers-reduced-motion ou si l'utilisateur désactive
 *   les animations ;
 * - zone dédiée : n'interagit pas avec les statistiques ni les actions.
 */

const MESSAGES = [
  'Bonjour ! Prêt pour une nouvelle journée ?',
  'Bravo pour tes efforts !',
  'Continue à apprendre !',
  'Bonne lecture !',
  'Chaque jour est une nouvelle occasion d’apprendre.',
];

interface Props {
  /** Hauteur maximale de la zone (px). */
  height?: number;
}

export default function MascotCarousel({ height = 190 }: Props) {
  const settings = useAppearanceStore((s) => s.settings);
  const mascotEnabled = effective(settings.mascotEnabled, true);
  const carouselEnabled = effective(settings.mascotCarouselEnabled, true);
  const intervalSec = effective(settings.mascotCarouselInterval, 8);
  const animation = effective(settings.mascotAnimation, 'wave' as MascotAnimationName);
  const favorite = settings.selectedMascotId;

  const [index, setIndex] = useState(favorite ? Math.max(0, MASCOTS.findIndex((m) => m.id === favorite)) : 0);
  const [auto, setAuto] = useState(carouselEnabled);
  const [msgIndex, setMsgIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Préférences système de mouvement réduit.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Pause quand l'onglet est masqué.
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const next = useCallback(() => setIndex((i) => (i + 1) % MASCOTS.length), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + MASCOTS.length) % MASCOTS.length), []);

  // Défilement automatique.
  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!auto || hidden || reduced || MASCOTS.length < 2) return;
    timer.current = setInterval(next, Math.max(3, intervalSec) * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, hidden, reduced, intervalSec, next]);

  // Messages tournants (statiques, sans donnée personnelle).
  useEffect(() => {
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 12000);
    return () => clearInterval(t);
  }, []);

  if (!mascotEnabled) return null;
  const design = getMascot(MASCOTS[index]?.id ?? favorite);
  const animating = auto && !reduced && !hidden;

  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'relative',
        p: { xs: 2, sm: 2.5 },
        minHeight: height,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1.5, sm: 2.5 },
        overflow: 'hidden',
        // Bandeau teinté par la couleur du thème (comme une bannière d'accueil).
        background: (t) =>
          t.palette.mode === 'dark'
            ? `linear-gradient(90deg, color-mix(in srgb, ${t.palette.primary.main} 16%, transparent), color-mix(in srgb, ${t.palette.primary.main} 5%, transparent))`
            : `linear-gradient(90deg, color-mix(in srgb, ${t.palette.primary.main} 12%, transparent), color-mix(in srgb, ${t.palette.primary.main} 4%, transparent))`,
      }}
    >
      {/* Étincelles décoratives (aucun mouvement si mouvement réduit) */}
      {!reduced && (
        <>
          <Box aria-hidden component="span" sx={{ position: 'absolute', top: 12, right: '36%', color: 'primary.main', opacity: 0.35, fontSize: 18, lineHeight: 1, animation: 'mascot-sparkle 3.4s ease-in-out infinite', userSelect: 'none' }}>
            ✦
          </Box>
          <Box aria-hidden component="span" sx={{ position: 'absolute', bottom: 10, left: '28%', color: 'primary.main', opacity: 0.25, fontSize: 13, lineHeight: 1, animation: 'mascot-sparkle 4.2s ease-in-out infinite 1.2s', userSelect: 'none' }}>
            ✦
          </Box>
        </>
      )}

      {/* Mascotte dans un médaillon rond */}
      <Box
        sx={{
          flexShrink: 0,
          alignSelf: 'center',
          width: { xs: 104, sm: 126 },
          height: { xs: 104, sm: 126 },
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)'),
          boxShadow: '0 4px 14px rgba(31,36,48,0.10)',
        }}
      >
        <Box key={design.id} sx={{ animation: reduced ? 'none' : 'mascot-idle 0.6s ease', display: 'flex', justifyContent: 'center' }}>
          <MascotCharacter design={design} animation={reduced ? 'idle' : animation} reducedMotion={reduced} size={92} />
        </Box>
      </Box>

      {/* Message central */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{ textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700, color: 'primary.main', display: 'block' }}
        >
          Votre mascotte · {design.name}
        </Typography>
        <Typography variant="h6" fontWeight={800} sx={{ mt: 0.25 }}>
          {MESSAGES[msgIndex]}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {animating ? 'Animation active' : 'Animation en pause'} — un compagnon pour motiver la classe.
        </Typography>

        {/* Navigation : précédent / suivant + sélection directe */}
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
          <IconButton size="small" aria-label="Mascotte précédente" onClick={prev}>
            <ChevronLeftOutlinedIcon fontSize="small" />
          </IconButton>
          {MASCOTS.map((m, i) => (
            <Box
              key={m.id}
              component="button"
              aria-label={`Afficher ${m.name}`}
              onClick={() => {
                setIndex(i);
                setAuto(false);
              }}
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                p: 0,
                bgcolor: i === index ? 'primary.main' : 'divider',
              }}
            />
          ))}
          <IconButton size="small" aria-label="Mascotte suivante" onClick={next}>
            <ChevronRightOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Action à droite : pause / reprise du défilement automatique */}
      <Box sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}>
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          startIcon={auto ? <PauseOutlinedIcon /> : <PlayArrowOutlinedIcon />}
          onClick={() => setAuto((v) => !v)}
          sx={{
            borderRadius: 999,
            whiteSpace: 'nowrap',
            fontWeight: 700,
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'transparent' : 'rgba(255,255,255,0.7)'),
          }}
        >
          {auto ? 'Mettre en pause' : 'Reprendre'}
        </Button>
      </Box>
    </Paper>
  );
}
