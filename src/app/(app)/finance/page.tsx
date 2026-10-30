'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  formatAr,
  loadFormOptions,
  PAYMENT_METHOD_LABELS,
  type FinanceDashboard,
  type SchoolYear,
} from '@/services/finance';

export default function FinanceDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const canView = Boolean(user && user.permissions.includes('finance.view'));
  const canRecord = Boolean(user && user.permissions.includes('finance.payments.record'));
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    loadFormOptions()
      .then(({ years: list }) => {
        setYears(list);
        const active = list.find((y) => y.isActive);
        if (active) setYear(String(active.id));
      })
      .catch(() => setError('Impossible de charger les années scolaires.'));
  }, [canView]);

  const load = useCallback(async () => {
    if (!year || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: FinanceDashboard }>(`/finance/dashboard?year=${year}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [year, canView]);

  useEffect(() => {
    load();
  }, [load]);

  const cards = data
    ? [
        { label: 'Total facturé', value: formatAr(data.billed), color: 'text.primary' },
        { label: 'Total encaissé (net)', value: formatAr(data.collected), color: 'success.main' },
        { label: 'Solde restant dû', value: formatAr(data.outstanding), color: 'error.main' },
        { label: 'Paiements du jour', value: formatAr(data.todayCollected), color: 'primary.main' },
        { label: 'Recettes du mois', value: formatAr(data.monthCollected), color: 'primary.dark' },
        { label: 'Échéances en retard', value: String(data.overdueCount), color: 'warning.main' },
      ]
    : [];

  const maxMethod = data ? Math.max(1, ...data.methods.map((m) => m.total)) : 1;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Tableau de bord financier"
        subtitle="Indicateurs calculés à partir des paiements confirmés et des frais valides (montants nets, annulations exclues)."
        action={
          canRecord ? (
            <Button component={Link} href="/finance/payments/new" variant="contained">
              Enregistrer un paiement
            </Button>
          ) : undefined
        }
      />

      {!canView && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Accès refusé : vous ne disposez pas de la permission « finance.view ». Contactez
          l’administrateur si vous devez consulter les données financières.
        </Alert>
      )}
      {canView && (
        <>
          <Card sx={{ p: 2, mb: 3 }}>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ccc' }}
              aria-label="Année scolaire"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.isActive ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </Card>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {loading && <LinearProgress sx={{ mb: 2 }} />}
        </>
      )}

      {data && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {cards.map((c) => (
              <Grid size={{ xs: 6, sm: 4, md: 2 }} key={c.label}>
                <Card sx={{ p: 2, height: '100%' }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {c.label}
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: c.color }}>
                    {c.value}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
                  Répartition des paiements par mode
                </Typography>
                {data.methods.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Aucun paiement confirmé pour cette année.
                  </Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {data.methods.map((m) => (
                      <Box key={m.method}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {PAYMENT_METHOD_LABELS[m.method]}{' '}
                            <Typography component="span" variant="caption" color="text.secondary">
                              ({m.count})
                            </Typography>
                          </Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {formatAr(m.total)}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={(m.total / maxMethod) * 100}
                          sx={{ height: 8, borderRadius: 4 }}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2.5, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
                  Impayés par classe (solde restant)
                </Typography>
                {data.arrearsByClass.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Aucun impayé : tous les frais émis sont réglés.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {data.arrearsByClass.map((c) => (
                      <Stack key={c.className} direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600}>
                          {c.className}{' '}
                          <Typography component="span" variant="caption" color="text.secondary">
                            ({c.feeCount} frais)
                          </Typography>
                        </Typography>
                        <Chip label={formatAr(c.balance)} color="warning" size="small" variant="outlined" />
                      </Stack>
                    ))}
                  </Stack>
                )}
                <Divider sx={{ my: 2 }} />
                <Button component={Link} href="/finance/arrears" size="small" variant="outlined">
                  Voir les impayés détaillés
                </Button>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
              Évolution des recettes (6 derniers mois, paiements confirmés)
            </Typography>
            {data.evolution.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucune recette sur la période.
              </Typography>
            ) : (
              <BarChart
                height={260}
                xAxis={[
                  {
                    scaleType: 'band',
                    data: data.evolution.map((e) => e.ym),
                  },
                ]}
                series={[{ data: data.evolution.map((e) => e.total), label: 'Recettes (Ar)' }]}
                slotProps={{ legend: { direction: 'vertical', position: { vertical: 'middle', horizontal: 'end' }, sx: { display: 'none' } } }}
              />
            )}
          </Card>
        </>
      )}
    </Box>
  );
}
