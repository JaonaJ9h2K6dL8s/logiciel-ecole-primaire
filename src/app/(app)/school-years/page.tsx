'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Chip,
  IconButton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import FormDialog from '@/components/admin/FormDialog';
import EmptyState from '@/components/admin/EmptyState';

interface YearRow {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

export default function SchoolYearsPage() {
  const [rows, setRows] = useState<YearRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ label: '', startDate: '', endDate: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [activateYear, setActivateYear] = useState<YearRow | null>(null);
  const [deleteYear, setDeleteYear] = useState<YearRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: YearRow[] }>('/school-years');
      setRows(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const errors: Record<string, string> = {};
    if (!/^\d{4}[-/]\d{4}$/.test(form.label.trim())) errors.label = 'Format attendu : 2025-2026.';
    if (!form.startDate) errors.startDate = 'Date de début requise.';
    if (!form.endDate) errors.endDate = 'Date de fin requise.';
    if (form.startDate && form.endDate && form.endDate <= form.startDate) {
      errors.endDate = 'Doit être postérieure à la date de début.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await api.post('/school-years', form);
      setCreateOpen(false);
      setForm({ label: '', startDate: '', endDate: '' });
      setSnack('Année scolaire créée.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!activateYear) return;
    setSaving(true);
    try {
      await api.post(`/school-years/${activateYear.id}/activate`);
      setSnack(`Année ${activateYear.label} activée. Une seule année est active à la fois.`);
      setActivateYear(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
      setActivateYear(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteYear) return;
    setSaving(true);
    try {
      await api.delete(`/school-years/${deleteYear.id}`);
      setSnack('Année scolaire supprimée.');
      setDeleteYear(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erreur lors de la suppression.');
      }
      setDeleteYear(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Années scolaires"
        subtitle="Une seule année scolaire active à la fois"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Nouvelle année
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Libellé</TableCell>
                <TableCell>Début</TableCell>
                <TableCell>Fin</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((y) => (
                <TableRow key={y.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={700}>{y.label}</Typography>
                      {y.isActive && <Chip label="Active" size="small" color="success" />}
                    </Stack>
                  </TableCell>
                  <TableCell>{new Date(y.startDate).toLocaleDateString('fr-MG')}</TableCell>
                  <TableCell>{new Date(y.endDate).toLocaleDateString('fr-MG')}</TableCell>
                  <TableCell>
                    {y.isActive ? 'En cours' : 'Archivée'}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {!y.isActive && (
                        <Tooltip title="Activer cette année">
                          <IconButton size="small" onClick={() => setActivateYear(y)}>
                            <PlayCircleOutlineIcon fontSize="small" color="primary" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!y.isActive && (
                        <Tooltip title="Supprimer (uniquement si aucune donnée historique)">
                          <IconButton size="small" onClick={() => setDeleteYear(y)}>
                            <DeleteOutlineIcon fontSize="small" color="error" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState message="Aucune année scolaire enregistrée." actionLabel="Créer la première année" onAction={() => setCreateOpen(true)} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <FormDialog
        open={createOpen}
        title="Nouvelle année scolaire"
        saving={saving}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitLabel="Créer"
      >
        <Stack spacing={2}>
          <TextField
            label="Libellé"
            placeholder="2025-2026"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            error={Boolean(formErrors.label)}
            helperText={formErrors.label}
          />
          <TextField
            label="Date de début"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            error={Boolean(formErrors.startDate)}
            helperText={formErrors.startDate}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Date de fin"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            error={Boolean(formErrors.endDate)}
            helperText={formErrors.endDate}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(activateYear)}
        title={`Activer l’année ${activateYear?.label ?? ''} ?`}
        message="L’année actuellement active sera désactivée. Aucune donnée des années précédentes n’est modifiée."
        confirmLabel="Activer"
        loading={saving}
        onConfirm={handleActivate}
        onClose={() => setActivateYear(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteYear)}
        title={`Supprimer l’année ${deleteYear?.label ?? ''} ?`}
        message="Cette action est définitive. Elle est refusée si des données historiques y sont rattachées."
        confirmLabel="Supprimer"
        confirmColor="error"
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteYear(null)}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </div>
  );
}
