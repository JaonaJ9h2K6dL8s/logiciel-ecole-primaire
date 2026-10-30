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
  DialogTitle,
  MenuItem,
  Snackbar,
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
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

interface PunchRow {
  id: number;
  studentId: number;
  eventType: 'ARRIVAL' | 'EXIT';
  occurredAt: string;
  recordedAt: string;
  schoolDate: string;
  status: 'valid' | 'corrected';
  deviceLabel: string | null;
  correctsPunchId: number | null;
  matricule: string;
  last_name: string;
  first_names: string;
  className: string | null;
  punchedByName: string;
}

const fmt = (dt: string | null | undefined) =>
  dt ? new Date(dt).toLocaleString('fr-MG', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

const EMPTY_FORM = { eventType: 'ARRIVAL', occurredAt: '', reason: '' };

export default function EntryPunchHistoryPage() {
  const [rows, setRows] = useState<PunchRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [eventType, setEventType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [correctionTarget, setCorrectionTarget] = useState<PunchRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (date) params.set('date', date);
      if (eventType) params.set('eventType', eventType);
      const res = await api.get<{ data: PunchRow[]; pagination: { total: number } }>(
        `/entry-punches?${params}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [page, pageSize, search, date, eventType]);

  useEffect(() => {
    load();
  }, [load]);

  const openCorrection = (row: PunchRow) => {
    setForm({ eventType: row.eventType, occurredAt: '', reason: '' });
    setFormError(null);
    setCorrectionTarget(row);
  };

  const submitCorrection = async () => {
    if (!correctionTarget) return;
    if (form.reason.trim().length < 5) {
      setFormError('Motif de correction obligatoire (5 caractères minimum).');
      return;
    }
    const body: Record<string, unknown> = { reason: form.reason.trim() };
    if (form.eventType !== correctionTarget.eventType) body.eventType = form.eventType;
    if (form.occurredAt) {
      // Saisie administrative motivée : conversion ISO explicite côté client,
      // refusée par le serveur si dans le futur.
      body.occurredAt = new Date(form.occurredAt).toISOString();
    }
    if (body.eventType === undefined && body.occurredAt === undefined) {
      setFormError('Aucune modification : choisissez un type d’événement ou une heure différente.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post(`/entry-punches/${correctionTarget.id}/corrections`, body);
      setSnack('Pointage corrigé. Les valeurs d’origine sont conservées.');
      setCorrectionTarget(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Historique des pointages"
        subtitle="Chaque correction conserve les valeurs d’origine et son motif"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Matricule ou nom…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(0);
                setSearch(searchInput);
              }
            }}
            sx={{ flex: 1 }}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
          />
          <TextField
            size="small"
            type="date"
            label="Date scolaire"
            value={date}
            onChange={(e) => {
              setPage(0);
              setDate(e.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 170 }}
          />
          <TextField
            size="small"
            select
            label="Type"
            value={eventType}
            onChange={(e) => {
              setPage(0);
              setEventType(e.target.value);
            }}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="ARRIVAL">Arrivée</MenuItem>
            <MenuItem value="EXIT">Sortie</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date scolaire</TableCell>
                <TableCell>Élève</TableCell>
                <TableCell>Classe</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Heure de l&rsquo;événement</TableCell>
                <TableCell>Heure d&rsquo;enregistrement</TableCell>
                <TableCell>Agent</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.schoolDate}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {r.last_name} {r.first_names}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.className ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={r.eventType === 'ARRIVAL' ? 'success' : 'warning'}
                      label={r.eventType === 'ARRIVAL' ? 'Arrivée' : 'Sortie'}
                      variant="outlined"
                    />
                    {r.status === 'corrected' && (
                      <Chip size="small" label="corrigé" sx={{ ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>{fmt(r.occurredAt)}</TableCell>
                  <TableCell>{fmt(r.recordedAt)}</TableCell>
                  <TableCell>{r.punchedByName}</TableCell>
                  <TableCell align="right">
                    {r.status === 'valid' && (
                      <Button size="small" startIcon={<EditNoteOutlinedIcon />} onClick={() => openCorrection(r)}>
                        Corriger
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState message="Aucun pointage trouvé pour ces critères." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
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
          labelRowsPerPage="Lignes par page"
        />
      </Card>

      <Dialog open={Boolean(correctionTarget)} onClose={() => !saving && setCorrectionTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Corriger le pointage</DialogTitle>
        <DialogContent>
          {correctionTarget && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2">
                {correctionTarget.last_name} {correctionTarget.first_names} ({correctionTarget.matricule}) —{' '}
                {correctionTarget.eventType === 'ARRIVAL' ? 'Arrivée' : 'Sortie'} du {correctionTarget.schoolDate} à{' '}
                {fmt(correctionTarget.occurredAt)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                La ligne d’origine est conservée et marquée « corrigée » ; une nouvelle ligne validée est créée.
              </Typography>
              <TextField
                select
                label="Type d'événement"
                value={form.eventType}
                onChange={(e) => setForm({ ...form, eventType: e.target.value })}
              >
                <MenuItem value="ARRIVAL">Arrivée</MenuItem>
                <MenuItem value="EXIT">Sortie</MenuItem>
              </TextField>
              <TextField
                label="Heure corrigée (facultatif)"
                type="datetime-local"
                value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Motif de la correction"
                required
                multiline
                minRows={2}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                error={form.reason.trim().length > 0 && form.reason.trim().length < 5}
                helperText="Motif obligatoire, conservé dans le journal."
              />
              {formError && <Alert severity="error">{formError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorrectionTarget(null)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={() => setConfirmOpen(true)} variant="contained" disabled={saving}>
            Corriger
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmer la correction"
        message="Une correction est auditée et ne peut pas être annulée. Les valeurs d'origine restent visibles dans l'historique. Continuer ?"
        confirmLabel="Corriger"
        onConfirm={() => {
          setConfirmOpen(false);
          void submitCorrection();
        }}
        onClose={() => setConfirmOpen(false)}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
