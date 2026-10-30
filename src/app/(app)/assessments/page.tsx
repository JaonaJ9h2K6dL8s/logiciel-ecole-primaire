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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import FormDialog from '@/components/admin/FormDialog';
import { useRouter } from 'next/navigation';

interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  schoolYearId: number;
}

interface GradingPeriod {
  id: number;
  schoolYearId: number;
  name: string;
}

interface AssessmentRow {
  id: number;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  schoolYearId: number;
  schoolYearLabel: string;
  gradingPeriodId: number;
  periodName: string;
  title: string;
  assessmentType: 'homework' | 'quiz' | 'exam' | 'other' | 'composition' | 'ds';
  assessmentDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  maxScore: string;
  coefficient: string;
  teacherId: number;
  teacherName: string;
  status: 'draft' | 'submitted' | 'locked';
  gradedCount: number;
  pendingCount: number;
}

const TYPE_LABELS: Record<AssessmentRow['assessmentType'], string> = {
  homework: 'Devoir',
  quiz: 'Interrogation',
  exam: 'Examen',
  other: 'Autre',
  composition: 'Composition',
  ds: 'Devoir surveillé',
};

const STATUS_LABELS: Record<AssessmentRow['status'], { label: string; color: 'default' | 'info' | 'success' }> = {
  draft: { label: 'Brouillon', color: 'info' },
  submitted: { label: 'Soumise', color: 'success' },
  locked: { label: 'Verrouillée', color: 'default' },
};

const EMPTY_FORM = {
  classId: '',
  subjectId: '',
  gradingPeriodId: '',
  title: '',
  assessmentType: 'homework',
  assessmentDate: '',
  startTime: '',
  durationMinutes: '',
  maxScore: '20',
  coefficient: '1',
  description: '',
};

export default function AssessmentsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('assessments.manage') ?? false;

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [filters, setFilters] = useState({
    schoolYearId: '',
    classId: '',
    subjectId: '',
    gradingPeriodId: '',
    status: '',
  });
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssessmentRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formSubjects, setFormSubjects] = useState<{ id: number; name: string; code: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Options de formulaire dans le périmètre du rôle (années + classes).
        const res = await api.get<{ data: { years: SchoolYear[] } }>('/grading-periods/form-options');
        setYears(res.data.years);
        const active = res.data.years.find((y) => y.isActive);
        if (active) setFilters((f) => ({ ...f, schoolYearId: String(active.id) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des années.');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const qs = filters.schoolYearId ? `?schoolYearId=${filters.schoolYearId}` : '';
        const res = await api.get<{ data: { classes: ClassRow[] } }>(`/grading-periods/form-options${qs}`);
        setClasses(res.data.classes);
      } catch {
        setClasses([]);
      }
    })();
  }, [filters.schoolYearId]);

  useEffect(() => {
    (async () => {
      if (!filters.schoolYearId) {
        setPeriods([]);
        return;
      }
      try {
        const res = await api.get<{ data: GradingPeriod[] }>(
          `/grading-periods?schoolYearId=${filters.schoolYearId}`
        );
        setPeriods(res.data);
      } catch {
        setPeriods([]);
      }
    })();
  }, [filters.schoolYearId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('pageSize', String(pageSize));
      if (filters.schoolYearId) params.set('schoolYearId', filters.schoolYearId);
      if (filters.classId) params.set('classId', filters.classId);
      if (filters.subjectId) params.set('subjectId', filters.subjectId);
      if (filters.gradingPeriodId) params.set('gradingPeriodId', filters.gradingPeriodId);
      if (filters.status) params.set('status', filters.status);
      const res = await api.get<{ data: AssessmentRow[]; pagination: { total: number } }>(
        `/assessments?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  // Sujets disponibles pour la classe choisie dans le formulaire
  const loadFormSubjects = useCallback(async (classId: string) => {
    if (!classId) {
      setFormSubjects([]);
      return;
    }
    try {
      const res = await api.get<
        { data: { subjectId: number; subjectName: string; subjectCode: string; isActive: boolean }[] }
      >(`/subjects/class-assignments?classId=${classId}`);
      setFormSubjects(
        res.data.filter((cs) => cs.isActive).map((cs) => ({ id: cs.subjectId, name: cs.subjectName, code: cs.subjectCode }))
      );
    } catch {
      setFormSubjects([]);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormSubjects([]);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (a: AssessmentRow) => {
    setEditing(a);
    setForm({
      classId: String(a.classId),
      subjectId: String(a.subjectId),
      gradingPeriodId: String(a.gradingPeriodId),
      title: a.title,
      assessmentType: a.assessmentType,
      assessmentDate: a.assessmentDate,
      startTime: a.startTime ?? '',
      durationMinutes: a.durationMinutes !== null ? String(a.durationMinutes) : '',
      maxScore: String(a.maxScore),
      coefficient: String(a.coefficient),
      description: '',
    });
    setFormSubjects([{ id: a.subjectId, name: a.subjectName, code: '' }]);
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.classId || !form.subjectId || !form.gradingPeriodId || form.title.trim().length < 2 || !form.assessmentDate) {
      setFormError('Classe, matière, période, titre (2+ caractères) et date sont requis.');
      return;
    }
    const max = Number(form.maxScore);
    const coef = Number(form.coefficient);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(coef) || coef <= 0) {
      setFormError('Barème et coefficient doivent être des nombres positifs.');
      return;
    }
    if ((form.startTime && !form.durationMinutes) || (form.durationMinutes && !form.startTime)) {
      setFormError('Le créneau nécessite l’heure de début ET la durée (ou aucun des deux).');
      return;
    }
    const duration = form.durationMinutes ? Number(form.durationMinutes) : null;
    if (duration !== null && (!Number.isInteger(duration) || duration <= 0 || duration > 480)) {
      setFormError('Durée invalide (entier entre 1 et 480 minutes).');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title: form.title.trim(),
        assessmentType: form.assessmentType,
        assessmentDate: form.assessmentDate,
        startTime: form.startTime || null,
        durationMinutes: duration,
        maxScore: max,
        coefficient: coef,
        description: form.description.trim(),
      };
      if (editing) {
        const res = await api.patch<{ data?: { warnings?: string[] } }>(`/assessments/${editing.id}`, body);
        const warnings = res.data?.warnings ?? [];
        setSnack(warnings.length > 0 ? `Évaluation mise à jour. Attention : ${warnings.join(' ')}` : 'Évaluation mise à jour.');
      } else {
        const res = await api.post<{ data?: { warnings?: string[] } }>('/assessments', {
          ...body,
          classId: Number(form.classId),
          subjectId: Number(form.subjectId),
          gradingPeriodId: Number(form.gradingPeriodId),
        });
        const warnings = res.data?.warnings ?? [];
        setSnack(
          warnings.length > 0
            ? `Évaluation créée (brouillon). Attention : ${warnings.join(' ')}`
            : 'Évaluation créée (brouillon).'
        );
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const isLastPageFull = rows !== null && rows.length === pageSize;

  return (
    <Box>
      <PageHeader
        title="Évaluations"
        subtitle="Devoirs, interrogations et examens par classe, matière et période"
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openCreate}>
              Nouvelle évaluation
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
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Année scolaire"
            value={filters.schoolYearId}
            onChange={(e) => {
              setPage(0);
              setFilters({ ...filters, schoolYearId: e.target.value, classId: '', gradingPeriodId: '' });
            }}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">Toutes</MenuItem>
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Classe"
            value={filters.classId}
            onChange={(e) => {
              setPage(0);
              setFilters({ ...filters, classId: e.target.value });
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Toutes</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Période"
            value={filters.gradingPeriodId}
            onChange={(e) => {
              setPage(0);
              setFilters({ ...filters, gradingPeriodId: e.target.value });
            }}
            sx={{ minWidth: 150 }}
            disabled={!filters.schoolYearId}
          >
            <MenuItem value="">Toutes</MenuItem>
            {periods.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Statut"
            value={filters.status}
            onChange={(e) => {
              setPage(0);
              setFilters({ ...filters, status: e.target.value });
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="draft">Brouillon</MenuItem>
            <MenuItem value="submitted">Soumise</MenuItem>
            <MenuItem value="locked">Verrouillée</MenuItem>
          </TextField>
        </Stack>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Titre</TableCell>
                <TableCell>Classe</TableCell>
                <TableCell>Matière</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Période</TableCell>
                <TableCell>Barème</TableCell>
                <TableCell>Coef.</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell>État</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>
                    {a.assessmentDate}
                    {a.startTime && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {a.startTime}
                        {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {a.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.teacherName}
                    </Typography>
                  </TableCell>
                  <TableCell>{a.className}</TableCell>
                  <TableCell>{a.subjectName}</TableCell>
                  <TableCell>{TYPE_LABELS[a.assessmentType]}</TableCell>
                  <TableCell>{a.periodName}</TableCell>
                  <TableCell>{a.maxScore}</TableCell>
                  <TableCell>{a.coefficient}</TableCell>
                  <TableCell>
                    {a.gradedCount} notée(s)
                    {a.pendingCount > 0 ? ` · ${a.pendingCount} en attente` : ''}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABELS[a.status].label} color={STATUS_LABELS[a.status].color} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<VisibilityOutlinedIcon />}
                      onClick={() => router.push(`/assessments/${a.id}`)}
                    >
                      Ouvrir
                    </Button>
                    {canManage && a.status === 'draft' && (
                      <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(a)}>
                        Modifier
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11}>
                    <EmptyState message="Aucune évaluation ne correspond aux filtres." />
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
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
          nextIconButtonProps={{ disabled: !isLastPageFull && (page + 1) * pageSize >= total }}
        />
      </Card>

      <FormDialog
        open={dialogOpen}
        title={editing ? 'Modifier l’évaluation' : 'Nouvelle évaluation'}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSubmit={save}
        submitLabel={editing ? 'Enregistrer' : 'Créer'}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              required
              fullWidth
              label="Classe"
              value={form.classId}
              disabled={Boolean(editing)}
              onChange={(e) => {
                setForm({ ...form, classId: e.target.value, subjectId: '' });
                loadFormSubjects(e.target.value);
              }}
            >
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.levelName})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              required
              fullWidth
              label="Matière"
              value={form.subjectId}
              disabled={Boolean(editing)}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
            >
              {formSubjects.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ''}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            select
            required
            label="Période"
            value={form.gradingPeriodId}
            disabled={Boolean(editing)}
            onChange={(e) => setForm({ ...form, gradingPeriodId: e.target.value })}
          >
            {periods
              .filter((p) => !filters.schoolYearId || String(p.schoolYearId) === filters.schoolYearId)
              .map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Titre"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            helperText={editing ? '' : 'Ex. : Devoir n°1 — addition'}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label="Type"
              value={form.assessmentType}
              onChange={(e) => setForm({ ...form, assessmentType: e.target.value })}
            >
              <MenuItem value="homework">Devoir</MenuItem>
              <MenuItem value="quiz">Interrogation</MenuItem>
              <MenuItem value="exam">Examen</MenuItem>
              <MenuItem value="composition">Composition</MenuItem>
              <MenuItem value="ds">Devoir surveillé</MenuItem>
              <MenuItem value="other">Autre</MenuItem>
            </TextField>
            <TextField
              fullWidth
              label="Date"
              type="date"
              required
              value={form.assessmentDate}
              onChange={(e) => setForm({ ...form, assessmentDate: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Heure de début (facultatif)"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="À renseigner avec la durée pour détecter les chevauchements."
            />
            <TextField
              fullWidth
              label="Durée en minutes (facultatif)"
              type="number"
              inputProps={{ min: 1, max: 480, step: 5 }}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Note maximale"
              type="number"
              required
              inputProps={{ min: 0.5, max: 999, step: 0.5 }}
              value={form.maxScore}
              onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
            />
            <TextField
              fullWidth
              label="Coefficient"
              type="number"
              required
              inputProps={{ min: 0.1, max: 99, step: 0.1 }}
              value={form.coefficient}
              onChange={(e) => setForm({ ...form, coefficient: e.target.value })}
            />
          </Stack>
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {formError && <Alert severity="error">{formError}</Alert>}
        </Stack>
      </FormDialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
