'use client';

import { useMemo, useState } from 'react';
import { Box, Button, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import type { BookPage } from '@/services/studentZone';

/**
 * Lecteur double-page avec animation de page qui tourne en CSS 3D pur.
 * Chaque « feuille » contient une page recto (avant) et une page verso
 * (arrière, retournée). Le flip : rotateY(0 → -180deg) avec transform-origin
 * sur la reliure ; le verso est révélé grâce à backface-visibility: hidden.
 * Sur mobile (< sm) : une seule page à la fois, navigation ‹ › superposée en bas.
 */
export default function BookReader({ pages }: { pages: BookPage[] }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [flipped, setFlipped] = useState(0); // nombre de feuilles retournées
  const [mobilePage, setMobilePage] = useState(0); // page courante (mode mobile)

  const sheets = useMemo(() => {
    const out: { front: BookPage | null; back: BookPage | null }[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      out.push({ front: pages[i], back: pages[i + 1] ?? null });
    }
    return out;
  }, [pages]);

  const total = sheets.length;
  const canNext = flipped < total;
  const canPrev = flipped > 0;

  // Numéro de page courant (1-based) affiché sous le livre.
  const currentPage = Math.min(pages.length, flipped * 2 + (canNext ? 1 : 0)) || 1;

  const pageSx = {
    width: '100%',
    height: '100%',
    bgcolor: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const renderPage = (page: BookPage | null) => {
    if (!page) return { sx: { bgcolor: '#fff' } };
    if (page.type === 'image') {
      return {
        children: (
          <Box
            component="img"
            src={page.url}
            alt="Page du livre"
            sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ),
        sx: pageSx,
      };
    }
    return {
      dangerouslySetInnerHTML: { __html: page.content },
      sx: { ...pageSx, '& svg': { width: '100%', height: '100%' } },
    };
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      {isMobile ? (
        <>
          {/* Mobile : une seule page à la fois, boutons ‹ › superposés en bas */}
          <Box
            sx={{
              position: 'relative',
              // Page réelle 800×600 → ratio 4/3 ; la largeur plafonne aussi selon la hauteur d'écran
              width: 'min(94vw, calc(56vh * 4 / 3))',
              aspectRatio: '4 / 3',
              bgcolor: '#fff',
              borderRadius: 3,
              boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
              overflow: 'hidden',
            }}
          >
            <Box {...renderPage(pages[Math.min(mobilePage, pages.length - 1)])} sx={{ position: 'absolute', inset: 0 }} />
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                justifyContent: 'space-between',
                p: 1.25,
                background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.06))',
              }}
            >
              <IconButton
                aria-label="Page précédente"
                disabled={mobilePage <= 0}
                onClick={() => setMobilePage((p) => Math.max(0, p - 1))}
                sx={{ bgcolor: '#3BA7E0', color: '#fff', minHeight: 44, '&:hover': { bgcolor: '#2d8fc4' }, '&.Mui-disabled': { bgcolor: 'rgba(59,167,224,0.35)', color: '#fff' } }}
              >
                <NavigateBeforeIcon fontSize="large" />
              </IconButton>
              <IconButton
                aria-label="Page suivante"
                disabled={mobilePage >= pages.length - 1}
                onClick={() => setMobilePage((p) => Math.min(pages.length - 1, p + 1))}
                sx={{ bgcolor: '#3BA7E0', color: '#fff', minHeight: 44, '&:hover': { bgcolor: '#2d8fc4' }, '&.Mui-disabled': { bgcolor: 'rgba(59,167,224,0.35)', color: '#fff' } }}
              >
                <NavigateNextIcon fontSize="large" />
              </IconButton>
            </Box>
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#3A3A3A' }}>
            Page {mobilePage + 1} / {pages.length}
          </Typography>
        </>
      ) : (
        <>
      <Box
        sx={{
          perspective: 2600,
          // Double page : deux feuilles 4/3 côte à côte → ratio 8/3
          width: 'min(94vw, calc(56vh * 8 / 3))',
          aspectRatio: '8 / 3',
          position: 'relative',
        }}
      >
        {/* Reliure / ombre centrale */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 6,
            transform: 'translateX(-50%)',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.08), rgba(0,0,0,0.22), rgba(0,0,0,0.08))',
            zIndex: total + 2,
            borderRadius: 2,
          }}
        />

        {sheets.map((sheet, i) => {
          const isFlipped = i < flipped;
          return (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                left: '50%',
                top: 0,
                width: '50%',
                height: '100%',
                transformStyle: 'preserve-3d',
                transformOrigin: 'left center',
                transform: isFlipped ? 'rotateY(-180deg)' : 'rotateY(0deg)',
                transition: 'transform 0.9s cubic-bezier(0.4, 0.1, 0.2, 1)',
                zIndex: isFlipped ? i + 1 : total - i,
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              {/* Recto (page impaire) */}
              <Box
                {...renderPage(sheet.front)}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  backfaceVisibility: 'hidden',
                  borderRadius: '0 14px 14px 0',
                  boxShadow: '-2px 0 8px rgba(0,0,0,0.12) inset',
                  ...(sheet.front ? renderPage(sheet.front).sx : {}),
                }}
              />
              {/* Verso (page paire) */}
              <Box
                {...renderPage(sheet.back)}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  borderRadius: '14px 0 0 14px',
                  boxShadow: '2px 0 8px rgba(0,0,0,0.12) inset',
                  ...(sheet.back ? renderPage(sheet.back).sx : {}),
                }}
              />
            </Box>
          );
        })}

        {/* Coin de page cliquable (tourner la page) */}
        {canNext && (
          <Box
            role="button"
            aria-label="Page suivante"
            tabIndex={0}
            onClick={() => setFlipped((f) => Math.min(total, f + 1))}
            onKeyDown={(e) => e.key === 'Enter' && setFlipped((f) => Math.min(total, f + 1))}
            sx={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '0 0 70px 70px',
              borderColor: 'transparent transparent rgba(0,0,0,0.18) transparent',
              cursor: 'pointer',
              zIndex: total + 3,
            }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button
          variant="contained"
          disabled={!canPrev}
          onClick={() => setFlipped((f) => Math.max(0, f - 1))}
          sx={{ borderRadius: 999, fontSize: 28, minWidth: 90, textTransform: 'none', bgcolor: '#3BA7E0', py: 1.5 }}
          aria-label="Page précédente"
        >
          ‹
        </Button>
        <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#3A3A3A', minWidth: 110, textAlign: 'center' }}>
          Page {currentPage} / {pages.length}
        </Typography>
        <Button
          variant="contained"
          disabled={!canNext}
          onClick={() => setFlipped((f) => Math.min(total, f + 1))}
          sx={{ borderRadius: 999, fontSize: 28, minWidth: 90, textTransform: 'none', bgcolor: '#3BA7E0', py: 1.5 }}
          aria-label="Page suivante"
        >
          ›
        </Button>
      </Box>
        </>
      )}
    </Box>
  );
}
