'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { ApiError } from '@/services/api';
import {
  LEVEL_LABELS,
  TEST_STATUS_LABELS,
  loadDiagnosticTests,
  loadFormOptions,
  type ClassRow,
  type DiagnosticTestRow,
  type SchoolYear,
} from '@/services/diagnostics';

const STATUS_CHIP: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  published: 'info',
  closed: 'success',
  archived: 'default',
};

export default function DiagnosticsListPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('diagnostics.manage'));

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  const [year, setYear] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');

  const [items, setItems] = useState<DiagnosticTestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    loadFormOptions(Number(year))
      .then(({ classes: list }) => setClasses(list))
      .catch(() => setClasses([]));
  }, [year]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadDiagnosticTests({
        schoolYearId: year || undefined,
        classId: classId || undefined,
        status: status || undefined,
      });
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, classId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <PageHeader
        title="Tests diagnostiques"
        subtitle="Positionnement des élèves par compétence — distinct des notes de bulletin"
        action={
          canManage ? (
            <Button href="/diagnostics/new" variant="contained" startIcon={<AddOutlinedIcon />}>
              Nouveau test
            </Button>
          ) : undefined
        }
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label="Année scolaire"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            sx={{ minWidth: 200 }}
            size="small"
          >
            <MenuItem value="">Toutes</MenuItem>
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Classe"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            sx={{ minWidth: 200 }}
            size="small"
            disabled={!year}
          >
            <MenuItem value="">Toutes</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 180 }}
            size="small"
          >
            <MenuItem value="">Tous</MenuItem>
            {Object.entries(TEST_STATUS_LABELS).map(([k, label]) => (
              <MenuItem key={k} value={k}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {!loading && items.length === 0 && !error && (
        <EmptyState message="Aucun test diagnostique. Créez un test pour évaluer les compétences des élèves." />
      )}

      {items.length > 0 && (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Test</TableCell>
                <TableCell>Classe</TableCell>
                <TableCell>Matière</TableCell>
                <TableCell align="center">Questions</TableCell>
                <TableCell align="center">Passations</TableCell>
                <TableCell>Seuils</TableCell>
                <TableCell>Statut</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((t) => (
                <TableRow
                  key={t.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/diagnostics/${t.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {t.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t.authorName} · {new Date(t.createdAt).toLocaleDateString('fr-FR')}
                    </Typography>
                  </TableCell>
                  <TableCell>{t.className}</TableCell>
                  <TableCell>{t.subjectName}</TableCell>
                  <TableCell align="center">{t.questionCount ?? '—'}</TableCell>
                  <TableCell align="center">
                    {t.status === 'draft' ? '—' : `${t.submittedCount ?? 0}/${t.studentCount ?? 0}`}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      Interm. ≥ {t.thresholdIntermediateMin}% · Avancé ≥ {t.thresholdAdvancedMin}%
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Chip size="small" label={TEST_STATUS_LABELS[t.status] ?? t.status} color={STATUS_CHIP[t.status] ?? 'default'} />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Niveaux attribués : {LEVEL_LABELS.debutant} · {LEVEL_LABELS.intermediaire} · {LEVEL_LABELS.avance} ·{' '}
          {LEVEL_LABELS.insufficient_data} (quand le test ne permet pas de conclure)
        </Typography>
      </Box>
    </Box>
  );
}
