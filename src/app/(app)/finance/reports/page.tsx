'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import {
  FEE_CATEGORY_LABELS,
  formatAr,
  loadFormOptions,
  PAYMENT_METHOD_LABELS,
  type FeeCategory,
  type PaymentMethod,
  type SchoolYear,
} from '@/services/finance';

interface ReportRow {
  label: string;
  total: number;
  count: number;
}

type GroupBy = 'month' | 'method' | 'class' | 'category';

export default function FinanceReportsPage() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFormOptions()
      .then(({ years: list }) => {
        setYears(list);
        const active = list.find((y) => y.isActive);
        if (active) setYear(String(active.id));
      })
      .catch(() => setError('Impossible de charger les années scolaires.'));
  }, []);

  const load = useCallback(async () => {
    if (!year) return;
    setError(null);
    try {
      const params = new URLSearchParams({ year, groupBy });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<{ data: { rows: ReportRow[] } }>(`/finance/reports?${params.toString()}`);
      setRows(res.data.rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement des rapports.');
      setRows([]);
    }
  }, [year, groupBy, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const formatLabel = (r: ReportRow) => {
    if (groupBy === 'method') return PAYMENT_METHOD_LABELS[r.label as PaymentMethod] ?? r.label;
    if (groupBy === 'category') return FEE_CATEGORY_LABELS[r.label as FeeCategory] ?? r.label;
    return r.label;
  };

  const grandTotal = (rows ?? []).reduce((acc, r) => acc + r.total, 0);
  const grandCount = (rows ?? []).reduce((acc, r) => acc + r.count, 0);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Rapports financiers"
        subtitle="Recettes encaissées (paiements confirmés uniquement). Les paiements annulés sont exclus des totaux nets."
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 3 }}>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ccc', width: '100%' }}
              aria-label="Année scolaire"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.isActive ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Regrouper par"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            >
              <MenuItem value="month">Mois</MenuItem>
              <MenuItem value="method">Mode de paiement</MenuItem>
              <MenuItem value="class">Classe</MenuItem>
              <MenuItem value="category">Catégorie de frais</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              size="small"
              fullWidth
              label="Du"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              size="small"
              fullWidth
              label="Au"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button variant="contained" startIcon={<SearchOutlinedIcon />} onClick={load} fullWidth>
              Actualiser
            </Button>
          </Grid>
        </Grid>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                {groupBy === 'month' ? 'Mois' : groupBy === 'method' ? 'Mode' : groupBy === 'class' ? 'Classe' : 'Catégorie'}
              </TableCell>
              <TableCell align="right">Nombre de paiements</TableCell>
              <TableCell align="right">Total encaissé (net)</TableCell>
              <TableCell align="right">Part</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Chargement…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucune recette sur la période sélectionnée.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.label} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {formatLabel(r)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{r.count}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700}>
                      {formatAr(r.total)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" color="text.secondary">
                      {grandTotal > 0 ? `${Math.round((r.total / grandTotal) * 100)} %` : '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
            {rows && rows.length > 0 && (
              <TableRow>
                <TableCell>
                  <Typography variant="body2" fontWeight={900}>
                    Total
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={900}>
                    {grandCount}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={900}>
                    {formatAr(grandTotal)}
                  </Typography>
                </TableCell>
                <TableCell align="right">100 %</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
