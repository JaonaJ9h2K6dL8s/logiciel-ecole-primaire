'use client';

import { useParams, useRouter } from 'next/navigation';
import { Box, Button, Typography } from '@mui/material';
import ColoringCanvas from '@/components/students/ColoringCanvas';

export default function ColorierTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : '';

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
        gap: 3,
      }}
    >
      <Button
        onClick={() => router.push('/eleves/colorier')}
        sx={{ alignSelf: 'flex-start', borderRadius: 999, textTransform: 'none', fontSize: 18, bgcolor: '#fff' }}
      >
        ← Retour aux coloriages
      </Button>
      <Typography variant="h4" sx={{ fontWeight: 800, color: '#57B87B' }}>
        Colorie avec les doigts !
      </Typography>
      {id ? <ColoringCanvas templateId={id} /> : <Typography color="error">Coloriage introuvable.</Typography>}
    </Box>
  );
}
