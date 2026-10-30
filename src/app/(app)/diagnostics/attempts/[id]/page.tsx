'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import EmptyState from '@/components/admin/EmptyState';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  QUESTION_TYPE_LABELS,
  loadAttemptDetail,
  type AttemptAnswer,
  type AttemptDetail,
  type DiagnosticQuestionType,
} from '@/services/diagnostics';

interface FlatQuestion {
  answerId: number | null;
  questionId: number;
  statement: string;
  questionType: DiagnosticQuestionType;
  points: number;
  competencyCode: string | null;
  options: string[] | null;
  answer: unknown;
  isCorrect: number | null;
  pointsEarned: string | null;
  manuallyGraded: boolean;
}

export default function DiagnosticAttemptPage() {
  const params = useParams<{ id: string }>();
  const attemptId = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('diagnostics.manage'));

  const [data, setData] = useState<AttemptDetail | null>(null);
  const [values, setValues] = useState<Record<number, unknown>>({});
  const [grades, setGrades] = useState<Record<number, { points: string; correct: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadAttemptDetail(attemptId);
      setData(d);
      const v: Record<number, unknown> = {};
      for (const a of d.answers) v[a.questionId] = a.answer;
      setValues(v);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    if (Number.isFinite(attemptId)) load();
  }, [load, attemptId]);

  const questions: FlatQuestion[] = useMemo(() => {
    if (!data) return [];
    const fromAnswers: FlatQuestion[] = data.answers.map((a: AttemptAnswer) => ({
      answerId: a.id,
      questionId: a.questionId,
      statement: a.statement,
      questionType: a.questionType,
      points: Number(a.points),
      competencyCode: a.competencyCode,
      options: a.options,
      answer: a.answer,
      isCorrect: a.isCorrect,
      pointsEarned: a.pointsEarned,
      manuallyGraded: Boolean(a.manuallyGraded),
    }));
    const known = new Set(fromAnswers.map((q) => q.questionId));
    const fromMissing = data.missingQuestions.map((m) => ({
      answerId: null,
      questionId: m.questionId,
      statement: m.statement,
      questionType: m.questionType ?? 'open',
      points: Number(m.points),
      competencyCode: null,
      options: m.optionsJson ? JSON.parse(m.optionsJson) : null,
      answer: null,
      isCorrect: null,
      pointsEarned: null,
      manuallyGraded: false,
    }));
    return [...fromAnswers, ...fromMissing.filter((m) => !known.has(m.questionId))].sort(
      (a, b) => a.questionId - b.questionId
    );
  }, [data]);

  const inProgress = data?.attempt.status === 'in_progress';

  const saveProgress = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = Object.entries(values).map(([qid, value]) => ({ questionId: Number(qid), value: value ?? null }));
      await api.put(`/diagnostics/attempts/${attemptId}/answers`, { answers: payload });
      setInfo('Progression enregistrée.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = Object.entries(values).map(([qid, value]) => ({ questionId: Number(qid), value: value ?? null }));
      await api.put(`/diagnostics/attempts/${attemptId}/answers`, { answers: payload });
      const res = await api.post<{ data: { level: string | null } }>(`/diagnostics/attempts/${attemptId}/submit`);
      setConfirmSubmit(false);
      setInfo(`Test soumis. Niveau : ${res.data.level ? LEVEL_LABELS[res.data.level] ?? res.data.level : 'données insuffisantes'}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la soumission.');
    } finally {
      setBusy(false);
    }
  };

  const saveGrades = async () => {
    if (!data) return;
    const pending = questions.filter(
      (q) => q.questionType === 'open' && q.isCorrect === null && grades[q.questionId]
    );
    if (pending.length === 0) {
      setError('Aucune correction nouvelle à enregistrer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/diagnostics/attempts/${attemptId}/grade`, {
        grades: pending.map((q) => ({
          answerId: q.answerId,
          pointsEarned: Number(grades[q.questionId].points || 0),
          isCorrect: grades[q.questionId].correct,
        })),
      });
      setGrades({});
      setInfo('Correction enregistrée, résultat recalculé.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la correction.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LinearProgress />;
  if (error && !data) return <Alert severity="error">{error}</Alert>;
  if (!data) return <EmptyState message="Tentative introuvable." />;

  const a = data.attempt;

  return (
    <Box sx={{ pb: 6 }}>
      <PageHeader
        title={a.testTitle}
        subtitle={`Élève : ${a.studentName} (${a.matricule}) · ${a.status === 'submitted' ? 'Soumis' : 'En cours'}`}
        action={
          <Button component={Link} href={`/diagnostics/${a.testId}`}>
            Voir le test
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo(null)}>
          {info}
        </Alert>
      )}

      {a.status === 'submitted' && (
        <Card sx={{ p: 3, mb: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" fontWeight={800}>
                {a.score !== null ? `${Number(a.score)}/${Number(a.maxScore)}` : '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {a.percentage !== null ? `${Number(a.percentage).toFixed(1)}% de réussite` : ''}
              </Typography>
            </Box>
            <Chip
              size="medium"
              label={`Niveau : ${a.level ? LEVEL_LABELS[a.level] ?? a.level : 'non attribué'}`}
              color={a.level ? LEVEL_COLORS[a.level] ?? 'default' : 'default'}
            />
            <Box sx={{ flex: 2 }}>
              {(a.results?.competencies ?? []).map((c) => (
                <Box key={c.code} sx={{ mb: 0.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption">
                      {c.code} — {c.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.pct !== null ? `${c.pct.toFixed(0)}%` : '—'}
                      {c.mastered === true ? ' · maîtrisée' : c.mastered === false ? ' · à renforcer' : ''}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={c.pct ?? 0}
                    sx={{ height: 6, borderRadius: 3 }}
                    color={(c.pct ?? 0) >= 70 ? 'success' : (c.pct ?? 0) >= 40 ? 'primary' : 'warning'}
                  />
                </Box>
              ))}
            </Box>
          </Stack>
        </Card>
      )}

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Questions ({questions.length}) — répondues : {a.answeredCount}
        </Typography>
        {inProgress && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Saisissez les réponses de l’élève. Enregistrez la progression régulièrement. La soumission calcule
            définitivement le résultat côté serveur.
          </Typography>
        )}
        <Stack spacing={3}>
          {questions.map((q, i) => (
            <Box key={q.questionId}>
              <Divider sx={{ mb: 1.5 }} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="body2" fontWeight={700}>
                  Q{i + 1}.
                </Typography>
                <Chip size="small" label={QUESTION_TYPE_LABELS[q.questionType]} />
                <Chip size="small" label={`${q.points} pt(s)`} variant="outlined" />
                {q.competencyCode && <Chip size="small" label={q.competencyCode} color="secondary" variant="outlined" />}
                {q.isCorrect === 1 && <Chip size="small" color="success" label={`+${q.pointsEarned ?? q.points}`} />}
                {q.isCorrect === 0 && <Chip size="small" color="error" label={`0/${q.points}`} />}
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                {q.statement}
              </Typography>

              {inProgress ? (
                <>
                  {(q.questionType === 'single_choice' || q.questionType === 'multiple_choice') && q.options && (
                    q.questionType === 'single_choice' ? (
                      <RadioGroup
                        value={String(values[q.questionId] ?? '')}
                        onChange={(_, v) => setValues((vs) => ({ ...vs, [q.questionId]: Number(v) }))}
                      >
                        {q.options.map((o, oi) => (
                          <FormControlLabel key={oi} value={String(oi)} control={<Radio />} label={o} />
                        ))}
                      </RadioGroup>
                    ) : (
                      <Stack>
                        {q.options.map((o, oi) => {
                          const arr = Array.isArray(values[q.questionId]) ? (values[q.questionId] as number[]) : [];
                          return (
                            <FormControlLabel
                              key={oi}
                              control={
                                <Checkbox
                                  checked={arr.includes(oi)}
                                  onChange={(e) =>
                                    setValues((vs) => ({
                                      ...vs,
                                      [q.questionId]: e.target.checked ? [...arr, oi] : arr.filter((x) => x !== oi),
                                    }))
                                  }
                                />
                              }
                              label={o}
                            />
                          );
                        })}
                      </Stack>
                    )
                  )}
                  {q.questionType === 'true_false' && (
                    <RadioGroup
                      value={String(values[q.questionId] ?? '')}
                      onChange={(_, v) => setValues((vs) => ({ ...vs, [q.questionId]: v === 'true' }))}
                    >
                      <FormControlLabel value="true" control={<Radio />} label="Vrai" />
                      <FormControlLabel value="false" control={<Radio />} label="Faux" />
                    </RadioGroup>
                  )}
                  {(q.questionType === 'short_answer' || q.questionType === 'open') && (
                    <TextField
                      fullWidth
                      size="small"
                      multiline={q.questionType === 'open'}
                      minRows={q.questionType === 'open' ? 3 : 1}
                      value={typeof values[q.questionId] === 'string' ? (values[q.questionId] as string) : ''}
                      onChange={(e) => setValues((vs) => ({ ...vs, [q.questionId]: e.target.value }))}
                      label={q.questionType === 'open' ? 'Réponse de l’élève (correction manuelle ultérieure)' : 'Réponse'}
                    />
                  )}
                </>
              ) : (
                <Box>
                  <Typography variant="body2">
                    Réponse :{' '}
                    {q.answer === null || q.answer === undefined ? (
                      <em>non renseignée</em>
                    ) : typeof q.answer === 'boolean' ? (
                      q.answer ? 'Vrai' : 'Faux'
                    ) : Array.isArray(q.answer) && q.options ? (
                      q.answer.map((idx) => q.options?.[Number(idx)] ?? idx).join(', ')
                    ) : typeof q.answer === 'number' && q.options ? (
                      q.options[q.answer] ?? q.answer
                    ) : (
                      String(q.answer)
                    )}
                  </Typography>
                  {q.questionType === 'open' && q.isCorrect === null && canManage && q.answerId && (
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 1 }} alignItems="center">
                      <TextField
                        size="small"
                        label={`Points attribués (0–${q.points})`}
                        type="number"
                        value={grades[q.questionId]?.points ?? ''}
                        onChange={(e) =>
                          setGrades((g) => ({
                            ...g,
                            [q.questionId]: { points: e.target.value, correct: g[q.questionId]?.correct ?? false },
                          }))
                        }
                        inputProps={{ min: 0, max: q.points }}
                        sx={{ width: 220 }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={grades[q.questionId]?.correct ?? false}
                            onChange={(e) =>
                              setGrades((g) => ({
                                ...g,
                                [q.questionId]: { points: g[q.questionId]?.points ?? '', correct: e.target.checked },
                              }))
                            }
                          />
                        }
                        label="Réponse correcte"
                      />
                    </Stack>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      </Card>

      {inProgress && (
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button startIcon={<SaveOutlinedIcon />} onClick={saveProgress} disabled={busy}>
            Enregistrer la progression
          </Button>
          <Button variant="contained" startIcon={<SendOutlinedIcon />} onClick={() => setConfirmSubmit(true)} disabled={busy}>
            Soumettre et calculer
          </Button>
        </Stack>
      )}

      {a.status === 'submitted' && canManage && a.level === 'insufficient_data' && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Résultat « données insuffisantes » : corrigez les questions ouvertes restantes ou complétez la passation (le
          nombre de réponses doit atteindre le seuil du test) pour attribuer un niveau.
        </Alert>
      )}
      {a.status === 'submitted' && canManage && (
        <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2 }}>
          {Object.keys(grades).length > 0 && (
            <Button variant="contained" onClick={saveGrades} disabled={busy}>
              Enregistrer la correction et recalculer
            </Button>
          )}
        </Stack>
      )}

      {data.progression.length > 1 && (
        <Card sx={{ p: 3, mt: 3 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Progression de l’élève (même matière)
          </Typography>
          <Stack spacing={1}>
            {data.progression.map((p) => (
              <Stack key={p.id} direction="row" justifyContent="space-between" alignItems="center">
                <Button component={Link} href={`/diagnostics/attempts/${p.id}`} size="small" sx={{ textTransform: 'none' }}>
                  {p.title}
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {p.score !== null ? `${Number(p.score)}/${Number(p.maxScore)}` : '—'}
                  {p.percentage !== null ? ` (${Number(p.percentage).toFixed(1)}%)` : ''} ·{' '}
                  {p.level ? LEVEL_LABELS[p.level] ?? p.level : '—'} ·{' '}
                  {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString('fr-FR') : ''}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Card>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        title="Soumettre le test"
        message="La soumission est définitive : les résultats sont calculés côté serveur et ne peuvent plus être modifiés automatiquement. Continuer ?"
        onClose={() => setConfirmSubmit(false)}
        onConfirm={submit}
        confirmLabel="Soumettre"
        loading={busy}
      />
    </Box>
  );
}
