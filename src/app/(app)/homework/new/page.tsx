'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import {
  HOMEWORK_TYPES,
  HOMEWORK_TYPE_LABELS,
  loadFormOptions,
  loadSubjects,
  todayAppTz,
  type ClassRow,
  type SchoolYear,
  type ClassSubject,
} from '@/services/homework';

export default function NewHomeworkPage() {
  const router = useRouter();

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [homeworkType, setHomeworkType] = useState<string>('homework');
  const [publishDate, setPublishDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [publish, setPublish] = useState(false);
  const [notifyClass, setNotifyClass] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Options via /homework/form-options : accessible aux professeurs
    // (leurs affectations) sans exposer /school-years ni /academics/classes.
    loadFormOptions()
      .then(({ years: list }) => {
        setYears(list);
        const active = list.find((y) => y.isActive);
        if (active) setYearId(String(active.id));
      })
      .catch(() => setError("Impossible de charger les années scolaires."));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setClassId('');
    setSubjectId('');
    loadFormOptions(Number(yearId))
      .then(({ classes: list }) => setClasses(list))
      .catch(() => setClasses([]));
  }, [yearId]);

  useEffect(() => {
    if (!classId) {
      setSubjects([]);
      return;
    }
    setSubjectId('');
    loadSubjects(Number(classId))
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [classId]);

  const dateError = useMemo(
    () => Boolean(publishDate && dueDate && dueDate < publishDate),
    [publishDate, dueDate]
  );

  const canSubmit = yearId && classId && subjectId && title.trim() && !dateError && !saving;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ data: { id: number } }>('/homework', {
        school_year_id: Number(yearId),
        class_id: Number(classId),
        subject_id: Number(subjectId),
        title: title.trim(),
        description: description.trim() || null,
        homework_type: homeworkType,
        publish_date: publishDate || null,
        due_date: dueDate || null,
        estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
        max_score: maxScore ? Number(maxScore) : null,
        publish,
        notify_class: publish && notifyClass,
      });
      router.push(`/homework/${res.data.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900 }}>
      <PageHeader
        title="Nouveau devoir"
        subtitle="Un devoir pédagogique reste distinct des évaluations officielles."
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 3 }}>
        <Stack spacing={3}>
          <TextField
            label="Titre du devoir"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            fullWidth
            inputProps={{ maxLength: 180 }}
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Année scolaire"
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                required
                fullWidth
                size="small"
              >
                {years.map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Classe"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                required
                fullWidth
                size="small"
                disabled={!yearId}
                helperText="La classe doit appartenir à l'année sélectionnée."
              >
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Matière"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                fullWidth
                size="small"
                disabled={!classId}
                helperText="Matières rattachées à la classe."
              >
                {subjects.map((s) => (
                  <MenuItem key={s.subjectId} value={s.subjectId}>
                    {s.subjectName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <TextField
            select
            label="Type de devoir"
            value={homeworkType}
            onChange={(e) => setHomeworkType(e.target.value)}
            fullWidth
            size="small"
          >
            {HOMEWORK_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {HOMEWORK_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Description et consignes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            fullWidth
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Date de publication"
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: todayAppTz() }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Date limite"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                fullWidth
                size="small"
                error={dateError}
                helperText={dateError ? 'Ne peut pas précéder la publication.' : ' '}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Durée estimée (min)"
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ min: 1, max: 600 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Barème (facultatif)"
                type="number"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ min: 0, step: '0.5' }}
                helperText="Le total des questions devra correspondre."
              />
            </Grid>
          </Grid>

          <Stack>
            <FormControlLabel
              control={<Checkbox checked={publish} onChange={(e) => setPublish(e.target.checked)} />}
              label="Publier immédiatement (sinon enregistré comme brouillon)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyClass}
                  onChange={(e) => setNotifyClass(e.target.checked)}
                  disabled={!publish}
                />
              }
              label="Créer une annonce interne pour la classe (aucun message externe n'est envoyé)"
            />
          </Stack>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button onClick={() => router.back()} disabled={saving}>
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!canSubmit}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              Enregistrer
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Les règles métier (classe de l’année, affectation du professeur, cohérence des dates) sont
            revérifiées côté serveur.
          </Typography>
        </Stack>
      </Card>
    </Box>
  );
}
