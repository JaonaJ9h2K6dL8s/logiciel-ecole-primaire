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
  Tab,
  Tabs,
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
import EmptyState from '@/components/admin/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { STATUS_LABELS, SUBJECT_LABELS, STATUS_COLORS } from '@/components/contacts/StudentContactsSection';

// Suivis à effectuer : actions issues des communications avec les parents.

type Bucket = 'overdue' | 'today' | 'upcoming' | 'resolved';

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'En retard' },
  { key: 'today', label: "Aujourd'hui" },
  { key: 'upcoming', label: 'À venir' },
  { key: 'resolved', label: 'Résolus' },
];

interface FollowupRow {
  id: number;
  studentId: number;
  guardianId: number;
  occurredAt: string;
  subject: string;
  actionDecided: string | null;
  followupDueDate: string | null;
  followupStatus: string;
  student_last_name: string;
  student_first_names: string;
  guardian_last_name: string;
  guardian_first_names: string;
}

const STATUS_OPTIONS = ['todo', 'ongoing', 'resolved', 'cancelled'] as const;

export default function FollowupsPage() {
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('parent_contacts.manage') ?? false;

  const [bucket, setBucket] = useState<Bucket>('overdue');
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<FollowupRow | null>(null);
  const [editStatus, setEditStatus] = useState<string>('todo');
  const [editDue, setEditDue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: FollowupRow[]; pagination: { total: number } }>(
        `/parent-contacts/followups?bucket=${bucket}&page=${page}&pageSize=${pageSize}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [bucket, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (row: FollowupRow) => {
    setEditTarget(row);
    setEditStatus(row.followupStatus);
    setEditDue(row.followupDueDate ?? '');
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.patch(`/parent-contacts/${editTarget.id}`, {
        followupStatus: editStatus,
        followupDueDate: editDue === '' ? null : editDue,
      });
      setEditTarget(null);
      setSnack('Suivi mis à jour.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (v: string) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

  return (
    <Box>
      <PageHeader title="Suivis à effectuer" subtitle="Actions décidées lors des communications avec les parents" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={bucket} onChange={(_, v: Bucket) => { setBucket(v); setPage(1); }}>
            {BUCKETS.map((b) => (
              <Tab key={b.key} value={b.key} label={b.label} />
            ))}
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ p: 4 }}>
            <Typography>Chargement…</Typography>
          </Box>
        ) : rows.length === 0 ? (
          <EmptyState message="Aucun suivi dans cette catégorie. Les actions décidées lors des contacts avec les parents apparaîtront ici selon leur échéance." />
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Élève</TableCell>
                    <TableCell>Responsable</TableCell>
                    <TableCell>Date du contact</TableCell>
                    <TableCell>Motif</TableCell>
                    <TableCell>Action décidée</TableCell>
                    <TableCell>Échéance</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Link href={`/students/${row.studentId}`} style={{ color: 'inherit', fontWeight: 600 }}>
                          {row.student_last_name} {row.student_first_names}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {row.guardian_last_name} {row.guardian_first_names}
                      </TableCell>
                      <TableCell>{fmtDate(row.occurredAt)}</TableCell>
                      <TableCell>{SUBJECT_LABELS[row.subject] ?? row.subject}</TableCell>
                      <TableCell sx={{ maxWidth: 320 }}>{row.actionDecided ?? '—'}</TableCell>
                      <TableCell>{fmtDate(row.followupDueDate ?? '')}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_LABELS[row.followupStatus] ?? row.followupStatus}
                          color={STATUS_COLORS[row.followupStatus] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {canManage && (
                          <Button size="small" onClick={() => openEdit(row)}>
                            Mettre à jour
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {total} suivi(s)
              </Typography>
              <Pagination
                count={Math.max(1, Math.ceil(total / pageSize))}
                page={page}
                onChange={(_, p) => setPage(p)}
                color="primary"
              />
            </Stack>
          </>
        )}
      </Card>

      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Mettre à jour le suivi</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Statut"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              fullWidth
            >
              {STATUS_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Date de suivi prévue"
              type="date"
              value={editDue}
              onChange={(e) => setEditDue(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Annuler</Button>
          <Button variant="contained" onClick={submitEdit} disabled={saving}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
