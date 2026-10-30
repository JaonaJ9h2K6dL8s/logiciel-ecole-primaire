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
  DialogTitle,
  MenuItem,
  Pagination,
  Snackbar,
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
import AddIcon from '@mui/icons-material/Add';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

// Communications avec les parents : liste globale filtrée + création.

interface ContactRow {
  id: number;
  studentId: number;
  occurredAt: string;
  direction: string;
  channel: string;
  subject: string;
  summary: string | null;
  actionDecided: string | null;
  followupDueDate: string | null;
  followupStatus: string;
  student_last_name: string;
  student_first_names: string;
  guardian_last_name: string;
  guardian_first_names: string;
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
const SUBJECT_LABELS: Record<string, string> = {
  absence: 'Absence',
  tardiness: 'Retard',
  grades: 'Résultats',
  behavior: 'Comportement',
  discipline: 'Discipline',
  administrative: 'Administratif',
  meeting: 'Réunion',
  other: 'Autre',
};
const STATUS_LABELS: Record<string, string> = {
  todo: 'À suivre',
  ongoing: 'En cours',
  resolved: 'Résolu',
  cancelled: 'Annulé',
};
const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success' | 'info'> = {
  todo: 'warning',
  ongoing: 'info',
  resolved: 'success',
  cancelled: 'default',
};

interface StudentOption {
  id: number;
  last_name: string;
  first_names: string;
  matricule: string;
}
interface GuardianOption {
  guardianId: number;
  lastName: string;
  firstNames: string;
}

const EMPTY_FORM = {
  studentId: '',
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

export default function CommunicationsPage() {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ subject: '', status: '', from: '', to: '', q: '' });
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [guardians, setGuardians] = useState<GuardianOption[]>([]);
  const [saving, setSaving] = useState(false);

  const pageSize = 20;

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.subject) params.set('subject', filters.subject);
      if (filters.status) params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await api.get<{ data: ContactRow[]; pagination: { total: number } }>(
        `/parent-contacts?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = async () => {
    setForm(EMPTY_FORM);
    setGuardians([]);
    setDialogOpen(true);
    try {
      const res = await api.get<{ data: StudentOption[] }>(
        `/students?page=1&pageSize=50${filters.q ? `&search=${encodeURIComponent(filters.q)}` : ''}`
      );
      setStudents(res.data ?? []);
    } catch {
      setStudents([]);
    }
  };

  const onStudentPick = async (studentId: string) => {
    setForm({ ...form, studentId, guardianId: '' });
    if (studentId === '') {
      setGuardians([]);
      return;
    }
    try {
      const res = await api.get<{ data: GuardianOption[] }>(`/students/${studentId}/guardians`);
      setGuardians(res.data ?? []);
    } catch {
      setGuardians([]);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/parent-contacts', {
        studentId: Number(form.studentId),
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
      setSnack('Contact enregistré.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Box>
      <PageHeader
        title="Communications parents"
        subtitle="Historique des contacts entre l'école et les responsables légaux"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
            Nouveau contact
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
          <TextField
            select
            size="small"
            label="Motif"
            value={filters.subject}
            onChange={(e) => {
              setFilters({ ...filters, subject: e.target.value });
              setPage(1);
            }}
            sx={{ minWidth: 150 }}
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
              setPage(1);
            }}
            sx={{ minWidth: 150 }}
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
              setPage(1);
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
              setPage(1);
            }}
          />
        </Stack>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Élève</TableCell>
                <TableCell>Responsable</TableCell>
                <TableCell>Canal / motif</TableCell>
                <TableCell>Résumé</TableCell>
                <TableCell>Suivi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{new Date(row.occurredAt).toLocaleString('fr-FR')}</TableCell>
                  <TableCell>
                    <Link href={`/students/${row.studentId}`} style={{ textDecoration: 'none' }}>
                      <Typography variant="body2" color="primary">
                        {row.student_last_name} {row.student_first_names}
                      </Typography>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.guardian_last_name} {row.guardian_first_names}
                  </TableCell>
                  <TableCell>
                    {CHANNEL_LABELS[row.channel] ?? row.channel}
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      {SUBJECT_LABELS[row.subject] ?? row.subject} — {DIRECTION_LABELS[row.direction] ?? row.direction}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {row.summary || '—'}
                    </Typography>
                    {row.actionDecided && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        Action : {row.actionDecided}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={STATUS_LABELS[row.followupStatus] ?? row.followupStatus}
                      color={STATUS_COLORS[row.followupStatus] ?? 'default'}
                      variant="outlined"
                    />
                    {row.followupDueDate && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        échéance {row.followupDueDate}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="Aucune communication enregistrée. Utilisez « Nouveau contact » pour commencer." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {pageCount > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <Pagination count={pageCount} page={page} onChange={(_e, p) => setPage(p)} color="primary" />
          </Box>
        )}
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau contact</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select required label="Élève" value={form.studentId} onChange={(e) => onStudentPick(e.target.value)}>
              {students.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.last_name} {s.first_names} ({s.matricule})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              required
              label="Responsable légal concerné"
              value={form.guardianId}
              onChange={(e) => setForm({ ...form, guardianId: e.target.value })}
              disabled={form.studentId === '' || guardians.length === 0}
              helperText={form.studentId !== '' && guardians.length === 0 ? 'Aucun responsable associé à cet élève.' : undefined}
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
              <TextField select fullWidth label="Sens" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                {Object.entries(DIRECTION_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select fullWidth label="Canal" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select fullWidth label="Motif" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
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
          <Button variant="contained" disabled={saving || form.studentId === '' || form.guardianId === '' || form.occurredAt === ''} onClick={submit}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
