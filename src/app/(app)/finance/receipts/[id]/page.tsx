'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { api, ApiError } from '@/services/api';
import {
  formatAr,
  PAYMENT_METHOD_LABELS,
  type Receipt,
} from '@/services/finance';

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicata, setDuplicata] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: Receipt }>(`/finance/receipts/${id}`);
      setReceipt(res.data);
      setDuplicata(res.data.reprint_count > 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reçu introuvable ou accès refusé.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (Number.isInteger(id) && id > 0) load();
  }, [id, load]);

  const reprint = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/finance/receipts/${id}/reprint`, {});
      await load();
      setDuplicata(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Réimpression impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <LinearProgress />
      </Box>
    );
  }

  if (error || !receipt) {
    return (
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error ?? 'Reçu introuvable.'}
        </Alert>
        <Button component={Link} href="/finance/payments" variant="outlined">
          Retour aux paiements
        </Button>
      </Box>
    );
  }

  const cancelled = receipt.paymentStatus === 'cancelled';

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} className="no-print">
        <Button component={Link} href="/finance/payments" variant="outlined" size="small">
          Retour aux paiements
        </Button>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<HistoryOutlinedIcon />}
            onClick={reprint}
            disabled={busy}
          >
            Réimprimer (DUPLICATA)
          </Button>
          <Button variant="contained" size="small" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
            Imprimer
          </Button>
        </Stack>
      </Stack>

      <Card
        sx={{
          p: { xs: 2.5, md: 4 },
          border: '1px solid',
          borderColor: 'divider',
          position: 'relative',
        }}
      >
        {(duplicata || cancelled) && (
          <Typography
            sx={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-18deg)',
              fontSize: '4rem',
              fontWeight: 900,
              color: cancelled ? 'error.light' : 'text.disabled',
              opacity: 0.35,
              pointerEvents: 'none',
              letterSpacing: '0.1em',
            }}
          >
            {cancelled ? 'ANNULÉ' : 'DUPLICATA'}
          </Typography>
        )}

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              {receipt.school_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Reçu de paiement officiel
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="subtitle1" fontWeight={800}>
              {receipt.receipt_number}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Émis le {String(receipt.issued_at).slice(0, 16).replace('T', ' ')}
            </Typography>
            {duplicata && (
              <Chip size="small" color="warning" label={`DUPLICATA (${receipt.reprint_count})`} sx={{ mt: 0.5 }} />
            )}
            {cancelled && (
              <Chip size="small" color="error" label="Paiement annulé" sx={{ mt: 0.5 }} />
            )}
          </Box>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Élève" value={receipt.student_name} />
            <Detail label="Matricule" value={receipt.matricule} />
            <Detail label="Classe" value={receipt.class_name ?? '—'} />
            <Detail label="Année scolaire" value={receipt.year_label} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Motif" value={receipt.fee_name} />
            <Detail label="Mode de paiement" value={PAYMENT_METHOD_LABELS[receipt.method]} />
            <Detail label="Référence" value={receipt.reference ?? '—'} />
            <Detail label="Payeur" value={receipt.payer_name ?? '—'} />
          </Grid>
        </Grid>

        <Box
          sx={{
            mt: 2.5,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="subtitle1" fontWeight={800}>
            Montant reçu
          </Typography>
          <Typography variant="h5" fontWeight={900} sx={{ color: cancelled ? 'text.disabled' : 'success.main' }}>
            {formatAr(receipt.amount)}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
          Somme en lettres : {receipt.amount_in_words}
        </Typography>

        <Grid container spacing={2} sx={{ mt: 1.5 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Solde restant après paiement" value={formatAr(receipt.balance_after)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Agent" value={receipt.agent_name} />
          </Grid>
        </Grid>

        {receipt.paymentComment && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
            Observation : {receipt.paymentComment}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
          Ce reçu est généré par le logiciel scolaire. Les modes mobile money sont déclaratifs : aucune
          transaction n’est effectuée auprès d’un opérateur.
        </Typography>
      </Card>

      <style
        dangerouslySetInnerHTML={{
          __html: '@media print { .no-print { display: none !important; } }',
        }}
      />
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700}>
        {value}
      </Typography>
    </Box>
  );
}
