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
  Divider,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import ArrowUpwardOutlinedIcon from '@mui/icons-material/ArrowUpwardOutlined';
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type HomeworkDetail,
  type QuestionType,
} from '@/services/homework';

interface QuestionItem {
  question_type: QuestionType;
  statement: string;
  instructions: string;
  points: string;
  options: string[];
  expected_answer: string;
  pedagogical_explanation: string;
}

interface QuestionsResponse {
  data: {
    questions: {
      id: number;
      display_order: number;
      question_type: QuestionType;
      statement: string;
      instructions: string | null;
      points: string | null;
      options_json: string | null;
      expected_answer?: string | null;
      pedagogical_explanation?: string | null;
    }[];
    answersVisible: boolean;
    pointsTotal: number | null;
  };
}

const emptyQuestion = (): QuestionItem => ({
  question_type: 'free_text',
  statement: '',
  instructions: '',
  points: '',
  options: [],
  expected_answer: '',
  pedagogical_explanation: '',
});

function toForm(q: QuestionsResponse['data']['questions'][number]): QuestionItem {
  let options: string[] = [];
  if (q.options_json) {
    try {
      const parsed = JSON.parse(q.options_json);
      if (Array.isArray(parsed)) options = parsed.map(String);
    } catch {
      options = [];
    }
  }
  return {
    question_type: q.question_type,
    statement: q.statement,
    instructions: q.instructions ?? '',
    points: q.points !== null && q.points !== undefined ? String(Number(q.points)) : '',
    options,
    expected_answer: q.expected_answer ?? '',
    pedagogical_explanation: q.pedagogical_explanation ?? '',
  };
}

export default function HomeworkQuestionsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('homework.manage'));

  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [answersVisible, setAnswersVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hwRes, qRes] = await Promise.all([
        api.get<{ data: HomeworkDetail }>(`/homework/${id}`),
        api.get<QuestionsResponse>(`/homework/${id}/questions`).then((r) => r.data),
      ]);
      setHw(hwRes.data);
      setQuestions(qRes.questions.map(toForm));
      setAnswersVisible(qRes.answersVisible);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (index: number, patch: Partial<QuestionItem>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const move = (index: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const localTotal = questions.reduce((acc, q) => acc + (q.points ? Number(q.points) : 0), 0);
  const maxScore = hw?.max_score ? Number(hw.max_score) : null;
  const scaleMismatch =
    maxScore !== null &&
    maxScore > 0 &&
    questions.some((q) => q.points) &&
    Math.abs(localTotal - maxScore) > 0.01;

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.put(`/homework/${id}/questions`, {
        questions: questions.map((q) => ({
          question_type: q.question_type,
          statement: q.statement.trim(),
          instructions: q.instructions.trim() || null,
          points: q.points === '' ? null : Number(q.points),
          options:
            q.question_type === 'mcq' || q.question_type === 'true_false'
              ? q.options.filter((o) => o.trim()).length > 0
                ? q.options.filter((o) => o.trim())
                : null
              : null,
          expected_answer: q.expected_answer.trim() || null,
          pedagogical_explanation: q.pedagogical_explanation.trim() || null,
        })),
      });
      setNotice('Questions enregistrées.');
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
      setNotice('Corrections publiées : elles sont désormais visibles aux utilisateurs autorisés.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la publication.');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Chargement…</Typography>;
  if (error && !hw) {
    return (
      <Box>
        <PageHeader title="Questions" />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!hw) return null;

  const editable = canManage && hw.status !== 'closed' && hw.status !== 'archived';

  return (
    <Box sx={{ maxWidth: 950 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={Link} href="/homework" underline="hover">
          Devoirs
        </MuiLink>
        <MuiLink component={Link} href={`/homework/${hw.id}`} underline="hover">
          {hw.title}
        </MuiLink>
        <Typography color="text.primary">Questions</Typography>
      </Breadcrumbs>

      <PageHeader
        title="Questions et barème"
        subtitle={`${hw.className} · ${hw.subjectName}${maxScore ? ` · barème ${maxScore} pts` : ''}`}
        action={
          <Stack direction="row" spacing={1}>
            <Chip
              size="small"
              label={`Total points : ${Math.round(localTotal * 100) / 100}`}
              color={scaleMismatch ? 'error' : 'default'}
              variant="outlined"
            />
            {hw.corrections_published === 1 ? (
              <Chip size="small" color="success" label="Corrections publiées" />
            ) : (
              editable && (
                <Button
                  size="small"
                  startIcon={<PublishOutlinedIcon />}
                  onClick={() => setConfirmOpen(true)}
                  disabled={busy}
                >
                  Publier les corrections
                </Button>
              )
            )}
          </Stack>
        }
      />

      {!answersVisible && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Les réponses attendues ne sont pas visibles : elles seront accessibles après publication des
          corrections (ou pour l’auteur du devoir et l’administration).
        </Alert>
      )}
      {scaleMismatch && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Le total des points ({Math.round(localTotal * 100) / 100}) ne correspond pas au barème ({maxScore}).
        </Alert>
      )}
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

      {editable && (
        <Button
          startIcon={<AddOutlinedIcon />}
          variant="outlined"
          sx={{ mb: 2 }}
          onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
        >
          Ajouter une question
        </Button>
      )}

      {questions.length === 0 ? (
        <Card sx={{ p: 3 }}>
          <Typography color="text.secondary">
            Aucune question pour ce devoir{editable ? ' — ajoutez-en pour préparer le sujet.' : '.'}
          </Typography>
        </Card>
      ) : (
        <Stack spacing={2}>
          {questions.map((q, i) => (
            <Card key={i} sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Question {i + 1}
                </Typography>
                {editable && (
                  <Stack direction="row">
                    <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">
                      <ArrowUpwardOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => move(i, 1)}
                      disabled={i === questions.length - 1}
                      aria-label="Descendre"
                    >
                      <ArrowDownwardOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Supprimer"
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                )}
              </Stack>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    select
                    label="Type"
                    value={q.question_type}
                    onChange={(e) => update(i, { question_type: e.target.value as QuestionType })}
                    size="small"
                    sx={{ minWidth: 220 }}
                    disabled={!editable}
                  >
                    {QUESTION_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Points (facultatif)"
                    type="number"
                    value={q.points}
                    onChange={(e) => update(i, { points: e.target.value })}
                    size="small"
                    sx={{ width: 160 }}
                    inputProps={{ min: 0, step: '0.5' }}
                    disabled={!editable}
                  />
                </Stack>
                <TextField
                  label="Énoncé"
                  value={q.statement}
                  onChange={(e) => update(i, { statement: e.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                  size="small"
                  disabled={!editable}
                />
                <TextField
                  label="Consignes (facultatif)"
                  value={q.instructions}
                  onChange={(e) => update(i, { instructions: e.target.value })}
                  multiline
                  minRows={1}
                  fullWidth
                  size="small"
                  disabled={!editable}
                />
                {(q.question_type === 'mcq' || q.question_type === 'true_false') && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Options (une par ligne)
                    </Typography>
                    <TextField
                      value={q.options.join('\n')}
                      onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                      multiline
                      minRows={q.question_type === 'true_false' ? 2 : 3}
                      fullWidth
                      size="small"
                      placeholder={q.question_type === 'true_false' ? 'Vrai\nFaux' : 'Proposition A\nProposition B'}
                      disabled={!editable}
                    />
                  </Box>
                )}
                {answersVisible && (
                  <>
                    <TextField
                      label="Réponse attendue / correction"
                      value={q.expected_answer}
                      onChange={(e) => update(i, { expected_answer: e.target.value })}
                      multiline
                      minRows={2}
                      fullWidth
                      size="small"
                      disabled={!editable}
                    />
                    <TextField
                      label="Explication pédagogique (facultatif)"
                      value={q.pedagogical_explanation}
                      onChange={(e) => update(i, { pedagogical_explanation: e.target.value })}
                      multiline
                      minRows={1}
                      fullWidth
                      size="small"
                      disabled={!editable}
                    />
                  </>
                )}
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {editable && questions.length > 0 && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            onClick={save}
            disabled={busy || questions.some((q) => !q.statement.trim())}
          >
            Enregistrer les questions
          </Button>
        </Box>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Publier les corrections ?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Les réponses attendues et explications deviendront visibles pour les utilisateurs autorisés.
            Cette action est définitive.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={publishCorrections} disabled={busy}>
            Publier
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
