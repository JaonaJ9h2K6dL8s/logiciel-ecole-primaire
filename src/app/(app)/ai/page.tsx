'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';

// Assistant IA pédagogique : réservé aux professeurs autorisés
// (permission serveur pedagogical_ai.use). Toutes les réponses sont des
// propositions modifiables, jamais des contenus officiels.

type Task = 'course' | 'explain' | 'exercises' | 'analyze_errors' | 'fiche';

interface AiConfigInfo {
  provider: string;
  model: string | null;
  apiKeyEnv: boolean;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
}

interface DocumentInfo {
  id: number;
  originalName: string;
  extractionStatus: string;
  charCount: number | null;
}

interface ContentInfo {
  id: number;
  kind: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
}

interface Option {
  id: number;
  name: string;
}

const TASK_LABELS: Record<Task, string> = {
  course: 'Préparer un cours',
  explain: 'Expliquer une notion',
  exercises: 'Générer des exercices',
  analyze_errors: 'Analyser des erreurs',
  fiche: 'Fiche pédagogique',
};

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  generated: 'info',
  edited: 'warning',
  validated: 'success',
  archived: 'default',
};

/** Rendu générique et lisible d'un contenu structuré (proposition IA). */
function ContentRender({ content }: { content: Record<string, unknown> }) {
  const entries = Object.entries(content).filter(([k]) => k !== 'title');
  return (
    <Stack spacing={1.5}>
      {entries.map(([key, value]) => (
        <Box key={key}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ textTransform: 'capitalize' }}>
            {key.replace(/([A-Z])/g, ' $1')}
          </Typography>
          {Array.isArray(value) ? (
            typeof value[0] === 'object' && value[0] !== null ? (
              (value as Record<string, unknown>[]).map((item, i) => (
                <Box key={i} sx={{ borderLeft: 2, borderColor: 'divider', pl: 1.5, py: 0.5, mt: 0.5 }}>
                  {Object.entries(item).map(([k, v]) => (
                    <Typography key={k} variant="body2">
                      <b>{k}</b> : {String(v)}
                    </Typography>
                  ))}
                </Box>
              ))
            ) : (
              (value as unknown[]).map((item, i) => (
                <Typography key={i} variant="body2" component="div">
                  • {String(item)}
                </Typography>
              ))
            )
          ) : (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}

const EMPTY_FORM = {
  // contexte partagé
  subjectId: '',
  levelId: '',
  classId: '',
  language: 'fr',
  // course / exercises / analyze_errors
  topic: '',
  objectives: '',
  durationMinutes: '',
  difficulty: 'moyen',
  supportType: '',
  count: '10',
  answerType: 'mixte',
  // explain
  notion: '',
  comprehensionLevel: 'debutant',
  // analyze_errors
  responsesText: '',
  // fiche
  title: '',
  sourceDocumentId: '',
};

export default function AiAssistantPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const canManage = user?.permissions.includes('pedagogical_ai.manage') ?? false;

  const [tab, setTab] = useState<Task>('course');
  const [cfg, setCfg] = useState<AiConfigInfo | null>(null);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [levels, setLevels] = useState<Option[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [result, setResult] = useState<ContentInfo | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editJson, setEditJson] = useState('');
  const [useDoc, setUseDoc] = useState(false);

  const loadDocuments = useCallback(() => {
    api
      .get<{ items: DocumentInfo[] }>('/pedagogical-ai/documents?pageSize=20')
      .then((r) => setDocuments(r.items.filter((d) => d.extractionStatus === 'extracted')))
      .catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    api
      .get<{ config: AiConfigInfo }>('/pedagogical-ai/config')
      .then((res) => setCfg(res.config))
      .catch(() => setCfg(null));
    api.get<{ data: Option[] }>('/subjects').then((r) => setSubjects(r.data)).catch(() => setSubjects([]));
    api
      .get<{ data: { classes: Option[]; levels: Option[] } }>('/pedagogical-ai/form-options')
      .then((r) => {
        setClasses(r.data.classes);
        setLevels(r.data.levels);
      })
      .catch(() => {
        setClasses([]);
        setLevels([]);
      });
    loadDocuments();
  }, [loadDocuments]);

  const uploadFile = async (file: File) => {
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.upload<{ document: DocumentInfo & { extractionStatus: string } }>('/pedagogical-ai/documents', fd);
      if (res.document.extractionStatus !== 'extracted') {
        setError("L'extraction du texte a échoué pour ce fichier (OCR non disponible). Vous pouvez saisir le contenu manuellement.");
      } else {
        setSnack('Document importé et texte extrait.');
      }
      loadDocuments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur d'importation.");
    }
  };

  const generate = async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        task: tab,
        language: form.language,
        difficulty: form.difficulty,
        subjectId: form.subjectId === '' ? null : Number(form.subjectId),
        levelId: form.levelId === '' ? null : Number(form.levelId),
        classId: form.classId === '' ? null : Number(form.classId),
      };
      if (tab === 'course') {
        body.topic = form.topic;
        body.objectives = form.objectives || null;
        body.durationMinutes = form.durationMinutes === '' ? null : Number(form.durationMinutes);
        body.supportType = form.supportType || null;
        if (useDoc && form.sourceDocumentId !== '') body.sourceDocumentId = Number(form.sourceDocumentId);
      } else if (tab === 'explain') {
        body.notion = form.notion;
        body.comprehensionLevel = form.comprehensionLevel;
      } else if (tab === 'exercises') {
        body.topic = form.topic;
        body.objectives = form.objectives || null;
        body.durationMinutes = form.durationMinutes === '' ? null : Number(form.durationMinutes);
        body.count = Number(form.count);
        body.answerType = form.answerType;
      } else if (tab === 'analyze_errors') {
        body.topic = form.topic;
        body.anonymizedResponses = form.responsesText
          .split(/\n-{3,}\n|\n\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        body.title = form.title;
        body.durationMinutes = form.durationMinutes === '' ? null : Number(form.durationMinutes);
        if (useDoc && form.sourceDocumentId !== '') body.sourceDocumentId = Number(form.sourceDocumentId);
      }
      const res = await api.post<{ content: ContentInfo }>('/pedagogical-ai/generate', body);
      setResult(res.content);
      setSnack('Proposition générée et enregistrée en brouillon.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de génération.');
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!result) return;
    try {
      const parsed = JSON.parse(editJson) as Record<string, unknown>;
      const res = await api.patch<{ content: ContentInfo }>(`/pedagogical-ai/content/${result.id}`, { content: parsed });
      setResult(res.content);
      setEditOpen(false);
      setSnack('Brouillon modifié.');
    } catch (err) {
      setError(err instanceof SyntaxError ? 'JSON invalide.' : err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const setStatus = async (action: 'validate' | 'archive') => {
    if (!result) return;
    try {
      const res = await api.post<{ content: ContentInfo }>(`/pedagogical-ai/content/${result.id}/${action}`);
      setResult(res.content);
      setSnack(action === 'validate' ? 'Contenu validé pour usage pédagogique.' : 'Contenu archivé.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const exportResult = () => {
    if (!result) return;
    const text = `${result.title}\n\n${JSON.stringify(result.content, null, 2)}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.title.replace(/[^\w\s-]/g, '').slice(0, 60) || 'fiche'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const aiReady = cfg !== null && cfg.provider !== 'none';

  return (
    <Box>
      <PageHeader
        title="Assistant IA pédagogique"
        subtitle="Propositions de cours, exercices, explications et remédiation — à vérifier et adapter par le professeur"
        action={
          <Button variant="outlined" startIcon={<LibraryBooksOutlinedIcon />} onClick={() => router.push('/ai/library')}>
            Bibliothèque
          </Button>
        }
      />

      {!aiReady && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Assistant IA non configuré{canManage ? ' — configurez un fournisseur dans « Configuration IA ».' : '. Contactez l’administrateur (fournisseur non configuré sur le serveur).'} Les
          autres modules de l’application restent pleinement fonctionnels sans IA.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ p: 2 }}>
            <Tabs value={tab} onChange={(_e, v: Task) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
              {(Object.keys(TASK_LABELS) as Task[]).map((t) => (
                <Tab key={t} value={t} label={TASK_LABELS[t]} />
              ))}
            </Tabs>
            <Stack spacing={2}>
              {tab !== 'explain' && (
                <TextField
                  label={tab === 'fiche' ? 'Titre de la fiche' : 'Sujet / notion travaillée'}
                  required
                  value={tab === 'fiche' ? form.title : form.topic}
                  onChange={(e) => setForm(tab === 'fiche' ? { ...form, title: e.target.value } : { ...form, topic: e.target.value })}
                />
              )}
              {tab === 'explain' && (
                <Stack spacing={2}>
                  <TextField
                    label="Notion à expliquer"
                    required
                    value={form.notion}
                    onChange={(e) => setForm({ ...form, notion: e.target.value })}
                  />
                  <TextField
                    select
                    label="Niveau de complexité de l'explication"
                    value={form.comprehensionLevel}
                    onChange={(e) => setForm({ ...form, comprehensionLevel: e.target.value })}
                    helperText="Complexité de l'explication demandée — pas un jugement sur les élèves."
                  >
                    <MenuItem value="debutant">Débutant</MenuItem>
                    <MenuItem value="progression">En progression</MenuItem>
                    <MenuItem value="intermediaire">Intermédiaire</MenuItem>
                    <MenuItem value="avance">Avancé</MenuItem>
                  </TextField>
                </Stack>
              )}
              {tab === 'analyze_errors' && (
                <TextField
                  label="Réponses d'élèves (anonymisées — une réponse par bloc, séparées par une ligne vide)"
                  multiline
                  minRows={5}
                  value={form.responsesText}
                  onChange={(e) => setForm({ ...form, responsesText: e.target.value })}
                  helperText="N'indiquez AUCUN nom, matricule ou coordonnée : le serveur anonymise aussi matricules et téléphones par précaution."
                />
              )}
              {(tab === 'course' || tab === 'exercises') && (
                <TextField
                  label="Objectifs pédagogiques (facultatif)"
                  multiline
                  minRows={2}
                  value={form.objectives}
                  onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                />
              )}
              {tab === 'course' && (
                <TextField
                  label="Type de support souhaité (facultatif)"
                  value={form.supportType}
                  onChange={(e) => setForm({ ...form, supportType: e.target.value })}
                  helperText="Ex. : fiche élève, affiche, trace écrite…"
                />
              )}
              {tab === 'exercises' && (
                <Grid container spacing={2}>
                  <Grid size={6}>
                    <TextField
                      select
                      fullWidth
                      label="Type de réponse"
                      value={form.answerType}
                      onChange={(e) => setForm({ ...form, answerType: e.target.value })}
                    >
                      <MenuItem value="ouverte">Ouverte</MenuItem>
                      <MenuItem value="qcm">QCM</MenuItem>
                      <MenuItem value="mixte">Mixte</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      type="number"
                      fullWidth
                      label="Nombre de questions"
                      inputProps={{ min: 1, max: 30 }}
                      value={form.count}
                      onChange={(e) => setForm({ ...form, count: e.target.value })}
                    />
                  </Grid>
                </Grid>
              )}
              {tab !== 'analyze_errors' && tab !== 'explain' && (
                <Grid container spacing={2}>
                  <Grid size={6}>
                    <TextField
                      select
                      fullWidth
                      label="Difficulté"
                      value={form.difficulty}
                      onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    >
                      <MenuItem value="facile">Facile</MenuItem>
                      <MenuItem value="moyen">Moyen</MenuItem>
                      <MenuItem value="difficile">Difficile</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={6}>
                    <TextField
                      type="number"
                      fullWidth
                      label="Durée (min)"
                      inputProps={{ min: 5, max: 300 }}
                      value={form.durationMinutes}
                      onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                    />
                  </Grid>
                </Grid>
              )}

              <Divider />
              <Typography variant="caption" color="text.secondary">
                Contexte (facultatif)
              </Typography>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField
                    select
                    fullWidth
                    label="Matière"
                    value={form.subjectId}
                    onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                  >
                    <MenuItem value="">—</MenuItem>
                    {subjects.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={6}>
                  <TextField
                    select
                    fullWidth
                    label="Niveau"
                    value={form.levelId}
                    onChange={(e) => setForm({ ...form, levelId: e.target.value })}
                  >
                    <MenuItem value="">—</MenuItem>
                    {levels.map((l) => (
                      <MenuItem key={l.id} value={l.id}>
                        {l.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={6}>
                  <TextField select fullWidth label="Classe" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                    <MenuItem value="">—</MenuItem>
                    {classes.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={6}>
                  <TextField select fullWidth label="Langue" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                    <MenuItem value="fr">Français</MenuItem>
                    <MenuItem value="mg">Malagasy</MenuItem>
                    <MenuItem value="en">English</MenuItem>
                  </TextField>
                </Grid>
              </Grid>

              {(tab === 'course' || tab === 'fiche') && (
                <>
                  <Divider />
                  <Typography variant="caption" color="text.secondary">
                    Support importé (facultatif)
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button component="label" variant="outlined" size="small" startIcon={<UploadFileOutlinedIcon />} disabled={!aiReady}>
                      Importer PDF / DOCX / TXT
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.docx,.txt,application/pdf,text/plain"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadFile(f);
                          e.target.value = '';
                        }}
                      />
                    </Button>
                    <FormControlLabel
                      control={<Checkbox checked={useDoc} onChange={(e) => setUseDoc(e.target.checked)} size="small" />}
                      label="Utiliser comme source"
                    />
                  </Stack>
                  {documents.length > 0 && (
                    <TextField
                      select
                      size="small"
                      label="Document source"
                      value={form.sourceDocumentId}
                      onChange={(e) => setForm({ ...form, sourceDocumentId: e.target.value })}
                      helperText="Le texte extrait est transmis au fournisseur IA ; vérifiez-le avant usage."
                    >
                      <MenuItem value="">Aucun</MenuItem>
                      {documents.map((d) => (
                        <MenuItem key={d.id} value={d.id}>
                          {d.originalName} ({d.charCount ?? 0} car.)
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </>
              )}

              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
                disabled={loading || !aiReady}
                onClick={generate}
              >
                {loading ? 'Génération en cours…' : 'Générer une proposition'}
              </Button>
            </Stack>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ p: 2, minHeight: 300 }}>
            {result ? (
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Typography variant="h6" fontWeight={800}>
                    {result.title}
                  </Typography>
                  <Chip size="small" label={result.status} color={STATUS_COLORS[result.status] ?? 'default'} variant="outlined" />
                </Stack>
                <Alert severity="info" icon={false}>
                  Proposition générée par IA : vérifiez les faits, les calculs et l’adéquation au programme avant tout usage pédagogique.
                </Alert>
                <ContentRender content={result.content} />
                <Divider />
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditJson(JSON.stringify(result.content, null, 2));
                      setEditOpen(true);
                    }}
                  >
                    Modifier (JSON)
                  </Button>
                  <Button size="small" onClick={exportResult}>
                    Exporter (.txt)
                  </Button>
                  <Button size="small" color="success" disabled={result.status === 'validated' || result.status === 'archived'} onClick={() => setStatus('validate')}>
                    Valider
                  </Button>
                  <Button size="small" color="warning" disabled={result.status === 'archived'} onClick={() => setStatus('archive')}>
                    Archiver
                  </Button>
                </Stack>
                {editOpen && (
                  <Box>
                    <TextField
                      label="Contenu JSON modifiable"
                      multiline
                      fullWidth
                      minRows={12}
                      value={editJson}
                      onChange={(e) => setEditJson(e.target.value)}
                      sx={{ fontFamily: 'monospace' }}
                    />
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button variant="contained" size="small" onClick={saveEdit}>
                        Enregistrer
                      </Button>
                      <Button size="small" onClick={() => setEditOpen(false)}>
                        Annuler
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Stack>
            ) : (
              <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 260 }} spacing={1}>
                <AutoAwesomeOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                <Typography color="text.secondary">
                  {loading ? 'Génération de la proposition…' : 'Aucune proposition — complétez le formulaire puis générez.'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Chaque génération est enregistrée en brouillon dans votre bibliothèque pédagogique.
                </Typography>
              </Stack>
            )}
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
