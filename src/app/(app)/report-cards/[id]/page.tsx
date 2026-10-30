'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
import CachedOutlinedIcon from '@mui/icons-material/CachedOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import FormDialog from '@/components/admin/FormDialog';

interface CardInfo {
  id: number;
  status: 'draft' | 'ready' | 'validated' | 'locked' | 'cancelled';
  revision: number;
  classId: number;
  gradingPeriodId: number;
  generalAverage: number | null;
  totalCoefficient: number | null;
  subjectsGraded: number;
  subjectsTotal: number;
  generalComment: string | null;
  validatedAt: string | null;
  lockedAt: string | null;
  validatedByName: string | null;
  lockedByName: string | null;
}
interface LineRow {
  subjectId: number;
  subjectName: string;
  coefficient: number;
  average: number | null;
  evaluationsCount: number;
  gradingCount: number;
  appreciation: string | null;
}
interface RevisionRow {
  revision: number;
  action: string;
  reason: string | null;
  createdAt: string;
  actorName: string;
}
interface DetailResponse {
  data: {
    card: CardInfo;
    student: {
      matricule: string;
      lastName: string;
      firstNames: string;
      className: string;
      levelName: string;
      yearLabel: string;
      periodName: string;
    };
    lines: LineRow[];
    attendance: { present: number; absent: number; excused: number; late: number; incomplete: number };
    anomalies: string[];
    sourceDrift: boolean;
    revisions: RevisionRow[];
  };
}

const STATUS_LABEL: Record<CardInfo['status'], { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  draft: { label: 'Brouillon', color: 'info' },
  ready: { label: 'Prêt', color: 'warning' },
  validated: { label: 'Validé', color: 'success' },
  locked: { label: 'Verrouillé', color: 'default' },
  cancelled: { label: 'Annulé', color: 'error' },
};

const ACTION_LABEL: Record<string, string> = {
  generated: 'Généré',
  ready: 'Marqué prêt',
  validated: 'Validé',
  locked: 'Verrouillé',
  corrected: 'Corrigé',
  cancelled: 'Annulé',
};

export default function ReportCardDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const canManage = user?.permissions.includes('report_cards.manage') ?? false;
  const canValidate = user?.permissions.includes('report_cards.validate') ?? false;
  const canLock = user?.permissions.includes('report_cards.lock') ?? false;
  const canCorrect = user?.permissions.includes('report_cards.correct') ?? false;

  const [data, setData] = useState<DetailResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [generalComment, setGeneralComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [editingSubject, setEditingSubject] = useState<LineRow | null>(null);
  const [subjectComment, setSubjectComment] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [corrOpen, setCorrOpen] = useState(false);
  const [corrReason, setCorrReason] = useState('');
  const [corrError, setCorrError] = useState<string | null>(null);
  const [corrBusy, setCorrBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<DetailResponse>(`/report-cards/${params.id}`);
      setData(res.data);
      setGeneralComment(res.data.card.generalComment ?? '');
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (verb: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>(`/report-cards/${params.id}/${verb}`, body ?? {});
      setSnack(res.message ?? 'Effectué.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };

  const saveGeneralComment = async () => {
    setSavingComment(true);
    try {
      await api.post(`/report-cards/${params.id}/general-comment`, { comment: generalComment });
      setSnack('Appréciation générale enregistrée.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSavingComment(false);
    }
  };

  const openSubject = (l: LineRow) => {
    setEditingSubject(l);
    setSubjectComment(l.appreciation ?? '');
    setSubjectError(null);
  };

  const saveSubject = async () => {
    if (!editingSubject) return;
    setSavingSubject(true);
    setSubjectError(null);
    try {
      await api.post(`/report-cards/${params.id}/subject-appreciation`, {
        subjectId: editingSubject.subjectId,
        comment: subjectComment,
      });
      setEditingSubject(null);
      setSnack('Appréciation enregistrée.');
      load();
    } catch (err) {
      setSubjectError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSavingSubject(false);
    }
  };

  const saveCorrection = async () => {
    if (corrReason.trim().length < 5) {
      setCorrError('Motif obligatoire (5 caractères minimum).');
      return;
    }
    setCorrBusy(true);
    setCorrError(null);
    try {
      const res = await api.post<{ message: string }>(`/report-cards/${params.id}/corrections`, {
        reason: corrReason.trim(),
      });
      setCorrOpen(false);
      setSnack(res.message ?? 'Correction enregistrée.');
      load();
    } catch (err) {
      setCorrError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setCorrBusy(false);
    }
  };

  if (error && !data) {
    return (
      <Box>
        <PageHeader title="Bulletin" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!data) {
    return (
      <Box>
        <PageHeader title="Bulletin" subtitle="Chargement…" />
      </Box>
    );
  }

  const { card, student, lines, attendance, anomalies, sourceDrift, revisions } = data;
  const frozen = card.status === 'validated' || card.status === 'locked';

  return (
    <Box>
      <PageHeader
        title={`Bulletin — ${student.lastName} ${student.firstNames}`}
        subtitle={`${student.className} (${student.levelName}) — ${student.periodName} — ${student.yearLabel} — matricule ${student.matricule}`}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => router.push('/report-cards')}>
              Retour
            </Button>
            <Button startIcon={<PrintOutlinedIcon />} onClick={() => router.push(`/report-cards/${params.id}/print`)}>
              Imprimer
            </Button>
          </Stack>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap">
          <Chip label={`${STATUS_LABEL[card.status].label} · révision ${card.revision}`} color={STATUS_LABEL[card.status].color} variant="outlined" />
          <Typography variant="body2">
            Moyenne générale : <strong>{card.generalAverage !== null ? `${card.generalAverage.toFixed(2)} / 20` : 'Indisponible'}</strong>
            {' · '}Σ coefficients : {card.totalCoefficient ?? '—'}
            {' · '}Matières évaluées : {card.subjectsGraded}/{card.subjectsTotal}
          </Typography>
          {sourceDrift && (
            <Alert severity="warning" icon={<WarningAmberOutlinedIcon />} sx={{ py: 0 }}>
              Les notes sources ont changé depuis le calcul. Générez ou corrigez pour actualiser.
            </Alert>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {canManage && !frozen && (
            <Button
              startIcon={<CachedOutlinedIcon />}
              disabled={busy}
              onClick={() =>
                action('generate', { classId: card.classId, gradingPeriodId: card.gradingPeriodId })
              }
            >
              Recalculer
            </Button>
          )}
          {canManage && card.status === 'draft' && (
            <Button variant="outlined" startIcon={<TaskAltOutlinedIcon />} disabled={busy} onClick={() => action('submit')}>
              Marquer prêt
            </Button>
          )}
          {canValidate && card.status === 'ready' && (
            <Button variant="contained" color="success" startIcon={<VerifiedOutlinedIcon />} disabled={busy} onClick={() => action('validate')}>
              Valider
            </Button>
          )}
          {canLock && card.status === 'validated' && (
            <Button variant="contained" color="warning" startIcon={<LockOutlinedIcon />} disabled={busy} onClick={() => action('lock')}>
              Verrouiller
            </Button>
          )}
          {canCorrect && frozen && (
            <Button variant="outlined" color="error" startIcon={<GavelOutlinedIcon />} onClick={() => setCorrOpen(true)}>
              Corriger
            </Button>
          )}
        </Stack>
        {anomalies.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={700}>
              Contrôles avant validation :
            </Typography>
            {anomalies.map((a, i) => (
              <Typography key={i} variant="body2">
                • {a}
              </Typography>
            ))}
          </Alert>
        )}
        {frozen && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {card.validatedByName ? `Validé par ${card.validatedByName}` : ''}
            {card.lockedAt ? ` — verrouillé le ${new Date(card.lockedAt).toLocaleString('fr-MG')}` : ''}
            {' — '}Toute modification passe par une correction motivée (historique conservé).
          </Typography>
        )}
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Matière</TableCell>
                <TableCell align="center">Coef.</TableCell>
                <TableCell align="center">Moyenne / 20</TableCell>
                <TableCell>Évaluations</TableCell>
                <TableCell>Appréciation</TableCell>
                {canManage && !frozen && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.subjectId} hover>
                  <TableCell>{l.subjectName}</TableCell>
                  <TableCell align="center">{l.coefficient}</TableCell>
                  <TableCell align="center">
                    {l.average !== null ? l.average.toFixed(2) : <Typography variant="caption">Non évaluée</Typography>}
                  </TableCell>
                  <TableCell>
                    {l.gradingCount}/{l.evaluationsCount} note(s)
                  </TableCell>
                  <TableCell sx={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{l.appreciation ?? '—'}</TableCell>
                  {canManage && !frozen && (
                    <TableCell align="right">
                      <Button size="small" onClick={() => openSubject(l)}>
                        Apprécier
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="Aucune matière rattachée à cette classe." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Appréciation générale
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          value={generalComment}
          disabled={frozen || !canManage}
          onChange={(e) => setGeneralComment(e.target.value)}
          placeholder="Appréciation de synthèse (professeur titulaire ou administration)"
        />
        {canManage && !frozen && (
          <Button variant="text" startIcon={<SaveOutlinedIcon />} disabled={savingComment} onClick={saveGeneralComment} sx={{ mt: 1 }}>
            Enregistrer l’appréciation générale
          </Button>
        )}
      </Card>

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Présences sur la période (appels en classe)
        </Typography>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <Typography variant="body2">Présences : <strong>{attendance.present}</strong></Typography>
          <Typography variant="body2">Absences non justifiées : <strong>{attendance.absent}</strong></Typography>
          <Typography variant="body2">Absences justifiées : <strong>{attendance.excused}</strong></Typography>
          <Typography variant="body2">Retards : <strong>{attendance.late}</strong></Typography>
          <Typography variant="body2">Séances sans statut : <strong>{attendance.incomplete}</strong></Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Issu uniquement des appels en classe — distinct du pointage d’entrée. Ces données n’influencent jamais les moyennes.
        </Typography>
      </Card>

      {revisions.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ p: 2, pb: 0 }}>
            Historique des révisions
          </Typography>
          <TableContainer sx={{ p: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Révision</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Motif</TableCell>
                  <TableCell>Par</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {revisions.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.revision}</TableCell>
                    <TableCell>{ACTION_LABEL[r.action] ?? r.action}</TableCell>
                    <TableCell>{r.reason ?? '—'}</TableCell>
                    <TableCell>{r.actorName}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString('fr-MG')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <FormDialog
        open={editingSubject !== null}
        title={`Appréciation — ${editingSubject?.subjectName ?? ''}`}
        saving={savingSubject}
        onClose={() => setEditingSubject(null)}
        onSubmit={saveSubject}
        submitLabel="Enregistrer"
      >
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Appréciation du professeur (500 caractères max.)"
          value={subjectComment}
          onChange={(e) => setSubjectComment(e.target.value)}
        />
        {subjectError && <Alert severity="error" sx={{ mt: 2 }}>{subjectError}</Alert>}
      </FormDialog>

      <FormDialog
        open={corrOpen}
        title="Correction du bulletin"
        saving={corrBusy}
        onClose={() => setCorrOpen(false)}
        onSubmit={saveCorrection}
        submitLabel="Remettre en révision"
      >
        <Alert severity="info" sx={{ mb: 2 }}>
          Le bulletin repasse à l’état « prêt », sa révision est incrémentée et l’instantané validé est conservé dans l’historique.
        </Alert>
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Motif de la correction (obligatoire)"
          value={corrReason}
          onChange={(e) => setCorrReason(e.target.value)}
        />
        {corrError && <Alert severity="error" sx={{ mt: 2 }}>{corrError}</Alert>}
      </FormDialog>

      {/* Snackbar géré par les actions */}
      {snack && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSnack(null)}>
          {snack}
        </Alert>
      )}
    </Box>
  );
}
