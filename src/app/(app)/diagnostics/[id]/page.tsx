'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
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
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import EmptyState from '@/components/admin/EmptyState';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  QUESTION_TYPE_LABELS,
  TEST_STATUS_LABELS,
  loadClassResults,
  loadDiagnosticTest,
  type ClassResults,
  type DiagnosticTestDetail,
} from '@/services/diagnostics';

export default function DiagnosticDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const testId = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('diagnostics.manage'));

  const [detail, setDetail] = useState<DiagnosticTestDetail | null>(null);
  const [results, setResults] = useState<ClassResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: 'publish' | 'close' | 'archive'; label: string } | null>(null);
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadDiagnosticTest(testId);
      setDetail(d);
      if (d.test.status !== 'draft') {
        const r = await loadClassResults(testId);
        setResults(r);
      } else {
        setResults(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    if (Number.isFinite(testId)) load();
  }, [load, testId]);

  const runAction = async (action: 'publish' | 'close' | 'archive') => {
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/diagnostics/${testId}`, { status: action === 'publish' ? 'published' : action });
      setConfirmAction(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Erreur lors de la mise à jour.');
    } finally {
      setBusy(false);
    }
  };

  const startAttempt = async () => {
    if (!studentId) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.post<{ data: { attemptId: number; resumed: boolean } }>(`/diagnostics/${testId}/attempts`, {
        studentId: Number(studentId),
      });
      router.push(`/diagnostics/attempts/${res.data.attemptId}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Erreur au démarrage de la passation.');
    } finally {
      setBusy(false);
    }
  };

  const openAttempt = (attemptId: number) => {
    router.push(`/diagnostics/attempts/${attemptId}`);
  };

  if (loading) return <LinearProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!detail) return <EmptyState message="Test introuvable." />;

  const { test, competencies, questions } = detail;
  const t = results;

  return (
    <Box sx={{ pb: 6 }}>
      <PageHeader
        title={test.title}
        subtitle={`${test.className} · ${test.subjectName} · ${TEST_STATUS_LABELS[test.status]}`}
        action={
          canManage && test.status === 'draft' ? (
            <Button variant="contained" startIcon={<PlayArrowOutlinedIcon />} onClick={() => setConfirmAction({ action: 'publish', label: 'publier' })}>
              Publier
            </Button>
          ) : undefined
        }
      />

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Card sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Box sx={{ flex: 2 }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {test.description || 'Aucune description.'}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Durée : {test.durationMinutes ? `${test.durationMinutes} min` : 'non précisée'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Ouverture : {test.opensAt ?? '—'} · Fermeture : {test.closesAt ?? '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Seuils : intermédiaire ≥ {test.thresholdIntermediateMin}% · avancé ≥ {test.thresholdAdvancedMin}% · réponses min.{' '}
                {test.minAnsweredPct}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Créé par {test.authorName} le {new Date(test.createdAt).toLocaleDateString('fr-FR')}
              </Typography>
            </Stack>
          </Box>
        </Stack>
        {canManage && test.status !== 'archived' && test.status !== 'draft' && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={2}>
              {test.status === 'published' && (
                <Button size="small" onClick={() => setConfirmAction({ action: 'close', label: 'clôturer' })}>
                  Clôturer les passations
                </Button>
              )}
              <Button size="small" color="warning" onClick={() => setConfirmAction({ action: 'archive', label: 'archiver' })}>
                Archiver
              </Button>
            </Stack>
          </>
        )}
      </Card>

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Compétences ({competencies.length})
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {competencies.map((c) => (
            <Chip key={c.code} size="small" label={`${c.code} — ${c.name}`} />
          ))}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Questions ({questions.length}) — barème total :{' '}
          {questions.reduce((s, q) => s + Number(q.points), 0)} pts
        </Typography>
        <Stack spacing={1.5}>
          {questions.map((q, i) => (
            <Box key={q.id ?? i} sx={{ borderLeft: '3px solid', borderColor: 'divider', pl: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Q{i + 1}.
                </Typography>
                <Chip size="small" label={QUESTION_TYPE_LABELS[q.questionType]} />
                <Chip size="small" label={`${q.points} pt(s)`} variant="outlined" />
                {q.competencyCode && <Chip size="small" label={q.competencyCode} color="secondary" variant="outlined" />}
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {q.statement}
              </Typography>
              {q.options && (
                <Typography variant="caption" color="text.secondary" display="block">
                  Options : {q.options.join(' · ')}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Card>

      {test.status !== 'draft' && t && (
        <Card sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Suivi de la classe
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
            {canManage && test.status === 'published' && (
              <>
                <TextField
                  select
                  size="small"
                  label="Élève (passation)"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  sx={{ minWidth: 280 }}
                >
                  {t.roster
                    .filter((r) => !r.attemptId || r.status === 'in_progress')
                    .map((r) => (
                      <MenuItem key={r.studentId} value={r.studentId}>
                        {r.studentName} ({r.matricule}){r.attemptId ? ' — reprendre' : ''}
                      </MenuItem>
                    ))}
                </TextField>
                <Button variant="contained" disabled={!studentId || busy} onClick={startAttempt}>
                  Démarrer / reprendre
                </Button>
              </>
            )}
          </Stack>
          {t.roster.length === 0 ? (
            <EmptyState message="Aucun élève actif dans la classe de ce test." />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Élève</TableCell>
                    <TableCell>Matricule</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell align="center">Score</TableCell>
                    <TableCell align="center">%</TableCell>
                    <TableCell>Niveau</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.roster.map((r) => (
                    <TableRow
                      key={r.studentId}
                      hover
                      onClick={() => r.attemptId && openAttempt(r.attemptId)}
                      sx={{ cursor: r.attemptId ? 'pointer' : 'default' }}
                    >
                      <TableCell>{r.studentName}</TableCell>
                      <TableCell>{r.matricule}</TableCell>
                      <TableCell>
                        {r.status === 'submitted' ? 'Soumis' : r.status === 'in_progress' ? 'En cours' : 'Non commencé'}
                      </TableCell>
                      <TableCell align="center">{r.score !== null ? `${r.score}/${r.maxScore}` : '—'}</TableCell>
                      <TableCell align="center">{r.percentage !== null ? `${Number(r.percentage).toFixed(1)}%` : '—'}</TableCell>
                      <TableCell>
                        {r.level ? (
                          <Chip size="small" label={LEVEL_LABELS[r.level] ?? r.level} color={LEVEL_COLORS[r.level] ?? 'default'} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {t.competencies.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Résultats par compétence (tentatives exploitables)
              </Typography>
              <Stack spacing={1}>
                {t.competencies.map((c) => (
                  <Box key={c.code}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">
                        {c.code} — {c.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {c.pct !== null ? `${c.pct.toFixed(1)}%` : 'données insuffisantes'} · {c.masteredCount}/{c.attempts} maîtrisée(s)
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={c.pct ?? 0}
                      sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                      color={(c.pct ?? 0) >= 70 ? 'success' : (c.pct ?? 0) >= 40 ? 'primary' : 'warning'}
                    />
                  </Box>
                ))}
              </Stack>
            </>
          )}

          {t.difficulties.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Difficultés fréquentes (taux de réussite croissant)
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Question</TableCell>
                    <TableCell>Compétence</TableCell>
                    <TableCell align="center">Réponses</TableCell>
                    <TableCell align="center">Réussite</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.difficulties.map((d) => (
                    <TableRow key={d.questionId}>
                      <TableCell sx={{ maxWidth: 420 }}>{d.statement}</TableCell>
                      <TableCell>{d.competencyCode ?? '—'}</TableCell>
                      <TableCell align="center">{d.answeredCount}</TableCell>
                      <TableCell align="center">{Math.round(Number(d.successRatio) * 100)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Card>
      )}

      {test.status === 'draft' && (
        <Alert severity="info">
          Test en brouillon : publiez-le pour démarrer des passations. Le contenu reste modifiable tant qu’aucune passation
          n’existe.
        </Alert>
      )}

      <Box sx={{ mt: 3 }}>
        <Button component={Link} href="/diagnostics">
          Retour à la liste
        </Button>
      </Box>

      <ConfirmDialog
        open={confirmAction !== null}
        title={`Confirmer : ${confirmAction?.label ?? ''}`}
        message="Cette action est enregistrée et tracée. Le contenu d’un test publié n’est plus modifiable."
        confirmColor={confirmAction?.action === 'archive' ? 'warning' : 'primary'}
        loading={busy}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && runAction(confirmAction.action)}
        confirmLabel={confirmAction?.label ?? 'Confirmer'}
      />
    </Box>
  );
}
