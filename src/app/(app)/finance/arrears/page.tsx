'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  Chip,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import {
  FEE_CATEGORIES,
  FEE_CATEGORY_LABELS,
  formatAr,
  loadFormOptions,
  type ArrearRow,
  type ClassRow,
  type SchoolYear,
} from '@/services/finance';

export default function FinanceArrearsPage() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [rows, setRows] = useState<ArrearRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [classId, setClassId] = useState('');
  const [category, setCategory] = useState('all');
  const [overdue, setOverdue] = useState(false);
  const [partial, setPartial] = useState(false);
  const [q, setQ] = useState('');
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

  useEffect(() => {
    if (!year) return;
    loadFormOptions(Number(year))
      .then(({ classes: list }) => setClasses(list))
      .catch(() => setClasses([]));
  }, [year]);

  const load = useCallback(async () => {
    if (!year) return;
    setError(null);
    try {
      const params = new URLSearchParams({
        year,
        category,
        page: String(page + 1),
        pageSize: String(pageSize),
      });
      if (classId) params.set('class', classId);
      if (overdue) params.set('overdue', 'true');
      if (partial) params.set('partial', 'true');
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<{ data: ArrearRow[]; pagination: { total: number } }>(
        `/finance/arrears?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [year, classId, category, overdue, partial, q, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Impayés & relances"
        subtitle="Frais non soldés : échéances dépassées, paiements partiels. Les rappels restent internes et manuels — aucun message automatique n'est envoyé."
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 3 }}>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPage(0);
              }}
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
              label="Classe"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Toutes</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Catégorie"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="all">Toutes</MenuItem>
              {FEE_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {FEE_CATEGORY_LABELS[c]}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <Stack>
              <FormControlLabel
                control={<Switch checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(0); }} />}
                label="Échéances dépassées uniquement"
              />
              <FormControlLabel
                control={<Switch checked={partial} onChange={(e) => { setPartial(e.target.checked); setPage(0); }} />}
                label="Paiements partiels uniquement"
              />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              size="small"
              fullWidth
              label="Recherche (matricule, nom)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
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
              <TableCell>Élève</TableCell>
              <TableCell>Classe</TableCell>
              <TableCell>Frais</TableCell>
              <TableCell>Montant</TableCell>
              <TableCell>Payé</TableCell>
              <TableCell>Solde</TableCell>
              <TableCell>Échéance</TableCell>
              <TableCell>Tél. responsable</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Chargement…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucun impayé pour ces critères : tous les frais correspondants sont réglés.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {r.last_name} {r.first_names}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{r.className ?? '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{r.feeName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {FEE_CATEGORY_LABELS[r.fee_category]}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatAr(r.amount)}</TableCell>
                  <TableCell>{formatAr(r.paid_amount)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} color="error.main">
                      {formatAr(r.balance)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="caption">{r.due_date ?? '—'}</Typography>
                      {r.isOverdue === 1 && <Chip size="small" color="error" label="Retard" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{r.guardianPhone ?? '—'}</Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Par page"
        />
      </TableContainer>
    </Box>
  );
}
