'use client';

import { useCallback, useEffect, useState } from 'react';
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
  FEE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatAr,
  loadFormOptions,
  type PaymentMethod,
  type SchoolYear,
  type StudentFee,
} from '@/services/finance';

interface StudentHit {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
  currentClassName: string | null;
}

interface Statement {
  student: { id: number; matricule: string; last_name: string; first_names: string; className: string | null; yearLabel: string };
  fees: StudentFee[];
  payments: {
    id: number;
    amount: string;
    method: PaymentMethod;
    reference: string | null;
    payer_name: string | null;
    status: 'confirmed' | 'cancelled';
    recorded_at: string;
    receiptNumber: string | null;
    feeName: string;
    recordedByName: string;
  }[];
  totals: { totalDue: number; totalPaid: number; balance: number };
}

export default function FinanceStudentsPage() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
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

  const runSearch = async () => {
    if (!year) return;
    setSearchError(null);
    setStatement(null);
    setHits(null);
    try {
      const res = await api.get<{ data: StudentHit[] }>(
        `/finance/students/search?q=${encodeURIComponent(search.trim())}&schoolYearId=${year}`
      );
      setHits(res.data);
      if (res.data.length === 0) setSearchError('Aucun élève trouvé pour cette recherche.');
    } catch (err) {
      setSearchError(
        err instanceof ApiError ? err.message : 'Recherche impossible avec vos permissions.'
      );
    }
  };

  const loadStatement = useCallback(async (studentId: number) => {
    if (!year) return;
    setLoading(true);
    setError(null);
    setStatement(null);
    try {
      const res = await api.get<{ data: Statement }>(`/finance/students/${studentId}/statement?year=${year}`);
      setStatement(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement de la situation.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    // Changement d'année : réinitialiser pour forcer un rechargement cohérent.
    setStatement(null);
  }, [year]);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Situation financière des élèves"
        subtitle="Frais facturés, paiements et solde restant par élève, pour l'année sélectionnée."
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 4 }}>
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
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              size="small"
              fullWidth
              label="Nom ou matricule de l'élève"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button variant="contained" startIcon={<SearchOutlinedIcon />} onClick={runSearch} fullWidth>
              Rechercher
            </Button>
          </Grid>
        </Grid>
      </Card>

      {searchError && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setSearchError(null)}>
          {searchError}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {hits && hits.length > 0 && !statement && (
        <Card sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
            Élèves trouvés
          </Typography>
          <Stack spacing={1}>
            {hits.map((s) => (
              <Stack
                key={s.id}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}
              >
                <Typography variant="body2">
                  <strong>
                    {s.last_name} {s.first_names}
                  </strong>{' '}
                  ({s.matricule}) — {s.currentClassName ?? 'Sans classe'}
                </Typography>
                <Button size="small" variant="outlined" onClick={() => loadStatement(s.id)}>
                  Voir la situation
                </Button>
              </Stack>
            ))}
          </Stack>
        </Card>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {statement && (
        <>
          <Card sx={{ p: 2.5, mb: 3 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ sm: 'center' }}
              spacing={1}
            >
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {statement.student.last_name} {statement.student.first_names}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Matricule {statement.student.matricule} · {statement.student.className ?? 'Sans classe'} ·{' '}
                  {statement.student.yearLabel}
                </Typography>
              </Box>
              <Button size="small" onClick={() => setStatement(null)} variant="outlined">
                Changer d’élève
              </Button>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Total facturé
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {formatAr(statement.totals.totalDue)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Total payé
                </Typography>
                <Typography variant="h6" fontWeight={800} color="success.main">
                  {formatAr(statement.totals.totalPaid)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Solde restant
                </Typography>
                <Typography variant="h6" fontWeight={800} color={statement.totals.balance > 0 ? 'error.main' : 'text.primary'}>
                  {formatAr(statement.totals.balance)}
                </Typography>
              </Grid>
            </Grid>
          </Card>

          <TableContainer component={Card} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Frais</TableCell>
                  <TableCell>Catégorie</TableCell>
                  <TableCell>Montant</TableCell>
                  <TableCell>Payé</TableCell>
                  <TableCell>Solde</TableCell>
                  <TableCell>Échéance</TableCell>
                  <TableCell>Statut</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statement.fees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography color="text.secondary" sx={{ p: 2 }}>
                        Aucun frais facturé pour cet élève cette année.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  statement.fees.map((f) => (
                    <TableRow key={f.id} hover>
                      <TableCell>{f.name}</TableCell>
                      <TableCell>
                        <Typography variant="caption">{FEE_CATEGORY_LABELS[f.fee_category]}</Typography>
                      </TableCell>
                      <TableCell>{formatAr(f.amount)}</TableCell>
                      <TableCell>{formatAr(f.paid_amount)}</TableCell>
                      <TableCell>{formatAr(Number(f.amount) - Number(f.paid_amount))}</TableCell>
                      <TableCell>
                        <Typography variant="caption">{f.due_date ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={
                            f.status === 'paid'
                              ? 'success'
                              : f.status === 'partial'
                                ? 'warning'
                                : f.status === 'cancelled'
                                  ? 'default'
                                  : 'error'
                          }
                          label={FEE_STATUS_LABELS[f.status] ?? f.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer component={Card}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Frais concerné</TableCell>
                  <TableCell>Montant</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Référence</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Reçu</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statement.payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography color="text.secondary" sx={{ p: 2 }}>
                        Aucun paiement enregistré pour cet élève cette année.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  statement.payments.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell>
                        <Typography variant="caption">{String(p.recorded_at).slice(0, 16).replace('T', ' ')}</Typography>
                      </TableCell>
                      <TableCell>{p.feeName}</TableCell>
                      <TableCell>{formatAr(p.amount)}</TableCell>
                      <TableCell>
                        <Typography variant="caption">{PAYMENT_METHOD_LABELS[p.method]}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{p.reference ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={p.status === 'confirmed' ? 'success' : 'default'}
                          label={p.status === 'confirmed' ? 'Confirmé' : 'Annulé'}
                        />
                      </TableCell>
                      <TableCell>
                        {p.receiptNumber ? (
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {p.receiptNumber}
                          </Typography>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}
