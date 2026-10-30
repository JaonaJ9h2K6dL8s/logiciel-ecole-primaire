'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import FormDialog from '@/components/admin/FormDialog';
import EmptyState from '@/components/admin/EmptyState';
import { useAuthStore } from '@/stores/authStore';

interface LevelRow {
  id: number;
  name: string;
  orderIndex: number;
  isActive: boolean;
}

interface ClassRow {
  id: number;
  name: string;
  levelId: number;
  levelName: string;
  schoolYearId: number;
  schoolYearLabel: string;
  capacity: number | null;
  isActive: boolean;
}

interface YearRow {
  id: number;
  label: string;
  isActive: boolean;
}

export default function ClassesPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('academics.manage'));

  const [levels, setLevels] = useState<LevelRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [activeYear, setActiveYear] = useState<YearRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Niveaux
  const [levelDialog, setLevelDialog] = useState<'create' | { level: LevelRow } | null>(null);
  const [levelForm, setLevelForm] = useState({ name: '', orderIndex: 0 });

  // Classes
  const [classDialog, setClassDialog] = useState<'create' | { cls: ClassRow } | null>(null);
  const [classForm, setClassForm] = useState({ name: '', levelId: '', capacity: '' });

  const [deleteClass, setDeleteClass] = useState<ClassRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [lv, cl, yr] = await Promise.all([
        api.get<{ data: LevelRow[] }>('/academics/levels'),
        api.get<{ data: ClassRow[] }>('/academics/classes'),
        api.get<{ data: YearRow[] }>('/school-years'),
      ]);
      setLevels(lv.data);
      setClasses(cl.data);
      setActiveYear(yr.data.find((y) => y.isActive) ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openLevelCreate = () => {
    setLevelForm({ name: '', orderIndex: (levels?.length ?? 0) + 1 });
    setLevelDialog('create');
  };

  const handleLevelSubmit = async () => {
    if (levelForm.name.trim().length < 1) return;
    setSaving(true);
    try {
      if (levelDialog === 'create') {
        await api.post('/academics/levels', { name: levelForm.name.trim(), orderIndex: Number(levelForm.orderIndex) });
        setSnack('Niveau créé.');
      } else if (levelDialog && typeof levelDialog === 'object') {
        await api.patch(`/academics/levels/${levelDialog.level.id}`, {
          name: levelForm.name.trim(),
          orderIndex: Number(levelForm.orderIndex),
        });
        setSnack('Niveau modifié.');
      }
      setLevelDialog(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const openClassCreate = () => {
    setClassForm({ name: '', levelId: levels?.[0]?.id ? String(levels[0].id) : '', capacity: '' });
    setClassDialog('create');
  };

  const handleClassSubmit = async () => {
    if (!classForm.name.trim() || !classForm.levelId) return;
    setSaving(true);
    try {
      if (classDialog === 'create') {
        if (!activeYear) {
          setError('Aucune année scolaire active : créez et activez une année avant de créer des classes.');
          setClassDialog(null);
          return;
        }
        await api.post('/academics/classes', {
          name: classForm.name.trim(),
          levelId: Number(classForm.levelId),
          schoolYearId: activeYear.id,
          capacity: classForm.capacity === '' ? null : Number(classForm.capacity),
        });
        setSnack('Classe créée.');
      } else if (classDialog && typeof classDialog === 'object') {
        await api.patch(`/academics/classes/${classDialog.cls.id}`, {
          name: classForm.name.trim(),
          capacity: classForm.capacity === '' ? null : Number(classForm.capacity),
        });
        setSnack('Classe modifiée.');
      }
      setClassDialog(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!deleteClass) return;
    setSaving(true);
    try {
      await api.delete(`/academics/classes/${deleteClass.id}`);
      setSnack('Classe supprimée.');
      setDeleteClass(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
      setDeleteClass(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleClassActive = async (c: ClassRow) => {
    try {
      await api.patch(`/academics/classes/${c.id}`, { isActive: !c.isActive });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  return (
    <div>
      <PageHeader title="Niveaux & classes" subtitle="Configuration des niveaux du primaire et des classes" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!activeYear && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Aucune année scolaire active. Activez une année dans « Années scolaires » pour pouvoir créer des classes.
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Niveaux */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight={800}>
                Niveaux
              </Typography>
              {canManage && (
                <Button size="small" startIcon={<AddIcon />} onClick={openLevelCreate}>
                  Ajouter
                </Button>
              )}
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Libellé</TableCell>
                    <TableCell>Ordre</TableCell>
                    <TableCell>Statut</TableCell>
                    {canManage && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(levels ?? []).map((l) => (
                    <TableRow key={l.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {l.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{l.orderIndex}</TableCell>
                      <TableCell>
                        <Chip label={l.isActive ? 'Actif' : 'Inactif'} size="small" color={l.isActive ? 'success' : 'default'} />
                      </TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Tooltip title="Modifier">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setLevelForm({ name: l.name, orderIndex: l.orderIndex });
                                setLevelDialog({ level: l });
                              }}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {levels !== null && levels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <EmptyState message="Aucun niveau configuré (ex. CP, CE1, CE2, CM1, CM2)." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>

        {/* Classes */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight={800}>
                Classes {activeYear ? `— ${activeYear.label}` : ''}
              </Typography>
              {canManage && (
                <Button size="small" startIcon={<AddIcon />} onClick={openClassCreate} disabled={!activeYear}>
                  Ajouter
                </Button>
              )}
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nom</TableCell>
                    <TableCell>Niveau</TableCell>
                    <TableCell>Capacité</TableCell>
                    <TableCell>Statut</TableCell>
                    {canManage && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(classes ?? []).map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {c.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.schoolYearLabel}
                        </Typography>
                      </TableCell>
                      <TableCell>{c.levelName}</TableCell>
                      <TableCell>{c.capacity ?? '—'}</TableCell>
                      <TableCell>
                        <Chip label={c.isActive ? 'Active' : 'Désactivée'} size="small" color={c.isActive ? 'success' : 'default'} />
                      </TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Modifier">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setClassForm({ name: c.name, levelId: String(c.levelId), capacity: c.capacity === null ? '' : String(c.capacity) });
                                  setClassDialog({ cls: c });
                                }}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={c.isActive ? 'Désactiver' : 'Activer'}>
                              <IconButton size="small" onClick={() => toggleClassActive(c)}>
                                <Chip label={c.isActive ? 'Off' : 'On'} size="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer (refusé si données historiques)">
                              <IconButton size="small" onClick={() => setDeleteClass(c)}>
                                <DeleteOutlineIcon fontSize="small" color="error" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {classes !== null && classes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState message="Aucune classe enregistrée pour le moment." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Dialogue niveau */}
      <FormDialog
        open={levelDialog !== null}
        title={levelDialog === 'create' ? 'Nouveau niveau' : `Modifier — ${levelDialog && typeof levelDialog === 'object' ? levelDialog.level.name : ''}`}
        saving={saving}
        onClose={() => setLevelDialog(null)}
        onSubmit={handleLevelSubmit}
        submitLabel="Enregistrer"
      >
        <Stack spacing={2}>
          <TextField
            label="Libellé du niveau"
            placeholder="Ex. CP, CE1…"
            value={levelForm.name}
            onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
            helperText="Le libellé est librement adaptable aux pratiques de l’établissement."
          />
          <TextField
            label="Ordre d’affichage"
            type="number"
            value={levelForm.orderIndex}
            onChange={(e) => setLevelForm({ ...levelForm, orderIndex: Number(e.target.value) })}
          />
        </Stack>
      </FormDialog>

      {/* Dialogue classe */}
      <FormDialog
        open={classDialog !== null}
        title={classDialog === 'create' ? 'Nouvelle classe' : `Modifier — ${classDialog && typeof classDialog === 'object' ? classDialog.cls.name : ''}`}
        saving={saving}
        onClose={() => setClassDialog(null)}
        onSubmit={handleClassSubmit}
        submitLabel="Enregistrer"
      >
        <Stack spacing={2}>
          <TextField
            label="Nom de la classe"
            placeholder="Ex. CP-A"
            value={classForm.name}
            onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
          />
          <TextField
            select
            label="Niveau"
            value={classForm.levelId}
            onChange={(e) => setClassForm({ ...classForm, levelId: e.target.value })}
            disabled={classDialog !== 'create'}
          >
            {(levels ?? []).filter((l) => l.isActive).map((l) => (
              <MenuItem key={l.id} value={String(l.id)}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>
          {classDialog === 'create' && (
            <TextField
              label="Année scolaire"
              value={activeYear ? activeYear.label : ''}
              disabled
              helperText="Les classes se créent dans l’année scolaire active."
            />
          )}
          <TextField
            label="Capacité indicative (facultatif)"
            type="number"
            value={classForm.capacity}
            onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleteClass)}
        title={`Supprimer la classe ${deleteClass?.name ?? ''} ?`}
        message="Cette action est refusée si la classe possède des données historiques (inscriptions, résultats)."
        confirmLabel="Supprimer"
        confirmColor="error"
        loading={saving}
        onConfirm={handleDeleteClass}
        onClose={() => setDeleteClass(null)}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </div>
  );
}
