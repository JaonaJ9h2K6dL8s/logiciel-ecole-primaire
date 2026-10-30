'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
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
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import FormDialog from '@/components/admin/FormDialog';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

interface GradingPeriod {
  id: number;
  schoolYearId: number;
  name: string;
  startDate: string;
  endDate: string;
  displayOrder: number;
  isLocked: boolean;
}

const EMPTY_FORM = { name: '', startDate: '', endDate: '', displayOrder: '' };

export default function GradingPeriodsPage() {
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('periods.manage') ?? false;

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [yearId, setYearId] = useState<number | ''>('');
  const [periods, setPeriods] = useState<GradingPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GradingPeriod | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [lockTarget, setLockTarget] = useState<GradingPeriod | null>(null);
  const [lockBusy, setLockBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Options de formulaire dans le périmètre du rôle (années).
        const res = await api.get<{ data: { years: SchoolYear[] } }>('/grading-periods/form-options');
        const list = res.data.years;
        setYears(list);
        const active = list.find((y) => y.isActive);
        setYearId(active ? active.id : list.length > 0 ? list[0].id : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des années scolaires.');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (yearId === '') {
      setPeriods(null);
      return;
    }
    try {
      const res = await api.get<{ data: GradingPeriod[] }>(`/grading-periods?schoolYearId=${yearId}`);
      setPeriods(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      setPeriods([]);
    }
  }, [yearId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (p: GradingPeriod) => {
    setEditing(p);
    setForm({ name: p.name, startDate: p.startDate, endDate: p.endDate, displayOrder: String(p.displayOrder) });
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2 || !form.startDate || !form.endDate || !form.displayOrder) {
      setFormError('Nom, dates de début et de fin et ordre d’affichage sont requis.');
      return;
    }
    if (form.endDate < form.startDate) {
      setFormError('La date de fin doit suivre la date de début.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        displayOrder: Number(form.displayOrder),
      };
      if (editing) {
        await api.patch(`/grading-periods/${editing.id}`, body);
        setSnack('Période mise à jour.');
      } else {
        await api.post('/grading-periods', { ...body, schoolYearId: yearId });
        setSnack('Période créée.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async () => {
    if (!lockTarget) return;
    setLockBusy(true);
    try {
      await api.post(`/grading-periods/${lockTarget.id}/${lockTarget.isLocked ? 'unlock' : 'lock'}`, {});
      setSnack(lockTarget.isLocked ? 'Période déverrouillée.' : 'Période verrouillée : les saisies y sont interdites.');
      setLockTarget(null);
      load();
    } catch (err) {
      setSnack(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setLockBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Périodes d'évaluation"
        subtitle="Découpage configurable de l'année : trimestres, semestres ou autre"
        action={
          canManage && yearId !== '' ? (
            <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openCreate}>
              Nouvelle période
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2 }}>
        <TextField
          select
          size="small"
          label="Année scolaire"
          value={yearId}
          onChange={(e) => setYearId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ minWidth: 260 }}
        >
          {years.map((y) => (
            <MenuItem key={y.id} value={y.id}>
              {y.label}
              {y.isActive ? ' (active)' : ''}
            </MenuItem>
          ))}
        </TextField>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ordre</TableCell>
                <TableCell>Nom</TableCell>
                <TableCell>Début</TableCell>
                <TableCell>Fin</TableCell>
                <TableCell>État</TableCell>
                {canManage && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {(periods ?? []).map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.displayOrder}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {p.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{p.startDate}</TableCell>
                  <TableCell>{p.endDate}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      icon={p.isLocked ? <LockOutlinedIcon /> : undefined}
                      label={p.isLocked ? 'Verrouillée' : 'Ouverte'}
                      color={p.isLocked ? 'default' : 'success'}
                      variant="outlined"
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<EditOutlinedIcon />}
                        disabled={p.isLocked}
                        onClick={() => openEdit(p)}
                      >
                        Modifier
                      </Button>
                      <Button
                        size="small"
                        color={p.isLocked ? 'success' : 'warning'}
                        startIcon={p.isLocked ? <LockOpenOutlinedIcon /> : <LockOutlinedIcon />}
                        onClick={() => setLockTarget(p)}
                      >
                        {p.isLocked ? 'Déverrouiller' : 'Verrouiller'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {periods !== null && periods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5}>
                    <EmptyState message="Aucune période définie pour cette année scolaire." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <FormDialog
        open={dialogOpen}
        title={editing ? 'Modifier la période' : 'Nouvelle période'}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSubmit={save}
        submitLabel={editing ? 'Enregistrer' : 'Créer'}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nom de la période"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            helperText="Ex. : Trimestre 1, Semestre 2 — entièrement configurable"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Début"
              type="date"
              required
              fullWidth
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Fin"
              type="date"
              required
              fullWidth
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <TextField
            label="Ordre d'affichage"
            type="number"
            required
            inputProps={{ min: 1, max: 99, step: 1 }}
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
          />
          {formError && <Alert severity="error">{formError}</Alert>}
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={lockTarget !== null}
        title={lockTarget?.isLocked ? 'Déverrouiller la période' : 'Verrouiller la période'}
        message={
          lockTarget?.isLocked
            ? `Déverrouiller « ${lockTarget.name} » réautorisera les saisies sur cette période.`
            : `Verrouiller « ${lockTarget?.name ?? ''} » interdira toute nouvelle saisie ou modification de notes, sans supprimer les résultats existants.`
        }
        confirmLabel={lockTarget?.isLocked ? 'Déverrouiller' : 'Verrouiller'}
        confirmColor="warning"
        loading={lockBusy}
        onConfirm={toggleLock}
        onClose={() => setLockTarget(null)}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
