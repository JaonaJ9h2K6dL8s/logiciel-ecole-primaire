'use client';

import { Box, Typography } from '@mui/material';
import PageHeader from '@/components/admin/PageHeader';
import AppearanceSettings from '@/components/appearance/AppearanceSettings';

/** « Apparence et personnalisation » (étape 22) — préférences par utilisateur. */
export default function AppearancePage() {
  return (
    <Box>
      <PageHeader
        title="Apparence et personnalisation"
        subtitle="Couleurs, fond d’écran et mascottes — préférences personnelles, appliquées immédiatement"
      />
      <Box sx={{ maxWidth: 900 }}>
        <AppearanceSettings />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        Vos préférences sont enregistrées dans votre compte et vous suivent sur vos autres appareils. Elles n’affectent ni les données scolaires
        ni les autres utilisateurs.
      </Typography>
    </Box>
  );
}
