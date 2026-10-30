'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  SUBMISSION_STATUS_LABELS,
  loadPeriods,
  type GradingPeriod,
  type HomeworkDetail,
  type SubmissionStatus,
} from '@/services/homework';

interface RosterRow {
  studentId: number;
  matricule: string;
  last_name: string;
  first_names: string;
  assignedAt: string | null;
  submissionStatus: SubmissionStatus | null;
  submittedAt: string | null;
  feedback: string | null;
  indicativeScore: string | null;
}

export default function HomeworkCorrectionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('homework.manage'));

  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Correction d'un élève
  const [grading, setGrading] = useState<null | RosterRow>(null);
  const [gradeForm, setGradeForm] = useState({ feedback: '', indicative_score: '' });

  // Intégration aux notes officielles
  const [integrateOpen, setIntegrateOpen] = useState(false);
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [intForm, setIntForm] = useState({
    grading_period_id: '',
    assessment_date: '',
    title: '',
    max_score: '',
    coefficient: '1',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hwRes, rosterRes] = await Promise.all([
        api.get<{ data: HomeworkDetail }>(`/homework/${id}`),
        api.get<{ data: RosterRow[] }>(`/homework/${id}/roster`).then((r) => r.data),
      ]);
      setHw(hwRes.data);
      setRows(rosterRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openGrading = (row: RosterRow) => {
    setGrading(row);
    setGradeForm({
      feedback: row.feedback ?? '',
      indicative_score: row.indicativeScore !== null && row.indicativeScore !== undefined ? String(Number(row.indicativeScore)) : '',
    });
  };

  const saveGrading = async () => {
    if (!grading || !hw) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/homework/${id}/submissions`, {
        student_id: grading.studentId,
        status: 'graded',
        feedback: gradeForm.feedback.trim() || null,
        indicative_score: gradeForm.indicative_score === '' ? null : Number(gradeForm.indicative_score),
      });
      setNotice(`Correction enregistrée pour ${grading.last_name} ${grading.first_names}.`);
      setGrading(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const publishCorrections = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/homework/${id}/publish-corrections`);
      setNotice('Corrections publiées.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la publication.');
    } finally {
      setBusy(false);
    }
  };

  const openIntegrate = async () => {
    if (!hw) return;
    setIntegrateOpen(true);
    try {
      const list = await loadPeriods(hw.school_year_id);
      setPeriods(list);
    } catch {
      setPeriods([]);
    }
  };

  const doIntegrate = async () => {
    if (!hw || !intForm.grading_period_id || !intForm.assessment_date) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: { assessmentId: number } }>(`/homework/${id}/integrate`, {
        grading_period_id: Number(intForm.grading_period_id),
        assessment_date: intForm.assessment_date,
        title: intForm.title.trim() || undefined,
        max_score: intForm.max_score ? Number(intForm.max_score) : null,
        coefficient: intForm.coefficient ? Number(intForm.coefficient) : undefined,
      });
      setNotice(`Intégrée aux notes officielles : évaluation #${res.data.assessmentId} (statut brouillon).`);
      setIntegrateOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'intégration.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LinearProgress />;
  if (error && !hw) {
    return (
      <Box>
        <PageHeader title="Correction" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!hw) return null;

  const canEdit = canManage && hw.status !== 'archived';

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={Link} href="/homework" underline="hover">
          Devoirs
        </MuiLink>
        <MuiLink component={Link} href={`/homework/${hw.id}`} underline="hover">
          {hw.title}
        </MuiLink>
        <Typography color="text.primary">Correction</Typography>
      </Breadcrumbs>

      <PageHeader
        title="Correction des devoirs"
        subtitle="Appréciations, commentaires pédagogiques et notes indicatives (distinctes des notes officielles)."
        action={
          canEdit && (
            <Stack direction="row" spacing={1}>
              {hw.corrections_published !== 1 && (
                <Button
                  startIcon={<PublishOutlinedIcon />}
                  onClick={publishCorrections}
                  disabled={busy || hw.status === 'draft'}
                >
                  Publier les corrections
                </Button>
              )}
              {(hw.status === 'published' || hw.status === 'closed') && (
                <Button startIcon={<PlaylistAddCheckOutlinedIcon />} variant="outlined" onClick={openIntegrate}>
                  Intégrer aux notes officielles
                </Button>
              )}
            </Stack>
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
      {hw.corrections_published === 1 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Corrections publiées : les réponses attendues sont visibles dans la page Questions.
        </Alert>
      )}

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Élève</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Note indicative</TableCell>
              <TableCell>Appréciation</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucun élève affecté : affectez d’abord les élèves depuis la page de suivi.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.studentId} hover>
                  <TableCell>
                    {r.last_name} {r.first_names}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {r.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={r.submissionStatus === 'graded' ? 'success' : r.submissionStatus === 'late' ? 'warning' : 'default'}
                      label={r.submissionStatus ? SUBMISSION_STATUS_LABELS[r.submissionStatus] : 'À faire'}
                    />
                  </TableCell>
                  <TableCell>{r.indicativeScore !== null && r.indicativeScore !== undefined ? Number(r.indicativeScore) : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography variant="body2" noWrap>
                      {r.feedback ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {canEdit && (
                      <Button size="small" variant="outlined" onClick={() => openGrading(r)}>
                        Corriger
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Correction individuelle */}
      <Dialog open={Boolean(grading)} onClose={() => setGrading(null)}>
        <DialogTitle>
          Corriger — {grading?.last_name} {grading?.first_names}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 340 }}>
            <TextField
              label={`Note indicative${hw.max_score ? ` (sur ${Number(hw.max_score)})` : ''}`}
              type="number"
              value={gradeForm.indicative_score}
              onChange={(e) => setGradeForm({ ...gradeForm, indicative_score: e.target.value })}
              fullWidth
              size="small"
              inputProps={{ min: 0, step: '0.5' }}
              helperText="Note de devoir, distincte des notes officielles tant qu'elle n'est pas intégrée explicitement."
            />
            <TextField
              label="Appréciation / commentaire pédagogique"
              value={gradeForm.feedback}
              onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
              multiline
              minRows={3}
              fullWidth
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGrading(null)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={saveGrading} disabled={busy}>
            Marquer corrigé
          </Button>
        </DialogActions>
      </Dialog>

      {/* Intégration aux notes officielles */}
      <Dialog open={integrateOpen} onClose={() => setIntegrateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Intégrer aux notes officielles</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Une évaluation liée sera créée dans le module existant des évaluations (statut brouillon) et les
            notes indicatives des remises corrigées y seront copiées. Les bulletins validés ne sont jamais
            modifiés automatiquement. Cette opération n’est possible qu’une seule fois.
          </DialogContentText>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Période d'évaluation"
                value={intForm.grading_period_id}
                onChange={(e) => setIntForm({ ...intForm, grading_period_id: e.target.value })}
                fullWidth
                size="small"
              >
                {periods.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Date de l'évaluation"
                type="date"
                value={intForm.assessment_date}
                onChange={(e) => setIntForm({ ...intForm, assessment_date: e.target.value })}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Titre (facultatif)"
                value={intForm.title}
                onChange={(e) => setIntForm({ ...intForm, title: e.target.value })}
                fullWidth
                size="small"
                inputProps={{ maxLength: 180 }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Note max"
                type="number"
                value={intForm.max_score}
                onChange={(e) => setIntForm({ ...intForm, max_score: e.target.value })}
                fullWidth
                size="small"
                inputProps={{ min: 0, step: '0.5' }}
                helperText={hw.max_score ? `Barème : ${Number(hw.max_score)}` : ' '}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Coefficient"
                type="number"
                value={intForm.coefficient}
                onChange={(e) => setIntForm({ ...intForm, coefficient: e.target.value })}
                fullWidth
                size="small"
                inputProps={{ min: 0, step: '0.5' }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIntegrateOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={doIntegrate}
            disabled={busy || !intForm.grading_period_id || !intForm.assessment_date}
          >
            Confirmer l’intégration
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
