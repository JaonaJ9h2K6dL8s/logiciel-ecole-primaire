'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import FormDialog from '@/components/admin/FormDialog';

type GradeStatus = 'not_graded' | 'graded' | 'absent' | 'absent_justified' | 'excused';

interface Assessment {
  id: number;
  class_id: number;
  subject_id: number;
  school_year_id: number;
  grading_period_id: number;
  title: string;
  assessment_type: string;
  assessmentDate: string;
  start_time: string | null;
  duration_minutes: number | null;
  max_score: string;
  coefficient: string;
  teacher_id: number;
  description: string | null;
  status: 'draft' | 'submitted' | 'locked';
}

const ASSESSMENT_TYPE_LABELS: Record<string, string> = {
  homework: 'Devoir',
  quiz: 'Interrogation',
  exam: 'Examen',
  composition: 'Composition',
  ds: 'Devoir surveillé',
  other: 'Autre',
};

interface RosterStudent {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
}

interface GradeRow {
  studentId: number;
  score: string | null;
  gradeStatus: GradeStatus;
  comment: string | null;
}

interface CorrectionRow {
  gradeId: number;
  studentId: number;
  oldScore: string | null;
  newScore: string | null;
  oldStatus: string;
  newStatus: string;
  reason: string;
  createdAt: string;
  correctedByName: string;
}

const STATUS_LABELS: Record<GradeStatus, string> = {
  not_graded: 'Non évalué',
  graded: 'Noté',
  absent: 'Absent',
  absent_justified: 'Absent justifié',
  excused: 'Dispensé',
};

const ASSESSMENT_STATUS: Record<Assessment['status'], { label: string; color: 'info' | 'success' | 'default' }> = {
  draft: { label: 'Brouillon', color: 'info' },
  submitted: { label: 'Soumise', color: 'success' },
  locked: { label: 'Verrouillée', color: 'default' },
};

interface EntryDraft {
  gradeStatus: GradeStatus;
  score: string;
  comment: string;
}

export default function AssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const canManage = user?.permissions.includes('assessments.manage') ?? false;
  const canEnter = user?.permissions.includes('grades.manage') ?? false;
  const canLock = user?.permissions.includes('grades.lock') ?? false;
  const canCorrect = user?.permissions.includes('grades.correct') ?? false;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, EntryDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [corrDialogOpen, setCorrDialogOpen] = useState(false);
  const [corrStudent, setCorrStudent] = useState<RosterStudent | null>(null);
  const [corrForm, setCorrForm] = useState({ gradeStatus: 'graded' as GradeStatus, score: '', reason: '' });
  const [corrError, setCorrError] = useState<string | null>(null);
  const [corrSaving, setCorrSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{
        data: { assessment: Assessment; roster: RosterStudent[]; grades: GradeRow[]; corrections: CorrectionRow[] };
      }>(`/assessments/${params.id}`);
      const d = res.data;
      setAssessment(d.assessment);
      setRoster(d.roster);
      setCorrections(d.corrections);
      const next: Record<number, EntryDraft> = {};
      for (const s of d.roster) {
        const g = d.grades.find((x) => x.studentId === s.id);
        next[s.id] = {
          gradeStatus: g?.gradeStatus ?? 'not_graded',
          score: g?.gradeStatus === 'graded' && g.score !== null ? String(g.score) : '',
          comment: g?.comment ?? '',
        };
      }
      setDrafts(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (studentId: number, patch: Partial<EntryDraft>) => {
    setDrafts((d) => ({ ...d, [studentId]: { ...d[studentId], ...patch } }));
  };

  const dirty = useMemo(() => {
    if (!assessment) return false;
    return roster.some((s) => {
      const d = drafts[s.id];
      return d && (d.gradeStatus !== 'not_graded' || d.score !== '' || d.comment !== '');
    });
  }, [roster, drafts, assessment]);

  const saveGrades = async () => {
    if (!assessment) return;
    const max = Number(assessment.max_score);
    const grades: unknown[] = [];
    for (const s of roster) {
      const d = drafts[s.id];
      if (!d) continue;
      const untouched = d.gradeStatus === 'not_graded' && d.score === '' && d.comment === '';
      if (untouched) continue;
      if (d.gradeStatus === 'graded') {
        const v = Number(d.score.replace(',', '.'));
        if (d.score.trim() === '' || !Number.isFinite(v)) {
          setError(`Note invalide pour ${s.last_name} ${s.first_names} : saisissez une valeur numérique ou changez le statut.`);
          return;
        }
        if (v < 0 || v > max) {
          setError(`Note de ${s.last_name} ${s.first_names} hors barème (0 à ${max}).`);
          return;
        }
        grades.push({ studentId: s.id, gradeStatus: 'graded', score: v, comment: d.comment });
      } else {
        grades.push({ studentId: s.id, gradeStatus: d.gradeStatus, comment: d.comment });
      }
    }
    if (grades.length === 0) {
      setError('Aucune modification à enregistrer.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ message: string }>(`/assessments/${assessment.id}/grades`, { grades });
      setSnack(res.message ?? 'Notes enregistrées.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const doTransition = async (action: 'submit' | 'lock' | 'unlock') => {
    if (!assessment) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>(`/assessments/${assessment.id}/${action}`, {});
      setSnack(res.message ?? 'Opération effectuée.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const openCorrection = (s: RosterStudent) => {
    const d = drafts[s.id];
    setCorrStudent(s);
    setCorrForm({
      gradeStatus: d?.gradeStatus === 'graded' ? 'graded' : 'graded',
      score: d?.gradeStatus === 'graded' ? (d.score ?? '') : '',
      reason: '',
    });
    setCorrError(null);
    setCorrDialogOpen(true);
  };

  const saveCorrection = async () => {
    if (!assessment || !corrStudent) return;
    if (corrForm.reason.trim().length < 5) {
      setCorrError('Motif de correction obligatoire (5 caractères minimum).');
      return;
    }
    let score: number | null = null;
    if (corrForm.gradeStatus === 'graded') {
      const v = Number(corrForm.score.replace(',', '.'));
      if (corrForm.score.trim() === '' || !Number.isFinite(v)) {
        setCorrError('Note invalide.');
        return;
      }
      if (v < 0 || v > Number(assessment.max_score)) {
        setCorrError(`Note hors barème (0 à ${assessment.max_score}).`);
        return;
      }
      score = v;
    }
    setCorrSaving(true);
    setCorrError(null);
    try {
      const res = await api.post<{ message: string }>(`/assessments/${assessment.id}/corrections`, {
        studentId: corrStudent.id,
        gradeStatus: corrForm.gradeStatus,
        score,
        reason: corrForm.reason.trim(),
      });
      setCorrDialogOpen(false);
      setSnack(res.message ?? 'Correction enregistrée.');
      load();
    } catch (err) {
      setCorrError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setCorrSaving(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <PageHeader title="Évaluation" subtitle="Chargement…" />
      </Box>
    );
  }

  if (!assessment) {
    return (
      <Box>
        <PageHeader title="Évaluation" />
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <EmptyState message="Évaluation introuvable ou non accessible." actionLabel="Retour à la liste" onAction={() => router.push('/assessments')} />
      </Box>
    );
  }

  const isLocked = assessment.status === 'locked';

  return (
    <Box>
      <PageHeader
        title={assessment.title}
        subtitle={`${assessment.assessmentDate} — note sur ${assessment.max_score} — coefficient ${assessment.coefficient}`}
        action={
          <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => router.push('/assessments')}>
            Retour
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
          <Chip label={ASSESSMENT_STATUS[assessment.status].label} color={ASSESSMENT_STATUS[assessment.status].color} variant="outlined" />
          <Typography variant="body2" color="text.secondary">
            Type : {ASSESSMENT_TYPE_LABELS[assessment.assessment_type] ?? assessment.assessment_type}
            {assessment.start_time && (
              <>
                {' · '}
                {assessment.start_time.slice(0, 5)}
                {assessment.duration_minutes ? ` (${assessment.duration_minutes} min)` : ''}
              </>
            )}
            {' · '}
            {roster.length} élève(s) inscrit(s) à la date de l’évaluation
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {canEnter && !isLocked && (
            <Button variant="contained" startIcon={<SaveOutlinedIcon />} disabled={saving || !dirty} onClick={saveGrades}>
              Enregistrer les notes
            </Button>
          )}
          {canManage && assessment.status === 'draft' && (
            <Button variant="outlined" startIcon={<SendOutlinedIcon />} disabled={saving} onClick={() => doTransition('submit')}>
              Soumettre
            </Button>
          )}
          {canLock && assessment.status === 'submitted' && (
            <Button variant="outlined" color="warning" startIcon={<LockOutlinedIcon />} disabled={saving} onClick={() => doTransition('lock')}>
              Verrouiller
            </Button>
          )}
          {canLock && isLocked && (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} disabled={saving} onClick={() => doTransition('unlock')}>
              Déverrouiller
            </Button>
          )}
        </Stack>
        {isLocked && canCorrect && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Évaluation verrouillée : les notes ne sont plus modifiables directement. Utilisez « Corriger » sur la ligne d’un élève (motif obligatoire, historique conservé).
          </Alert>
        )}
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Matricule</TableCell>
                <TableCell>Élève</TableCell>
                <TableCell sx={{ minWidth: 170 }}>Statut</TableCell>
                <TableCell sx={{ minWidth: 110 }}>Note / {assessment.max_score}</TableCell>
                <TableCell sx={{ minWidth: 220 }}>Commentaire</TableCell>
                {isLocked && canCorrect && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {roster.map((s) => {
                const d = drafts[s.id];
                if (!d) return null;
                return (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {s.matricule}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {s.last_name} {s.first_names}
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={d.gradeStatus}
                        disabled={isLocked || !canEnter}
                        onChange={(e) => {
                          const status = e.target.value as GradeStatus;
                          setDraft(s.id, { gradeStatus: status, score: status === 'graded' ? d.score : '' });
                        }}
                      >
                        {(Object.keys(STATUS_LABELS) as GradeStatus[]).map((k) => (
                          <MenuItem key={k} value={k}>
                            {STATUS_LABELS[k]}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        type="number"
                        inputProps={{ min: 0, max: Number(assessment.max_score), step: 0.25 }}
                        value={d.score}
                        disabled={isLocked || !canEnter || d.gradeStatus !== 'graded'}
                        placeholder={d.gradeStatus === 'graded' ? 'Saisir la note' : '—'}
                        onChange={(e) => setDraft(s.id, { score: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={d.comment}
                        disabled={isLocked || !canEnter}
                        onChange={(e) => setDraft(s.id, { comment: e.target.value })}
                      />
                    </TableCell>
                    {isLocked && canCorrect && (
                      <TableCell align="right">
                        <Button size="small" startIcon={<GavelOutlinedIcon />} onClick={() => openCorrection(s)}>
                          Corriger
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {roster.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isLocked && canCorrect ? 6 : 5}>
                    <EmptyState message="Aucun élève inscrit dans cette classe à la date de l’évaluation." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {corrections.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <Typography variant="h6" sx={{ p: 2, pb: 0 }}>
            Historique des corrections
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ m: 2, width: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Élève</TableCell>
                  <TableCell>Ancienne valeur</TableCell>
                  <TableCell>Nouvelle valeur</TableCell>
                  <TableCell>Motif</TableCell>
                  <TableCell>Par</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {corrections.map((c, i) => {
                  const s = roster.find((r) => r.id === c.studentId);
                  const fmt = (status: string, score: string | null) =>
                    status === 'graded' ? `${score}/20` : STATUS_LABELS[status as GradeStatus] ?? status;
                  return (
                    <TableRow key={`${c.gradeId}-${i}`}>
                      <TableCell>{s ? `${s.last_name} ${s.first_names}` : `Élève #${c.studentId}`}</TableCell>
                      <TableCell>{fmt(c.oldStatus, c.oldScore)}</TableCell>
                      <TableCell>{fmt(c.newStatus, c.newScore)}</TableCell>
                      <TableCell>{c.reason}</TableCell>
                      <TableCell>{c.correctedByName}</TableCell>
                      <TableCell>{String(c.createdAt).slice(0, 16).replace('T', ' ')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <FormDialog
        open={corrDialogOpen}
        title={`Correction — ${corrStudent?.last_name ?? ''} ${corrStudent?.first_names ?? ''}`}
        saving={corrSaving}
        onClose={() => setCorrDialogOpen(false)}
        onSubmit={saveCorrection}
        submitLabel="Enregistrer la correction"
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Nouveau statut"
            value={corrForm.gradeStatus}
            onChange={(e) => setCorrForm({ ...corrForm, gradeStatus: e.target.value as GradeStatus, score: e.target.value === 'graded' ? corrForm.score : '' })}
          >
            <MenuItem value="graded">Noté</MenuItem>
            <MenuItem value="absent">Absent</MenuItem>
            <MenuItem value="absent_justified">Absent justifié</MenuItem>
            <MenuItem value="excused">Dispensé</MenuItem>
          </TextField>
          <TextField
            label={`Nouvelle note / ${assessment.max_score}`}
            type="number"
            inputProps={{ min: 0, max: Number(assessment.max_score), step: 0.25 }}
            value={corrForm.score}
            disabled={corrForm.gradeStatus !== 'graded'}
            onChange={(e) => setCorrForm({ ...corrForm, score: e.target.value })}
          />
          <TextField
            label="Motif de la correction"
            required
            multiline
            minRows={2}
            value={corrForm.reason}
            onChange={(e) => setCorrForm({ ...corrForm, reason: e.target.value })}
            helperText="Obligatoire — conservé dans l’historique avec l’ancienne valeur."
          />
          {corrError && <Alert severity="error">{corrError}</Alert>}
        </Stack>
      </FormDialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
