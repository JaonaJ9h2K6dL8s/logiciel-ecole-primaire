'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, CircularProgress, Paper } from '@mui/material';
import { studentZoneApi, type ArtworkInfo } from '@/services/studentZone';
import { useStudentZoneStore } from '@/stores/studentZoneStore';

export default function MesDessinsPage() {
  const router = useRouter();
  const { student } = useStudentZoneStore();
  const [artworks, setArtworks] = useState<ArtworkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!student) {
      setLoading(false);
      return;
    }
    studentZoneApi
      .getArtworks()
      .then((r) => setArtworks(r.artworks))
      .catch(() => setError('Impossible de charger tes dessins.'))
      .finally(() => setLoading(false));
  }, [student]);

  if (!student) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Connecte-toi d&apos;abord pour voir tes dessins !
        </Typography>
        <Button
          variant="contained"
          onClick={() => router.push('/eleves')}
          sx={{ borderRadius: 999, fontSize: 20, textTransform: 'none', bgcolor: '#3BA7E0', px: 4, py: 1.5 }}
        >
          Aller à l&apos;accès élèves
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
        py: 6,
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Button
          onClick={() => router.push('/eleves')}
          sx={{ borderRadius: 999, textTransform: 'none', fontSize: 18, bgcolor: '#fff', mb: 3 }}
        >
          ← Retour
        </Button>
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#F2B84B', textAlign: 'center', mb: 5 }}>
          Mes dessins
        </Typography>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={56} sx={{ color: '#F2B84B' }} />
          </Box>
        )}
        {error && <Typography color="error" align="center">{error}</Typography>}

        {!loading && !error && artworks.length === 0 && (
          <Typography align="center" sx={{ fontSize: 22, color: '#3A3A3A' }}>
            Tu n&apos;as pas encore enregistré de dessin. Va faire un tour dans « Colorier » !
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {artworks.map((a) => (
            <Paper
              key={a.id}
              elevation={4}
              sx={{ borderRadius: '20px', overflow: 'hidden', width: 280, p: 0 }}
            >
              <Box
                component="img"
                src={studentZoneApi.artworkFileUrl(a.id)}
                alt={a.title}
                sx={{ width: '100%', height: 210, objectFit: 'contain', bgcolor: '#fff', p: 1 }}
              />
              <Box sx={{ p: 2 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{a.title}</Typography>
                <Typography sx={{ color: '#777', fontSize: 14 }}>
                  {new Date(a.createdAt).toLocaleDateString('fr-FR')}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
