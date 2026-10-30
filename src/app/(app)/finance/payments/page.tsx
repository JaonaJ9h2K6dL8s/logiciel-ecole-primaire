'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  formatAr,
  loadFormOptions,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Payment,
  type SchoolYear,
} from '@/services/finance';

export default function FinancePaymentsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const canView = Boolean(user && user.permissions.includes('finance.view'));
  const canRecord = Boolean(user && user.permissions.includes('finance.payments.record'));
  const canRequestCancel = Boolean(user?.permissions.includes('finance.payments.cancel.request'));

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [cancelPayment, setCancelPayment] = useState<Payment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
    setError(null);
    try {
      const params = new URLSearchParams({
        year,
        status,
        method,
        page: String(page + 1),
        pageSize: String(pageSize),
      });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<{ data: Payment[]; pagination: { total: number } }>(
        `/finance/payments?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [year, status, method, from, to, q, page, pageSize, canView]);

  useEffect(() => {
    load();
  }, [load]);

  /** Le reçu est retrouvé par son numéro via la liste des reçus (endpoint finance.receipts.view). */
  const openReceipt = async (payment: Payment) => {
    setError(null);
    try {
      const res = await api.get<{ data: { id: number }[] }>(
        `/finance/receipts?q=${encodeURIComponent(payment.receiptNumber ?? '')}&pageSize=1`
      );
      if (res.data.length > 0) {
        router.push(`/finance/receipts/${res.data[0].id}`);
      } else {
        setError('Reçu introuvable pour ce paiement.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Accès aux reçus refusé.');
    }
  };

  const submitCancelRequest = async () => {
    if (!cancelPayment) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/finance/payments/${cancelPayment.id}/cancel-request`, {
        payment_id: cancelPayment.id,
        reason: cancelReason.trim(),
      });
      setNotice(
        'Demande d’annulation enregistrée. Elle doit être approuvée par un autre utilisateur habilité.'
      );
      setCancelPayment(null);
      setCancelReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la demande d'annulation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Paiements"
        subtitle="Historique des paiements enregistrés. Un paiement confirmé ne peut être corrigé que par annulation tracée."
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
          l’administrateur si vous devez consulter les paiements.
        </Alert>
      )}

      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
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
          <Grid size={{ xs: 6, sm: 2 }}>
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
              <MenuItem value="all">Tous</MenuItem>
              <MenuItem value="confirmed">Confirmés</MenuItem>
              <MenuItem value="cancelled">Annulés</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Mode"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="all">Tous</MenuItem>
              {PAYMENT_METHODS.map((m) => (
                <MenuItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              size="small"
              fullWidth
              label="Du"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
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
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 1 }} />
          <Grid size={{ xs: 12 }}>
            <TextField
              size="small"
              fullWidth
              label="Recherche (élève, référence, payeur)"
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
              <TableCell>Date</TableCell>
              <TableCell>Élève</TableCell>
              <TableCell>Frais</TableCell>
              <TableCell>Montant</TableCell>
              <TableCell>Mode</TableCell>
              <TableCell>Référence</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Agent</TableCell>
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
                    Aucun paiement pour ces critères.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="caption">{String(p.recorded_at).slice(0, 16).replace('T', ' ')}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {p.last_name} {p.first_names}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{p.feeName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.className ?? ''}
                    </Typography>
                  </TableCell>
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
                    <Typography variant="caption">{p.recordedByName}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {p.receiptNumber && (
                        <Button
                          size="small"
                          startIcon={<ReceiptLongOutlinedIcon />}
                          onClick={() => openReceipt(p)}
                        >
                          Reçu
                        </Button>
                      )}
                      {canRequestCancel && p.status === 'confirmed' && (
                        <Button size="small" color="error" onClick={() => setCancelPayment(p)}>
                          Demander annulation
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

      {/* Demande d'annulation */}
      <Dialog open={Boolean(cancelPayment)} onClose={() => setCancelPayment(null)}>
        <DialogTitle>Demander l’annulation du paiement</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {cancelPayment && (
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {cancelPayment.last_name} {cancelPayment.first_names} — {formatAr(cancelPayment.amount)} (
                {PAYMENT_METHOD_LABELS[cancelPayment.method]}).
                <br />
                Le paiement ne sera supprimé ni modifié : un autre utilisateur habilité devra approuver
                la demande, et une contre-écriture mettra le solde à jour de manière traçable.
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
          <Button onClick={() => setCancelPayment(null)} disabled={busy}>
            Retour
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={submitCancelRequest}
            disabled={busy || cancelReason.trim().length < 3}
          >
            Envoyer la demande
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
