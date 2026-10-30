'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

// Section « Communications avec les parents » d'une fiche élève :
// chronologie du plus récent au plus ancien + création d'un contact.

export interface ContactGuardianOption {
  guardianId: number;
  lastName: string;
  firstNames: string;
  relationship: string;
}

interface ContactRow {
  id: number;
  guardianId: number;
  occurredAt: string;
  direction: string;
  channel: string;
  subject: string;
  summary: string | null;
  actionDecided: string | null;
  followupDueDate: string | null;
  followupStatus: string;
  createdBy: number;
  guardian_last_name?: string;
  guardian_first_names?: string;
  created_by_username?: string;
}

const DIRECTION_LABELS: Record<string, string> = {
  school_to_parent: 'École → parent',
  parent_to_school: 'Parent → école',
  joint: 'Conjoint',
};

const CHANNEL_LABELS: Record<string, string> = {
  call: 'Appel',
  visit: 'Visite',
  meeting: 'Réunion',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  other: 'Autre',
};

export const SUBJECT_LABELS: Record<string, string> = {
  absence: 'Absence',
  tardiness: 'Retard',
  grades: 'Résultats',
  behavior: 'Comportement',
  discipline: 'Discipline',
  administrative: 'Administratif',
  meeting: 'Réunion',
  other: 'Autre',
};

export const STATUS_LABELS: Record<string, string> = {
  todo: 'À suivre',
  ongoing: 'En cours',
  resolved: 'Résolu',
  cancelled: 'Annulé',
};

export const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success' | 'info'> = {
  todo: 'warning',
  ongoing: 'info',
  resolved: 'success',
  cancelled: 'default',
};

const EMPTY_FORM = {
  guardianId: '',
  occurredAt: '',
  direction: 'school_to_parent',
  channel: 'call',
  subject: 'absence',
  summary: '',
  actionDecided: '',
  followupDueDate: '',
  followupStatus: 'todo',
};

interface Props {
  studentId: number;
  guardians: ContactGuardianOption[];
}

export default function StudentContactsSection({ studentId, guardians }: Props) {
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('parent_contacts.manage') ?? false;

  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ subject: '', status: '', from: '', to: '' });
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'));
  const [snack, setSnack] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (filters.subject) params.set('subject', filters.subject);
      if (filters.status) params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await api.get<{ data: ContactRow[]; pagination: { total: number } }>(
        `/parent-contacts/students/${studentId}?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [studentId, page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/parent-contacts', {
        studentId,
        guardianId: Number(form.guardianId),
        occurredAt: new Date(form.occurredAt).toISOString(),
        direction: form.direction,
        channel: form.channel,
        subject: form.subject,
        summary: form.summary.trim() === '' ? null : form.summary.trim(),
        actionDecided: form.actionDecided.trim() === '' ? null : form.actionDecided.trim(),
        followupDueDate: form.followupDueDate === '' ? null : form.followupDueDate,
        followupStatus: form.followupStatus,
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setSnack('Contact enregistré.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const guardianName = (row: ContactRow) => {
    if (row.guardian_first_names) return `${row.guardian_last_name} ${row.guardian_first_names}`;
    const g = guardians.find((x) => x.guardianId === row.guardianId);
    return g ? `${g.lastName} ${g.firstNames}` : `#${row.guardianId}`;
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Typography variant="h6" fontWeight={800}>
          Communications avec les parents
        </Typography>
        {canManage && (
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Nouveau contact
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          size="small"
          label="Motif"
          value={filters.subject}
          onChange={(e) => {
            setFilters({ ...filters, subject: e.target.value });
            setPage(0);
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">Tous</MenuItem>
          {Object.entries(SUBJECT_LABELS).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Suivi"
          value={filters.status}
          onChange={(e) => {
            setFilters({ ...filters, status: e.target.value });
            setPage(0);
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">Tous</MenuItem>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label="Du"
          slotProps={{ inputLabel: { shrink: true } }}
          value={filters.from}
          onChange={(e) => {
            setFilters({ ...filters, from: e.target.value });
            setPage(0);
          }}
        />
        <TextField
          size="small"
          type="date"
          label="Au"
          slotProps={{ inputLabel: { shrink: true } }}
          value={filters.to}
          onChange={(e) => {
            setFilters({ ...filters, to: e.target.value });
            setPage(0);
          }}
        />
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Responsable</TableCell>
              <TableCell>Canal / motif</TableCell>
              <TableCell>Résumé</TableCell>
              <TableCell>Action décidée</TableCell>
              <TableCell>Suivi</TableCell>
              <TableCell>Auteur</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(rows ?? []).map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{new Date(row.occurredAt).toLocaleString('fr-FR')}</TableCell>
                <TableCell>{guardianName(row)}</TableCell>
                <TableCell>
                  {CHANNEL_LABELS[row.channel] ?? row.channel}
                  <br />
                  <Typography variant="caption" color="text.secondary">
                    {SUBJECT_LABELS[row.subject] ?? row.subject} — {DIRECTION_LABELS[row.direction] ?? row.direction}
                  </Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 220 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {row.summary || '—'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 180 }}>{row.actionDecided || '—'}</TableCell>
                <TableCell>
                  <Chip size="small" label={STATUS_LABELS[row.followupStatus] ?? row.followupStatus} color={STATUS_COLORS[row.followupStatus] ?? 'default'} variant="outlined" />
                  {row.followupDueDate && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      échéance {row.followupDueDate}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{row.created_by_username ?? row.createdBy}</Typography>
                </TableCell>
              </TableRow>
            ))}
            {rows !== null && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                    Aucune communication enregistrée pour cet élève.
                  </Typography>
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
        labelRowsPerPage="Lignes :"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle>Nouveau contact</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              required
              label="Responsable légal concerné"
              value={form.guardianId}
              onChange={(e) => setForm({ ...form, guardianId: e.target.value })}
            >
              {guardians.map((g) => (
                <MenuItem key={g.guardianId} value={g.guardianId}>
                  {g.lastName} {g.firstNames}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              required
              type="datetime-local"
              label="Date et heure du contact"
              slotProps={{ inputLabel: { shrink: true } }}
              value={form.occurredAt}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                fullWidth
                label="Sens"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value })}
              >
                {Object.entries(DIRECTION_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Canal"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                fullWidth
                label="Motif"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              >
                {Object.entries(SUBJECT_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Statut du suivi"
                value={form.followupStatus}
                onChange={(e) => setForm({ ...form, followupStatus: e.target.value })}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="Résumé factuel (facultatif)"
              multiline
              minRows={3}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
            <TextField
              label="Action décidée / suivi nécessaire (facultatif)"
              multiline
              minRows={2}
              value={form.actionDecided}
              onChange={(e) => setForm({ ...form, actionDecided: e.target.value })}
            />
            {form.followupStatus !== 'resolved' && form.followupStatus !== 'cancelled' && (
              <TextField
                type="date"
                label="Date de suivi prévue (facultatif)"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.followupDueDate}
                onChange={(e) => setForm({ ...form, followupDueDate: e.target.value })}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            disabled={saving || form.guardianId === '' || form.occurredAt === ''}
            onClick={submit}
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Stack>
  );
}
