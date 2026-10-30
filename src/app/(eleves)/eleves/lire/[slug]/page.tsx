'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { studentZoneApi, type BookPage } from '@/services/studentZone';
import BookReader from '@/components/students/BookReader';

export default function BookReaderPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [pages, setPages] = useState<BookPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = params?.slug;
    if (!slug) return;
    studentZoneApi
      .getBookPages(Array.isArray(slug) ? slug[0] : slug)
      .then((r) => setPages(r.pages))
      .catch(() => setError('Livre introuvable.'));
  }, [params]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
        py: 5,
        px: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Button
        onClick={() => router.push('/eleves/lire')}
        sx={{ alignSelf: 'flex-start', borderRadius: 999, textTransform: 'none', fontSize: 18, bgcolor: '#fff' }}
      >
        ← Retour à la bibliothèque
      </Button>

      {!pages && !error && <CircularProgress size={56} sx={{ color: '#3BA7E0' }} />}
      {error && <Typography color="error" sx={{ fontSize: 22 }}>{error}</Typography>}
      {pages && <BookReader pages={pages} />}
    </Box>
  );
}
