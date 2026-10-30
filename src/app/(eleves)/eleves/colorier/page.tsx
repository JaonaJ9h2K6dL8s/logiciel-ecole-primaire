'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, CircularProgress } from '@mui/material';
import { studentZoneApi, type ColoringPageInfo } from '@/services/studentZone';

const ICON_COLORS = ['#E23B3B', '#3BA7E0', '#57B87B', '#F2B84B', '#B565D8', '#F58CA6', '#FF8C42', '#7ED6DF'];

export default function ColorierPage() {
  const router = useRouter();
  const [pages, setPages] = useState<ColoringPageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentZoneApi
      .getColoringPages()
      .then((r) => setPages(r.pages))
      .catch(() => setError('Impossible de charger les coloriages.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
        py: 6,
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: 1000, mx: 'auto', textAlign: 'center' }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#57B87B', mb: 1 }}>
          Coloriage
        </Typography>
        <Typography variant="h6" sx={{ color: '#3A3A3A', mb: 5 }}>
          Choisis un dessin à colorier !
        </Typography>

        {loading && <CircularProgress size={56} sx={{ color: '#57B87B' }} />}
        {error && <Typography color="error">{error}</Typography>}

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {pages.map((p, i) => (
            <Box
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/eleves/colorier/${p.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && router.push(`/eleves/colorier/${p.id}`)}
              sx={{
                width: 240,
                height: 220,
                borderRadius: '24px',
                bgcolor: ICON_COLORS[i % ICON_COLORS.length],
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 0 rgba(0,0,0,0.15)',
                transition: 'transform .15s',
                '&:hover': { transform: 'translateY(-4px) rotate(1deg)' },
                p: 2,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 800, textTransform: 'capitalize' }}>
                {p.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
