'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  LinearProgress,
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
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  formatAr,
  loadFormOptions,
  newIdempotencyKey,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type SchoolYear,
  type StudentFee,
} from '@/services/finance';

export default function NewPaymentPage() {
  const user = useAuthStore((s) => s.user);
  const canRecord = Boolean(user && user.permissions.includes('finance.payments.record'));
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [q, setQ] = useState('');
  const [fees, setFees] = useState<StudentFee[] | null>(null);
  const [selected, setSelected] = useState<StudentFee | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [payerName, setPayerName] = useState('');
  const [reference, setReference] = useState('');
  const [comment, setComment] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ receiptNumber: string; receiptId: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    loadFormOptions()
      .then(({ years: list }) => {
        setYears(list);
        const active = list.find((y) => y.isActive);
        if (active) setYear(String(active.id));
      })
      .catch(() => setError('Impossible de charger les années scolaires.'));
  }, []);

  const remaining = useMemo(() => {
    if (!selected) return 0;
    return Number(selected.amount) - Number(selected.paid_amount);
  }, [selected]);

  const searchFees = useCallback(async () => {
    if (!year) return;
    setSearching(true);
    setSearchError(null);
    setSelected(null);
    try {
      const params = new URLSearchParams({ year, status: 'unpaid', pageSize: '15' });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<{ data: StudentFee[] }>(`/finance/student-fees?${params.toString()}`);
      setFees(res.data);
      if (res.data.length === 0) setSearchError('Aucun frais non soldé pour cette recherche.');
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Erreur de recherche.');
      setFees([]);
    } finally {
      setSearching(false);
    }
  }, [year, q]);

  const pick = (fee: StudentFee) => {
    setSelected(fee);
    setAmount(String(Number(fee.amount) - Number(fee.paid_amount)));
  };

  const submit = async () => {
    if (!selected) return;
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0 || amt > remaining) {
      setError('Montant invalide : il doit être un entier positif, au plus égal au solde restant.');
      return;
    }
    setBusy(true);
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    try {
      const res = await api.post<{
        data: { paymentId: number; receiptNumber?: string; duplicate: boolean };
      }>('/finance/payments', {
        student_fee_id: selected.id,
        amount: amt,
        method,
        payer_name: payerName.trim() || null,
        reference: reference.trim() || null,
        comment: comment.trim() || null,
        idempotency_key: idempotencyKey,
      });
      if (res.data.duplicate) {
        setSuccess({ receiptNumber: '', receiptId: 0 });
        setError('Ce paiement avait déjà été enregistré (double soumission détectée).');
        return;
      }
      const receiptNumber = res.data.receiptNumber ?? '';
      // Retrouver l'identifiant du reçu pour l'afficher.
      let receiptId = 0;
      try {
        const rres = await api.get<{ data: { id: number }[] }>(
          `/finance/receipts?q=${encodeURIComponent(receiptNumber)}&pageSize=1`
        );
        if (rres.data.length > 0) receiptId = rres.data[0].id;
      } catch {
        // L'accès aux reçus peut être refusé : le paiement est bien enregistré.
      }
      setSuccess({ receiptNumber, receiptId });
      setSelected(null);
      setAmount('');
      setPayerName('');
      setReference('');
      setComment('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de l’enregistrement du paiement.');
    } finally {
      setBusy(false);
    }
  };

  const amountValid = Number.isInteger(Number(amount)) && Number(amount) > 0 && Number(amount) <= remaining;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Enregistrer un paiement"
        subtitle="Le solde et le reçu sont contrôlés côté serveur. Aucun paiement excédentaire n'est accepté."
        action={
          <Button component={Link} href="/finance/payments" variant="outlined">
            Historique des paiements
          </Button>
        }
      />

      {!canRecord && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Accès refusé : vous ne disposez pas de la permission « finance.payments.record ». Seuls les
          utilisateurs habilités peuvent enregistrer un paiement.
        </Alert>
      )}
      {canRecord && success && (
        <Alert
          severity="success"
          icon={<CheckCircleOutlinedIcon />}
          sx={{ mb: 2 }}
          onClose={() => setSuccess(null)}
        >
          Paiement enregistré. Reçu <strong>{success.receiptNumber}</strong>
          {success.receiptId > 0 ? (
            <>
              {' — '}
              <Link href={`/finance/receipts/${success.receiptId}`}>voir et imprimer le reçu</Link>
            </>
          ) : (
            ' (consultez la liste des reçus pour l’imprimer).'
          )}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {canRecord && (
      <>
      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 4 }}>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setFees(null);
                setSelected(null);
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
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              size="small"
              fullWidth
              label="Rechercher un frais non soldé (matricule, nom, frais)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchFees();
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button variant="contained" startIcon={<SearchOutlinedIcon />} onClick={searchFees} fullWidth>
              Rechercher
            </Button>
          </Grid>
        </Grid>
      </Card>

      {searching && <LinearProgress sx={{ mb: 2 }} />}
      {searchError && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setSearchError(null)}>
          {searchError}
        </Alert>
      )}

      {fees && fees.length > 0 && !selected && (
        <TableContainer component={Card} sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Élève</TableCell>
                <TableCell>Classe</TableCell>
                <TableCell>Frais</TableCell>
                <TableCell>Montant</TableCell>
                <TableCell>Déjà payé</TableCell>
                <TableCell>Solde</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fees.map((f) => (
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
                  <TableCell>{f.name}</TableCell>
                  <TableCell>{formatAr(f.amount)}</TableCell>
                  <TableCell>{formatAr(f.paid_amount)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {formatAr(Number(f.amount) - Number(f.paid_amount))}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="contained" onClick={() => pick(f)}>
                      Payer ce frais
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {selected && (
        <Card sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={800}>
            Paiement — {selected.lastName} {selected.firstName} ({selected.matricule})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {selected.className ?? 'Sans classe'} · {selected.name} · Montant {formatAr(selected.amount)} ·
            Déjà payé {formatAr(selected.paid_amount)} · Solde restant {formatAr(remaining)}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="Montant versé (Ar)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputProps={{ min: 1, step: 1, max: remaining }}
                error={amount !== '' && !amountValid}
                helperText={amount !== '' && !amountValid ? `Entier entre 1 et ${remaining.toLocaleString('fr-FR')}` : 'Partiel ou total'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                size="small"
                fullWidth
                label="Mode de paiement"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <MenuItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="Référence (facultatif)"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                inputProps={{ maxLength: 120 }}
                helperText="N° transaction mobile money, chèque… (déclaratif)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Nom du payeur (facultatif)"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                inputProps={{ maxLength: 150 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Commentaire (facultatif)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                inputProps={{ maxLength: 500 }}
              />
            </Grid>
          </Grid>
          <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={() => setSelected(null)} disabled={busy}>
              Choisir un autre frais
            </Button>
            <Button variant="contained" onClick={submit} disabled={busy || !amountValid}>
              Enregistrer le paiement
            </Button>
          </Stack>
        </Card>
      )}
      </>
      )}
    </Box>
  );
}
