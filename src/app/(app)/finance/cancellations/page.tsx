'use client';

import { useCallback, useEffect, useState } from 'react';
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
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { formatAr, PAYMENT_METHOD_LABELS, type CancelRequest } from '@/services/finance';

export default function FinanceCancellationsPage() {
  const user = useAuthStore((s) => s.user);
  const canApprove = Boolean(user?.permissions.includes('finance.payments.cancel.approve'));

  const [rows, setRows] = useState<CancelRequest[] | null>(null);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState<CancelRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ data: CancelRequest[] }>(`/finance/cancel-requests?status=${status}`);
      setRows(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (req: CancelRequest) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/finance/cancel-requests/${req.id}/approve`, {});
      setNotice(`Annulation approuvée : le solde de ${req.last_name} ${req.first_names} a été recalculé.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'approbation.");
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!reject) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/finance/cancel-requests/${reject.id}/reject`, { reason: rejectReason.trim() });
      setNotice('Demande refusée.');
      setReject(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors du refus.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Annulations de paiements"
        subtitle="Toute correction passe par une demande motivée, approuvée par un autre utilisateur habilité. Aucun paiement n'est supprimé."
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Statut"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <MenuItem value="pending">En attente</MenuItem>
              <MenuItem value="approved">Approuvées</MenuItem>
              <MenuItem value="rejected">Refusées</MenuItem>
              <MenuItem value="all">Toutes</MenuItem>
            </TextField>
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
              <TableCell>Demande</TableCell>
              <TableCell>Élève</TableCell>
              <TableCell>Paiement</TableCell>
              <TableCell>Motif</TableCell>
              <TableCell>Demandée par</TableCell>
              <TableCell>Traitée par</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell align="right">Actions</TableCell>
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
                    Aucune demande d’annulation pour ce filtre.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography variant="caption">
                      #{r.id} — {String(r.requested_at).slice(0, 16).replace('T', ' ')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {r.last_name} {r.first_names}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatAr(r.amount)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {PAYMENT_METHOD_LABELS[r.method]} · {String(r.recorded_at).slice(0, 10)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography variant="caption">{r.reason}</Typography>
                    {r.rejection_reason && (
                      <Typography variant="caption" display="block" color="error">
                        Refus : {r.rejection_reason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{r.requestedByName}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{r.approvedByName ?? '—'}</Typography>
                    {r.approved_at && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {String(r.approved_at).slice(0, 16).replace('T', ' ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'default' : 'warning'}
                      label={r.status === 'approved' ? 'Approuvée' : r.status === 'rejected' ? 'Refusée' : 'En attente'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {canApprove && r.status === 'pending' && (
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" variant="contained" color="error" onClick={() => approve(r)} disabled={busy}>
                          Approuver
                        </Button>
                        <Button size="small" onClick={() => setReject(r)} disabled={busy}>
                          Refuser
                        </Button>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!canApprove && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Vous pouvez consulter les demandes, mais seul un utilisateur habilité
          (« finance.payments.cancel.approve »), différent du demandeur, peut les traiter.
        </Alert>
      )}

      {/* Refus avec motif */}
      <Dialog open={Boolean(reject)} onClose={() => setReject(null)}>
        <DialogTitle>Refuser la demande</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Le paiement reste confirmé et le solde inchangé.
            </Typography>
            <TextField
              size="small"
              fullWidth
              label="Motif du refus (obligatoire)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReject(null)} disabled={busy}>
            Retour
          </Button>
          <Button variant="contained" onClick={submitReject} disabled={busy || rejectReason.trim().length < 3}>
            Confirmer le refus
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
