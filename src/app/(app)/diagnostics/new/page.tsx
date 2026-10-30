'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import {
  DIAGNOSTIC_QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  loadFormOptions,
  loadSubjects,
  type ClassRow,
  type ClassSubject,
  type DiagnosticQuestionType,
  type SchoolYear,
} from '@/services/diagnostics';

interface CompDraft {
  code: string;
  name: string;
}

interface QuestionDraft {
  competencyCode: string;
  questionType: DiagnosticQuestionType;
  statement: string;
  points: number;
  options: string[];
  expectedText: string;
  expectedBool: string; // 'true' | 'false' | ''
  expectedIndex: string; // index pour choix unique
  expectedIndexes: string; // indexes séparés par virgules pour choix multiples
}

const emptyQuestion = (): QuestionDraft => ({
  competencyCode: '',
  questionType: 'single_choice',
  statement: '',
  points: 1,
  options: ['', ''],
  expectedText: '',
  expectedBool: '',
  expectedIndex: '0',
  expectedIndexes: '',
});

function buildExpected(q: QuestionDraft): { expected?: unknown; error?: string } {
  switch (q.questionType) {
    case 'true_false':
      if (q.expectedBool === '') return { error: 'Indiquez la réponse attendue (vrai ou faux).' };
      return { expected: q.expectedBool === 'true' };
    case 'short_answer': {
      const variants = q.expectedText
        .split('|')
        .map((v) => v.trim())
        .filter(Boolean);
      if (variants.length === 0) return { error: 'Indiquez au moins une réponse acceptée (séparez les variantes par « | »).' };
      return { expected: variants.length === 1 ? variants[0] : variants };
    }
    case 'single_choice': {
      const idx = Number(q.expectedIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.filter((o) => o.trim()).length) {
        return { error: 'Indiquez l’index de la bonne réponse.' };
      }
      return { expected: idx };
    }
    case 'multiple_choice': {
      const idxs = q.expectedIndexes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
      const max = q.options.filter((o) => o.trim()).length;
      if (idxs.length === 0 || idxs.some((i) => !Number.isInteger(i) || i < 0 || i >= max)) {
        return { error: 'Indiquez les indexes des bonnes réponses (séparés par des virgules).' };
      }
      return { expected: idxs };
    }
    default:
      return {};
  }
}

export default function NewDiagnosticPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('diagnostics.manage'));

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [year, setYear] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [duration, setDuration] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [thIntermediate, setThIntermediate] = useState('40');
  const [thAdvanced, setThAdvanced] = useState('70');
  const [minAnswered, setMinAnswered] = useState('50');

  const [comps, setComps] = useState<CompDraft[]>([{ code: '', name: '' }]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    // Options via /diagnostics/form-options : accessible aux professeurs
    // (leurs affectations) sans exposer /school-years ni /academics/classes.
    loadFormOptions()
      .then(({ years: list }) => {
        setYears(list);
        const active = list.find((y) => y.isActive);
        if (active) setYear(String(active.id));
      })
      .catch(() => setError('Impossible de charger les années scolaires.'));
  }, []);

  useEffect(() => {
    if (!year) return;
    setClassId('');
    setSubjectId('');
    loadFormOptions(Number(year))
      .then(({ classes: list }) => setClasses(list))
      .catch(() => setClasses([]));
  }, [year]);

  useEffect(() => {
    if (!classId) {
      setSubjects([]);
      return;
    }
    loadSubjects(Number(classId))
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [classId]);

  const compCodes = useMemo(() => comps.map((c) => c.code.trim()).filter(Boolean), [comps]);

  const validate = (): string | null => {
    if (!canManage) return 'Permission diagnostics.manage requise.';
    if (title.trim().length < 3) return 'Le titre doit compter au moins 3 caractères.';
    if (!year || !classId || !subjectId) return 'Année, classe et matière sont requises.';
    const codes = comps.map((c) => c.code.trim()).filter(Boolean);
    if (codes.length === 0) return 'Au moins une compétence (avec code) est requise.';
    if (new Set(codes).size !== codes.length) return 'Les codes de compétence doivent être uniques.';
    for (const c of comps) {
      if (c.code.trim() && c.name.trim().length < 2) return `Nom trop court pour la compétence « ${c.code} ».`;
    }
    if (questions.length === 0) return 'Au moins une question est requise.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q.statement.trim().length < 3) return `Question ${i + 1} : énoncé requis (3 caractères minimum).`;
      if (!(q.points >= 0 && q.points <= 100)) return `Question ${i + 1} : points invalides (0 à 100).`;
      if (q.competencyCode && !codes.includes(q.competencyCode)) {
        return `Question ${i + 1} : compétence inconnue.`;
      }
      if (q.questionType === 'single_choice' || q.questionType === 'multiple_choice') {
        const filled = q.options.filter((o) => o.trim()).length;
        if (filled < 2) return `Question ${i + 1} : au moins deux options sont requises.`;
        const built = buildExpected(q);
        if (built.error) return `Question ${i + 1} : ${built.error}`;
      }
      if (q.questionType === 'true_false' || q.questionType === 'short_answer') {
        const built = buildExpected(q);
        if (built.error) return `Question ${i + 1} : ${built.error}`;
      }
    }
    if (opensAt && closesAt && closesAt < opensAt) {
      return 'La date de fermeture doit suivre la date d’ouverture.';
    }
    if (Number(thAdvanced) < Number(thIntermediate)) {
      return 'Le seuil « avancé » doit être supérieur ou égal au seuil « intermédiaire ».';
    }
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ data: { id: number } }>('/diagnostics', {
        title: title.trim(),
        description: description.trim() || undefined,
        schoolYearId: Number(year),
        levelId: classes.find((c) => c.id === Number(classId))?.levelId,
        classId: Number(classId),
        subjectId: Number(subjectId),
        durationMinutes: duration ? Number(duration) : undefined,
        opensAt: opensAt ? `${opensAt} 00:00` : undefined,
        closesAt: closesAt ? `${closesAt} 23:59` : undefined,
        thresholdIntermediateMin: Number(thIntermediate),
        thresholdAdvancedMin: Number(thAdvanced),
        minAnsweredPct: Number(minAnswered),
        competencies: comps
          .filter((c) => c.code.trim())
          .map((c) => ({ code: c.code.trim(), name: c.name.trim() })),
        questions: questions.map((q, i) => {
          const built = buildExpected(q);
          return {
            competencyCode: q.competencyCode || undefined,
            displayOrder: i + 1,
            questionType: q.questionType,
            statement: q.statement.trim(),
            points: q.points,
            options:
              q.questionType === 'single_choice' || q.questionType === 'multiple_choice'
                ? q.options.map((o) => o.trim()).filter(Boolean)
                : undefined,
            expected: built.expected,
          };
        }),
      });
      router.push(`/diagnostics/${res.data.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <Box>
        <PageHeader title="Nouveau test diagnostique" />
        <Alert severity="warning">Vous n’avez pas la permission de créer des tests diagnostiques.</Alert>
      </Box>
    );
  }

  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  return (
    <Box sx={{ pb: 6 }}>
      <PageHeader title="Nouveau test diagnostique" subtitle="Test de positionnement par compétence" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Informations générales
        </Typography>
        <Stack spacing={2}>
          <TextField label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField
            label="Description / consignes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label="Année scolaire" value={year} onChange={(e) => setYear(e.target.value)} required sx={{ minWidth: 180 }}>
              {years.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Classe" value={classId} onChange={(e) => setClassId(e.target.value)} required sx={{ minWidth: 180 }} disabled={!year}>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.levelName})
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Matière" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required sx={{ minWidth: 180 }} disabled={!classId}>
              {subjects.map((s) => (
                <MenuItem key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Durée (minutes)"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              sx={{ width: 180 }}
              inputProps={{ min: 1, max: 480 }}
            />
            <TextField label="Ouverture" type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Fermeture" type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label="Seuil intermédiaire (%)" type="number" value={thIntermediate} onChange={(e) => setThIntermediate(e.target.value)} inputProps={{ min: 0, max: 100 }} sx={{ width: 200 }} />
            <TextField label="Seuil avancé (%)" type="number" value={thAdvanced} onChange={(e) => setThAdvanced(e.target.value)} inputProps={{ min: 0, max: 100 }} sx={{ width: 200 }} />
            <TextField
              label="Réponses min. pour conclure (%)"
              type="number"
              value={minAnswered}
              onChange={(e) => setMinAnswered(e.target.value)}
              inputProps={{ min: 0, max: 100 }}
              sx={{ width: 240 }}
              helperText="En dessous : niveau « données insuffisantes »"
            />
          </Stack>
        </Stack>
      </Card>

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Compétences mesurées
        </Typography>
        <Stack spacing={1.5}>
          {comps.map((c, i) => (
            <Stack key={i} direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <TextField
                label="Code (ex. C1)"
                value={c.code}
                onChange={(e) => setComps((cs) => cs.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))}
                sx={{ width: 160 }}
              />
              <TextField
                label="Nom de la compétence"
                value={c.name}
                onChange={(e) => setComps((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                fullWidth
              />
              <IconButton
                onClick={() => setComps((cs) => cs.filter((_, j) => j !== i))}
                disabled={comps.length <= 1}
                aria-label="Supprimer la compétence"
              >
                <DeleteOutlineOutlinedIcon />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button startIcon={<AddOutlinedIcon />} onClick={() => setComps((cs) => [...cs, { code: '', name: '' }])}>
              Ajouter une compétence
            </Button>
          </Box>
        </Stack>
      </Card>

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Questions et barème
        </Typography>
        <Stack spacing={3}>
          {questions.map((q, i) => (
            <Box key={i}>
              <Divider sx={{ mb: 2 }} />
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight={700}>
                  Question {i + 1}
                </Typography>
                <IconButton onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} disabled={questions.length <= 1} aria-label="Supprimer la question">
                  <DeleteOutlineOutlinedIcon />
                </IconButton>
              </Stack>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    select
                    label="Type"
                    value={q.questionType}
                    onChange={(e) => updateQuestion(i, { questionType: e.target.value as DiagnosticQuestionType })}
                    sx={{ width: 220 }}
                  >
                    {DIAGNOSTIC_QUESTION_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Compétence"
                    value={q.competencyCode}
                    onChange={(e) => updateQuestion(i, { competencyCode: e.target.value })}
                    sx={{ width: 220 }}
                  >
                    <MenuItem value="">(sans compétence)</MenuItem>
                    {compCodes.map((code) => (
                      <MenuItem key={code} value={code}>
                        {code}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Points"
                    type="number"
                    value={q.points}
                    onChange={(e) => updateQuestion(i, { points: Number(e.target.value) })}
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ width: 120 }}
                  />
                </Stack>
                <TextField
                  label="Énoncé"
                  value={q.statement}
                  onChange={(e) => updateQuestion(i, { statement: e.target.value })}
                  multiline
                  minRows={2}
                />
                {(q.questionType === 'single_choice' || q.questionType === 'multiple_choice') && (
                  <Stack spacing={1}>
                    {q.options.map((o, oi) => (
                      <TextField
                        key={oi}
                        label={`Option ${oi + 1}`}
                        value={o}
                        onChange={(e) => updateQuestion(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })}
                        size="small"
                      />
                    ))}
                    <Box>
                      <Button size="small" startIcon={<AddOutlinedIcon />} onClick={() => updateQuestion(i, { options: [...q.options, ''] })}>
                        Ajouter une option
                      </Button>
                    </Box>
                    {q.questionType === 'single_choice' ? (
                      <TextField
                        label="Index de la bonne réponse (0 = première option)"
                        type="number"
                        value={q.expectedIndex}
                        onChange={(e) => updateQuestion(i, { expectedIndex: e.target.value })}
                        size="small"
                        sx={{ width: 320 }}
                      />
                    ) : (
                      <TextField
                        label="Indexes des bonnes réponses (séparés par des virgules)"
                        value={q.expectedIndexes}
                        onChange={(e) => updateQuestion(i, { expectedIndexes: e.target.value })}
                        size="small"
                        sx={{ width: 380 }}
                      />
                    )}
                  </Stack>
                )}
                {q.questionType === 'true_false' && (
                  <TextField select label="Réponse attendue" value={q.expectedBool} onChange={(e) => updateQuestion(i, { expectedBool: e.target.value })} size="small" sx={{ width: 220 }}>
                    <MenuItem value="true">Vrai</MenuItem>
                    <MenuItem value="false">Faux</MenuItem>
                  </TextField>
                )}
                {q.questionType === 'short_answer' && (
                  <TextField
                    label="Réponse(s) acceptée(s) — séparez les variantes par « | »"
                    value={q.expectedText}
                    onChange={(e) => updateQuestion(i, { expectedText: e.target.value })}
                    size="small"
                    helperText="Comparaison sans accents, casse et espaces ignorés."
                  />
                )}
                {q.questionType === 'open' && (
                  <Alert severity="info">
                    Question ouverte : corrigée manuellement par le professeur après soumission. Aucun niveau n’est attribué tant
                    qu’une question ouverte reste non corrigée.
                  </Alert>
                )}
              </Stack>
            </Box>
          ))}
          <Box>
            <Button startIcon={<AddOutlinedIcon />} onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}>
              Ajouter une question
            </Button>
          </Box>
        </Stack>
      </Card>

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button onClick={() => router.back()} disabled={saving}>
          Annuler
        </Button>
        <Button variant="contained" onClick={() => setConfirmOpen(true)} disabled={saving}>
          Créer le test (brouillon)
        </Button>
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        title="Créer le test diagnostique"
        message={`${questions.length} question(s) et ${comps.filter((c) => c.code.trim()).length} compétence(s). Le test sera créé en brouillon.`}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          submit();
        }}
        confirmLabel="Créer"
      />
    </Box>
  );
}
