'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  Link as MuiLink,
  LinearProgress,
  MenuItem,
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
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABELS,
  isOverdue,
  type HomeworkDetail,
  type StudentRow,
  type SubmissionStatus,
} from '@/services/homework';

interface TrackingResponse {
  data: {
    homework: { id: number; title: string; due_date: string | null; status: string };
    assigned: number;
    counts: Record<SubmissionStatus, number>;
    submittedCount: number;
    lateCount: number;
    notSubmittedCount: number;
    submissionRate: number | null;
    students: { studentId: number; matricule: string; lastName: string; firstName: string; status: SubmissionStatus }[];
  };
}

interface StudentHistory {
  data: {
    submission: {
      status: SubmissionStatus;
      submitted_at: string | null;
      comment: string | null;
      feedback: string | null;
      indicative_score: string | null;
      recorderName: string | null;
    } | null;
    history: { old_status: string | null; new_status: string; note: string | null; changed_at: string; changedBy: string | null }[];
  };
}

const STATUS_COLORS: Record<SubmissionStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  todo: 'default',
  started: 'info',
  submitted: 'info',
  late: 'warning',
  graded: 'success',
  not_submitted: 'error',
};

export default function HomeworkTrackingPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('homework.manage'));

  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [data, setData] = useState<TrackingResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Affectation d'élèves
  const [assignOpen, setAssignOpen] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Remise manuelle
  const [submissionOpen, setSubmissionOpen] = useState<null | { studentId: number; name: string; current: SubmissionStatus }>(null);
  const [subForm, setSubForm] = useState({ status: 'submitted' as SubmissionStatus, comment: '', submitted_at: '' });

  // Historique individuel
  const [historyOpen, setHistoryOpen] = useState<null | { studentId: number; name: string }>(null);
  const [history, setHistory] = useState<StudentHistory['data'] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hwRes, trRes] = await Promise.all([
        api.get<{ data: HomeworkDetail }>(`/homework/${id}`),
        api.get<TrackingResponse>(`/homework/${id}/tracking`).then((r) => r.data),
      ]);
      setHw(hwRes.data);
      setData(trRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openAssign = async () => {
    setAssignOpen(true);
    setAssignLoading(true);
    setSelected([]);
    try {
      const res = await api.get<{ data: StudentRow[] }>(`/homework/${id}/candidates`);
      setStudents(res.data);
    } catch {
      setStudents([]);
    } finally {
      setAssignLoading(false);
    }
  };

  const alreadyAssigned = useMemo(() => new Set(data?.students.map((s) => s.studentId) ?? []), [data]);

  const doAssign = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: { inserted: number; skipped: number; invalid: number[] } }>(
        `/homework/${id}/assign`,
        { student_ids: selected }
      );
      setNotice(
        `${res.data.inserted} affectation(s) créée(s)` +
          (res.data.skipped > 0 ? `, ${res.data.skipped} déjà affecté(s)` : '') +
          (res.data.invalid.length > 0 ? `, ${res.data.invalid.length} invalide(s) ignoré(s)` : '') +
          '.'
      );
      setAssignOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'affectation.");
    } finally {
      setBusy(false);
    }
  };

  const openSubmission = (studentId: number, name: string, current: SubmissionStatus) => {
    setSubmissionOpen({ studentId, name, current });
    setSubForm({ status: current === 'todo' ? 'submitted' : current, comment: '', submitted_at: '' });
  };

  const saveSubmission = async () => {
    if (!submissionOpen) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/homework/${id}/submissions`, {
        student_id: submissionOpen.studentId,
        status: subForm.status,
        comment: subForm.comment.trim() || null,
        submitted_at: subForm.submitted_at ? new Date(`${subForm.submitted_at}T12:00:00+03:00`).toISOString() : null,
      });
      setNotice(`Remise enregistrée pour ${submissionOpen.name}.`);
      setSubmissionOpen(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (studentId: number, name: string) => {
    setHistoryOpen({ studentId, name });
    setHistoryLoading(true);
    try {
      const res = await api.get<StudentHistory>(`/homework/${id}/student/${studentId}`);
      setHistory(res.data);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) return <LinearProgress />;
  if (error && !data) {
    return (
      <Box>
        <PageHeader title="Suivi" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!hw || !data) return null;

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={Link} href="/homework" underline="hover">
          Devoirs
        </MuiLink>
        <MuiLink component={Link} href={`/homework/${hw.id}`} underline="hover">
          {hw.title}
        </MuiLink>
        <Typography color="text.primary">Suivi des élèves</Typography>
      </Breadcrumbs>

      <PageHeader
        title="Suivi de la réalisation"
        subtitle={`${data.assigned} élève(s) affecté(s) · taux de remise ${data.submissionRate !== null ? `${data.submissionRate} %` : '—'}`}
        action={
          canManage &&
          hw.status !== 'archived' && (
            <Button startIcon={<PersonAddAltOutlinedIcon />} variant="outlined" onClick={openAssign}>
              Affecter des élèves
            </Button>
          )
        }
      />

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {isOverdue(hw) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          La date limite est dépassée : les remises restantes peuvent être enregistrées en retard.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(
          [
            ['submittedCount', 'Remis', 'success'],
            ['lateCount', 'En retard', 'warning'],
            ['notSubmittedCount', 'Non remis', 'error'],
          ] as const
        ).map(([key, label, color]) => (
          <Grid size={{ xs: 4, sm: 2 }} key={key}>
            <Card sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={800} color={`${color}.main`}>
                {data[key]}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Card>
          </Grid>
        ))}
        {SUBMISSION_STATUSES.map((st) => (
          <Grid size={{ xs: 4, sm: 2 }} key={st}>
            <Card sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={800}>
                {data.counts[st]}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {SUBMISSION_STATUS_LABELS[st]}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Élève</TableCell>
              <TableCell>Matricule</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucun élève affecté à ce devoir pour le moment.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              data.students.map((st) => (
                <TableRow key={st.studentId} hover>
                  <TableCell>
                    {st.lastName} {st.firstName}
                  </TableCell>
                  <TableCell>{st.matricule}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={STATUS_COLORS[st.status]}
                      label={SUBMISSION_STATUS_LABELS[st.status] ?? st.status}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {canManage && hw.status !== 'archived' && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => openSubmission(st.studentId, `${st.lastName} ${st.firstName}`, st.status)}
                        >
                          Remise
                        </Button>
                      )}
                      <Button
                        size="small"
                        startIcon={<HistoryOutlinedIcon />}
                        onClick={() => openHistory(st.studentId, `${st.lastName} ${st.firstName}`)}
                      >
                        Historique
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Affectation d'élèves */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Affecter des élèves (inscriptions actives)</DialogTitle>
        <DialogContent>
          {assignLoading ? (
            <LinearProgress sx={{ mt: 2 }} />
          ) : students.length === 0 ? (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              Aucun élève actif trouvé dans cette classe.
            </Typography>
          ) : (
            <Stack sx={{ mt: 1, maxHeight: 400, overflow: 'auto' }}>
              {students.map((s) => (
                <FormControlLabel
                  key={s.id}
                  control={
                    <Checkbox
                      checked={selected.includes(s.id)}
                      disabled={alreadyAssigned.has(s.id)}
                      onChange={(e) =>
                        setSelected((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                      }
                    />
                  }
                  label={
                    <span>
                      {s.last_name} {s.first_names}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        ({s.matricule}){alreadyAssigned.has(s.id) ? ' — déjà affecté' : ''}
                      </Typography>
                    </span>
                  }
                />
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={doAssign} disabled={busy || selected.length === 0}>
            Affecter ({selected.length})
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remise manuelle */}
      <Dialog open={Boolean(submissionOpen)} onClose={() => setSubmissionOpen(null)}>
        <DialogTitle>
          Remise — {submissionOpen?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 320 }}>
            <TextField
              select
              label="Statut"
              value={subForm.status}
              onChange={(e) => setSubForm({ ...subForm, status: e.target.value as SubmissionStatus })}
              fullWidth
              size="small"
            >
              {SUBMISSION_STATUSES.map((st) => (
                <MenuItem key={st} value={st}>
                  {SUBMISSION_STATUS_LABELS[st]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Date de remise"
              type="date"
              value={subForm.submitted_at}
              onChange={(e) => setSubForm({ ...subForm, submitted_at: e.target.value })}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              helperText="Une remise après la date limite est marquée en retard automatiquement."
            />
            <TextField
              label="Commentaire"
              value={subForm.comment}
              onChange={(e) => setSubForm({ ...subForm, comment: e.target.value })}
              multiline
              minRows={2}
              fullWidth
              size="small"
              inputProps={{ maxLength: 2000 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmissionOpen(null)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={saveSubmission} disabled={busy}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Historique individuel */}
      <Dialog open={Boolean(historyOpen)} onClose={() => setHistoryOpen(null)} fullWidth maxWidth="sm">
        <DialogTitle>Historique — {historyOpen?.name}</DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <LinearProgress sx={{ mt: 2 }} />
          ) : !history ? (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              Aucune information disponible.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {history.submission && (
                <Card sx={{ p: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Remise actuelle : {SUBMISSION_STATUS_LABELS[history.submission.status]}
                  </Typography>
                  {history.submission.submitted_at && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Enregistrée le {String(history.submission.submitted_at).slice(0, 16).replace('T', ' ')} par{' '}
                      {history.submission.recorderName ?? '—'}
                    </Typography>
                  )}
                  {history.submission.comment && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Commentaire : {history.submission.comment}
                    </Typography>
                  )}
                </Card>
              )}
              {history.history.length === 0 ? (
                <Typography color="text.secondary">Aucun changement de statut enregistré.</Typography>
              ) : (
                history.history.map((h, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={
                        h.old_status
                          ? `${SUBMISSION_STATUS_LABELS[h.old_status as SubmissionStatus] ?? h.old_status} → ${
                              SUBMISSION_STATUS_LABELS[h.new_status as SubmissionStatus] ?? h.new_status
                            }`
                          : SUBMISSION_STATUS_LABELS[h.new_status as SubmissionStatus] ?? h.new_status
                      }
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {String(h.changed_at).slice(0, 16).replace('T', ' ')} · {h.changedBy ?? '—'}
                      {h.note ? ` · ${h.note}` : ''}
                    </Typography>
                  </Stack>
                ))
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
