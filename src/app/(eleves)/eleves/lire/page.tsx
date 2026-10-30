'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, CircularProgress } from '@mui/material';
import { studentZoneApi, type BookInfo } from '@/services/studentZone';

export default function LirePage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentZoneApi
      .getBooks()
      .then((r) => setBooks(r.books))
      .catch(() => setError('Impossible de charger la bibliothèque.'))
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
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#3BA7E0', mb: 1 }}>
          La bibliothèque
        </Typography>
        <Typography variant="h6" sx={{ color: '#3A3A3A', mb: 5 }}>
          Choisis un livre et tourne les pages !
        </Typography>

        {loading && <CircularProgress size={56} sx={{ color: '#3BA7E0' }} />}
        {error && <Typography color="error">{error}</Typography>}

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {books.map((b) => (
            <Box
              key={b.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/eleves/lire/${b.slug}`)}
              onKeyDown={(e) => e.key === 'Enter' && router.push(`/eleves/lire/${b.slug}`)}
              sx={{
                width: 260,
                height: 340,
                borderRadius: '24px',
                bgcolor: b.coverColor,
                color: '#fff',
                cursor: 'pointer',
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 0 rgba(0,0,0,0.15)',
                transition: 'transform .15s',
                '&:hover': { transform: 'translateY(-4px) rotate(-1deg)' },
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                {b.title}
              </Typography>
              <Box>
                <Typography sx={{ fontWeight: 700, bgcolor: 'rgba(255,255,255,0.25)', borderRadius: 999, py: 0.5, px: 2, display: 'inline-block' }}>
                  {b.level}
                </Typography>
                <Typography sx={{ mt: 1, opacity: 0.9 }}>{b.pages} pages</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
