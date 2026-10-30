'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
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
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  FEE_CATEGORIES,
  FEE_CATEGORY_LABELS,
  FEE_STATUS_LABELS,
  formatAr,
  loadFormOptions,
  type ClassRow,
  type FeeCategory,
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

const emptyFeeForm = () => ({
  student_id: 0,
  studentLabel: '',
  fee_category: 'other' as FeeCategory,
  name: '',
  amount: '',
  due_date: '',
  notes: '',
});

export default function FinanceChargesPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('finance.charges.manage'));

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [rows, setRows] = useState<StudentFee[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('unpaid');
  const [category, setCategory] = useState('all');
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [feeFormOpen, setFeeFormOpen] = useState(false);
  const [feeForm, setFeeForm] = useState(emptyFeeForm());
  const [studentHits, setStudentHits] = useState<StudentHit[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const [cancelFee, setCancelFee] = useState<StudentFee | null>(null);
  const [cancelReason, setCancelReason] = useState('');

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
        status,
        category,
        page: String(page + 1),
        pageSize: String(pageSize),
      });
      if (classId) params.set('class', classId);
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<{ data: StudentFee[]; pagination: { total: number } }>(
        `/finance/student-fees?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [year, status, category, classId, q, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const searchStudents = async (search: string) => {
    if (search.trim().length < 2) {
      setStudentHits([]);
      return;
    }
    setStudentSearching(true);
    try {
      const res = await api.get<{ data: StudentHit[] }>(
        `/finance/students/search?q=${encodeURIComponent(search.trim())}&schoolYearId=${year}`
      );
      setStudentHits(res.data);
    } catch {
      setStudentHits([]);
    } finally {
      setStudentSearching(false);
    }
  };

  const openFeeForm = () => {
    setFeeForm(emptyFeeForm());
    setStudentHits([]);
    setFeeFormOpen(true);
  };

  const saveFee = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/finance/student-fees', {
        student_id: feeForm.student_id,
        school_year_id: Number(year),
        fee_category: feeForm.fee_category,
        name: feeForm.name.trim(),
        amount: Number(feeForm.amount),
        due_date: feeForm.due_date || null,
        notes: feeForm.notes.trim() || null,
      });
      setNotice('Frais individuel créé.');
      setFeeFormOpen(false);
      setPage(0);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelFee) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/finance/student-fees/${cancelFee.id}/cancel`, { reason: cancelReason.trim() });
      setNotice('Frais annulé.');
      setCancelFee(null);
      setCancelReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'annulation.");
    } finally {
      setBusy(false);
    }
  };

  const feeFormValid = feeForm.student_id > 0 && feeForm.name.trim() && Number(feeForm.amount) > 0;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Frais émis"
        subtitle="Frais dus par élève : facturés, payés, partiels ou annulés. Le solde officiel est calculé côté serveur."
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openFeeForm}>
              Frais individuel
            </Button>
          ) : undefined
        }
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
              label="Statut"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="unpaid">Non soldés</MenuItem>
              <MenuItem value="pending">Non payés</MenuItem>
              <MenuItem value="partial">Partiels</MenuItem>
              <MenuItem value="paid">Payés</MenuItem>
              <MenuItem value="cancelled">Annulés</MenuItem>
              <MenuItem value="all">Tous</MenuItem>
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
          <Grid size={{ xs: 12 }}>
            <TextField
              size="small"
              fullWidth
              label="Recherche (matricule, nom, frais)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </Grid>
        </Grid>
      </Card>

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
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
              <TableCell>Statut</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Chargement…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucun frais émis pour ces critères.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {f.lastName} {f.firstName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {f.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{f.className ?? '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{f.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {FEE_CATEGORY_LABELS[f.fee_category]}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatAr(f.amount)}</TableCell>
                  <TableCell>{formatAr(f.paid_amount)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {formatAr(Number(f.amount) - Number(f.paid_amount))}
                    </Typography>
                  </TableCell>
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
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {f.status !== 'paid' && f.status !== 'cancelled' && (
                        <Button
                          size="small"
                          component={Link}
                          href="/finance/payments/new"
                          startIcon={<PaymentsOutlinedIcon />}
                        >
                          Payer
                        </Button>
                      )}
                      {canManage && f.status !== 'cancelled' && Number(f.paid_amount) === 0 && (
                        <Button size="small" color="error" onClick={() => setCancelFee(f)}>
                          Annuler
                        </Button>
                      )}
                    </Stack>
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

      {/* Création d'un frais individuel */}
      <Dialog open={feeFormOpen} onClose={() => setFeeFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nouveau frais individuel</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small"
              fullWidth
              label="Rechercher l'élève (nom ou matricule, 2 caractères min.)"
              onChange={(e) => searchStudents(e.target.value)}
              helperText={studentSearching ? 'Recherche…' : 'L’élève doit avoir une inscription active pour cette année.'}
            />
            {studentHits.length > 0 && (
              <Box>
                {studentHits.map((s) => (
                  <Button
                    key={s.id}
                    size="small"
                    variant={feeForm.student_id === s.id ? 'contained' : 'outlined'}
                    onClick={() =>
                      setFeeForm({
                        ...feeForm,
                        student_id: s.id,
                        studentLabel: `${s.last_name} ${s.first_names} (${s.matricule})`,
                      })
                    }
                    sx={{ mr: 1, mb: 1 }}
                  >
                    {s.last_name} {s.first_names} — {s.matricule}
                  </Button>
                ))}
              </Box>
            )}
            {feeForm.student_id > 0 && (
              <Typography variant="body2" fontWeight={700}>
                Élève sélectionné : {feeForm.studentLabel}
              </Typography>
            )}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Catégorie"
                  value={feeForm.fee_category}
                  onChange={(e) => setFeeForm({ ...feeForm, fee_category: e.target.value as FeeCategory })}
                >
                  {FEE_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {FEE_CATEGORY_LABELS[c]}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Nom du frais"
                  value={feeForm.name}
                  onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })}
                  inputProps={{ maxLength: 150 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Montant (Ar)"
                  type="number"
                  value={feeForm.amount}
                  onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })}
                  inputProps={{ min: 1, step: 1 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Échéance (facultatif)"
                  type="date"
                  value={feeForm.due_date}
                  onChange={(e) => setFeeForm({ ...feeForm, due_date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  size="small"
                  fullWidth
                  label="Notes (facultatif)"
                  value={feeForm.notes}
                  onChange={(e) => setFeeForm({ ...feeForm, notes: e.target.value })}
                  inputProps={{ maxLength: 500 }}
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeeFormOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={saveFee} disabled={busy || !feeFormValid}>
            Créer le frais
          </Button>
        </DialogActions>
      </Dialog>

      {/* Annulation d'un frais */}
      <Dialog open={Boolean(cancelFee)} onClose={() => setCancelFee(null)}>
        <DialogTitle>Annuler ce frais ?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {cancelFee && (
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {cancelFee.lastName} {cancelFee.firstName} — {cancelFee.name} ({formatAr(cancelFee.amount)}).
                Le frais sera marqué annulé ; aucune donnée n’est supprimée.
              </Typography>
            )}
            <TextField
              size="small"
              fullWidth
              label="Motif obligatoire"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelFee(null)} disabled={busy}>
            Retour
          </Button>
          <Button variant="contained" color="error" onClick={confirmCancel} disabled={busy || cancelReason.trim().length < 3}>
            Confirmer l’annulation
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
