'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Paper,
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
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import FormDialog from '@/components/admin/FormDialog';

interface Subject {
  id: number;
  code: string;
  name: string;
  description: string | null;
  defaultCoefficient: string | null;
  isActive: boolean;
}

interface ClassRow {
  id: number;
  name: string;
  levelName: string;
}

interface ClassSubject {
  id: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherId: number | null;
  teacherName: string | null;
  coefficient: string | null;
  effectiveCoefficient: string | null;
  isActive: boolean;
}

interface TeacherOption {
  id: number;
  fullName: string;
}

const EMPTY_SUBJECT = { code: '', name: '', description: '', defaultCoefficient: '' };

export default function SubjectsPage() {
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('subjects.manage') ?? false;
  const [tab, setTab] = useState(0);

  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState(EMPTY_SUBJECT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [classId, setClassId] = useState<number | ''>('');
  const [classSubjects, setClassSubjects] = useState<ClassSubject[] | null>(null);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignEditing, setAssignEditing] = useState<ClassSubject | null>(null);
  const [assignForm, setAssignForm] = useState({ subjectId: '', teacherId: '', coefficient: '' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ data: Subject[] }>('/subjects?all=1');
      setSubjects(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadClasses = useCallback(async () => {
    try {
      const res = await api.get<{ data: ClassRow[] }>('/academics/classes');
      setClasses(res.data);
    } catch {
      setClasses([]);
    }
  }, []);

  const loadTeachers = useCallback(async () => {
    try {
      const res = await api.get<{ data: TeacherOption[] }>('/users?role=teacher&pageSize=100');
      setTeachers(res.data);
    } catch {
      setTeachers([]);
    }
  }, []);

  useEffect(() => {
    if (canManage) {
      loadClasses();
      loadTeachers();
    }
  }, [canManage, loadClasses, loadTeachers]);

  const loadClassSubjects = useCallback(async () => {
    if (classId === '') {
      setClassSubjects(null);
      return;
    }
    try {
      const res = await api.get<{ data: ClassSubject[] }>(`/subjects/class-assignments?classId=${classId}`);
      setClassSubjects(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
      setClassSubjects([]);
    }
  }, [classId]);

  useEffect(() => {
    loadClassSubjects();
  }, [loadClassSubjects]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_SUBJECT);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      description: s.description ?? '',
      defaultCoefficient: s.defaultCoefficient ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const saveSubject = async () => {
    if (form.code.trim().length < 2 || form.name.trim().length < 2) {
      setFormError('Code (2+ caractères) et nom (2+ caractères) requis.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        defaultCoefficient: form.defaultCoefficient === '' ? null : Number(form.defaultCoefficient),
      };
      if (editing) {
        await api.patch(`/subjects/${editing.id}`, {
          name: body.name,
          description: body.description,
          defaultCoefficient: body.defaultCoefficient,
        });
        setSnack('Matière mise à jour.');
      } else {
        await api.post('/subjects', body);
        setSnack('Matière créée.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Subject) => {
    try {
      await api.patch(`/subjects/${s.id}`, { isActive: !s.isActive });
      setSnack(s.isActive ? 'Matière désactivée.' : 'Matière réactivée.');
      load();
    } catch (err) {
      setSnack(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const openAssignCreate = () => {
    setAssignEditing(null);
    setAssignForm({ subjectId: '', teacherId: '', coefficient: '' });
    setAssignDialogOpen(true);
  };

  const openAssignEdit = (cs: ClassSubject) => {
    setAssignEditing(cs);
    setAssignForm({
      subjectId: String(cs.subjectId),
      teacherId: cs.teacherId ? String(cs.teacherId) : '',
      coefficient: cs.coefficient ?? '',
    });
    setAssignDialogOpen(true);
  };

  const saveAssign = async () => {
    if (!assignForm.subjectId) {
      setFormError('Matière requise.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        subjectId: Number(assignForm.subjectId),
        teacherId: assignForm.teacherId === '' ? null : Number(assignForm.teacherId),
        coefficient: assignForm.coefficient === '' ? null : Number(assignForm.coefficient),
      };
      if (assignEditing) {
        await api.patch(`/subjects/class-assignments/${assignEditing.id}`, body);
        setSnack('Rattachement mis à jour.');
      } else {
        await api.post('/subjects/class-assignments', { classId, ...body });
        setSnack('Matière rattachée à la classe.');
      }
      setAssignDialogOpen(false);
      loadClassSubjects();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Matières"
        subtitle="Catalogue de l'établissement et affectation aux classes"
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openCreate}>
              Nouvelle matière
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 2, pt: 1 }}>
          <Tab label="Catalogue" />
          {canManage && <Tab label="Matières par classe" />}
        </Tabs>
      </Card>

      {tab === 0 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell>
                  <TableCell>Nom</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Coef. par défaut</TableCell>
                  <TableCell>État</TableCell>
                  {canManage && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {(subjects ?? []).map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {s.code}
                      </Typography>
                    </TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {s.description ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{s.defaultCoefficient ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={s.isActive ? 'Active' : 'Inactive'}
                        color={s.isActive ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(s)}>
                          Modifier
                        </Button>
                        <Button size="small" color={s.isActive ? 'warning' : 'success'} onClick={() => toggleActive(s)}>
                          {s.isActive ? 'Désactiver' : 'Réactiver'}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {subjects !== null && subjects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 6 : 5}>
                      <EmptyState message="Aucune matière enregistrée." />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {tab === 1 && canManage && (
        <Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end" sx={{ p: 2 }}>
            <TextField
              select
              size="small"
              label="Classe"
              value={classId}
              onChange={(e) => setClassId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ minWidth: 220 }}
            >
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.levelName})
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddOutlinedIcon />}
              disabled={classId === ''}
              onClick={openAssignCreate}
            >
              Rattacher une matière
            </Button>
          </Stack>

          <TableContainer component={Paper} variant="outlined" sx={{ m: 2, width: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Matière</TableCell>
                  <TableCell>Professeur désigné</TableCell>
                  <TableCell>Coef. effectif</TableCell>
                  <TableCell>État</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(classSubjects ?? []).map((cs) => (
                  <TableRow key={cs.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {cs.subjectName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cs.subjectCode}
                      </Typography>
                    </TableCell>
                    <TableCell>{cs.teacherName ?? 'Tous les professeurs affectés à la classe'}</TableCell>
                    <TableCell>{cs.effectiveCoefficient ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={cs.isActive ? 'Active' : 'Détachée'}
                        color={cs.isActive ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => openAssignEdit(cs)}>
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {classSubjects !== null && classSubjects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState message="Aucune matière rattachée à cette classe." />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <FormDialog
        open={dialogOpen}
        title={editing ? 'Modifier la matière' : 'Nouvelle matière'}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSubmit={saveSubject}
        submitLabel={editing ? 'Enregistrer' : 'Créer'}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Code"
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            disabled={Boolean(editing)}
            helperText={editing ? 'Le code est immuable.' : 'Ex. : MATH, FRANCAIS, MALAGASY'}
          />
          <TextField
            label="Nom"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <TextField
            label="Coefficient par défaut"
            type="number"
            inputProps={{ min: 0.1, max: 99.99, step: 0.1 }}
            value={form.defaultCoefficient}
            onChange={(e) => setForm({ ...form, defaultCoefficient: e.target.value })}
            helperText="Facultatif — laisser vide si l'établissement ne pondère pas par matière."
          />
          {formError && <Alert severity="error">{formError}</Alert>}
        </Stack>
      </FormDialog>

      <FormDialog
        open={assignDialogOpen}
        title={assignEditing ? 'Modifier le rattachement' : 'Rattacher une matière à la classe'}
        saving={saving}
        onClose={() => setAssignDialogOpen(false)}
        onSubmit={saveAssign}
        submitLabel="Enregistrer"
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            required
            label="Matière"
            value={assignForm.subjectId}
            onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value })}
            disabled={Boolean(assignEditing)}
          >
            {(subjects ?? [])
              .filter((s) => s.isActive)
              .map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </MenuItem>
              ))}
          </TextField>
          <TextField
            select
            label="Professeur désigné"
            value={assignForm.teacherId}
            onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}
            helperText="Facultatif — sinon, tout professeur affecté à la classe peut y enseigner la matière."
          >
            <MenuItem value="">Aucun professeur désigné</MenuItem>
            {teachers.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.fullName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Coefficient dans cette classe"
            type="number"
            inputProps={{ min: 0.1, max: 99.99, step: 0.1 }}
            value={assignForm.coefficient}
            onChange={(e) => setAssignForm({ ...assignForm, coefficient: e.target.value })}
            helperText="Facultatif — sinon le coefficient par défaut de la matière s'applique."
          />
          {formError && <Alert severity="error">{formError}</Alert>}
        </Stack>
      </FormDialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
