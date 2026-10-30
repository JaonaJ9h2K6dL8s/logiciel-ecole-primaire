'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  MenuItem,
  Snackbar,
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
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import Button from '@mui/material/Button';

interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

interface ClassRow {
  id: number;
  name: string;
  levelName: string;
}

interface GradingPeriod {
  id: number;
  schoolYearId: number;
  name: string;
}

interface ClassSubject {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  isActive: boolean;
}

interface ResultDetail {
  assessmentId: number;
  title: string;
  assessmentDate: string;
  maxScore: number;
  coefficient: number;
  score: number | null;
  status: string;
  normalized: number | null;
}

interface ResultRow {
  studentId: number;
  matricule: string;
  studentName: string;
  average: number | null;
  gradedCount: number;
  missingCount: number;
  details: ResultDetail[];
}

interface AveragesResponse {
  data: {
    period: { id: number; name: string; schoolYearId: number };
    assessmentCount: number;
    assessments: { id: number; title: string; assessmentDate: string; maxScore: number; coefficient: number; status: string }[];
    results: ResultRow[];
    classAverage: number | null;
  };
  meta: { rule: string };
}

const STATUS_SHORT: Record<string, string> = {
  not_graded: '—',
  absent: 'Abs',
  absent_justified: 'Abs just.',
  excused: 'Disp.',
};

export default function GradesPage() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [yearId, setYearId] = useState<number | ''>('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<number | ''>('');
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | ''>('');

  const [result, setResult] = useState<AveragesResponse['data'] | null>(null);
  const [rule, setRule] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Options de formulaire dans le périmètre du rôle (années + classes).
        const res = await api.get<{ data: { years: SchoolYear[] } }>('/grading-periods/form-options');
        setYears(res.data.years);
        const active = res.data.years.find((y) => y.isActive);
        setYearId(active ? active.id : res.data.years.length > 0 ? res.data.years[0].id : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des années.');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (yearId === '') {
        setClasses([]);
        return;
      }
      try {
        const res = await api.get<{ data: { classes: ClassRow[] } }>(`/grading-periods/form-options?schoolYearId=${yearId}`);
        setClasses(res.data.classes);
      } catch {
        setClasses([]);
      }
    })();
  }, [yearId]);

  useEffect(() => {
    (async () => {
      if (yearId === '') {
        setPeriods([]);
        return;
      }
      try {
        const res = await api.get<{ data: GradingPeriod[] }>(`/grading-periods?schoolYearId=${yearId}`);
        setPeriods(res.data);
      } catch {
        setPeriods([]);
      }
    })();
  }, [yearId]);

  const loadSubjects = useCallback(async (cid: number | '') => {
    if (cid === '') {
      setSubjects([]);
      return;
    }
    try {
      const res = await api.get<{ data: ClassSubject[] }>(`/subjects/class-assignments?classId=${cid}`);
      setSubjects(res.data.filter((cs) => cs.isActive));
    } catch {
      setSubjects([]);
    }
  }, []);

  const loadAverages = useCallback(async () => {
    if (classId === '' || subjectId === '' || periodId === '') {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AveragesResponse>(
        `/grades/averages?classId=${classId}&subjectId=${subjectId}&gradingPeriodId=${periodId}`
      );
      setResult(res.data);
      setRule(res.meta.rule);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [classId, subjectId, periodId]);

  const fmtAverage = (v: number | null) => (v === null ? 'Indisponible' : `${v.toFixed(2)} / 20`);

  return (
    <Box>
      <PageHeader
        title="Moyennes et résultats"
        subtitle="Moyennes par matière et par période, calculées côté serveur"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Année scolaire"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value === '' ? '' : Number(e.target.value));
              setClassId('');
              setSubjectId('');
              setPeriodId('');
              setResult(null);
            }}
            sx={{ minWidth: 180 }}
          >
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
                {y.isActive ? ' (active)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Classe"
            value={classId}
            onChange={(e) => {
              const v = e.target.value === '' ? '' : Number(e.target.value);
              setClassId(v);
              setSubjectId('');
              setResult(null);
              loadSubjects(v);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">—</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} ({c.levelName})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Matière"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value === '' ? '' : Number(e.target.value));
              setResult(null);
            }}
            sx={{ minWidth: 190 }}
            disabled={classId === ''}
          >
            <MenuItem value="">—</MenuItem>
            {subjects.map((s) => (
              <MenuItem key={s.subjectId} value={s.subjectId}>
                {s.subjectName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Période"
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value === '' ? '' : Number(e.target.value));
              setResult(null);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">—</MenuItem>
            {periods.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={<SearchOutlinedIcon />}
            disabled={classId === '' || subjectId === '' || periodId === '' || loading}
            onClick={loadAverages}
          >
            Afficher
          </Button>
        </Stack>
        {rule && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Règle de calcul : {rule}
          </Typography>
        )}
      </Card>

      {result && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }} useFlexGap>
            <Alert severity="info" sx={{ flexGrow: 1 }}>
              {result.assessmentCount} évaluation(s) sur la période « {result.period.name} » — moyenne de classe :{' '}
              <strong>{fmtAverage(result.classAverage)}</strong>
            </Alert>
          </Stack>

          <Card>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Matricule</TableCell>
                    <TableCell>Élève</TableCell>
                    {result.assessments.map((a) => (
                      <TableCell key={a.id} align="center">
                        <Typography variant="caption" fontWeight={700}>
                          {a.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          /{a.maxScore} · coef {a.coefficient}
                        </Typography>
                      </TableCell>
                    ))}
                    <TableCell align="center">Moyenne</TableCell>
                    <TableCell align="center">Notes prises en compte</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.results.map((r) => (
                    <TableRow key={r.studentId} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {r.matricule}
                        </Typography>
                      </TableCell>
                      <TableCell>{r.studentName}</TableCell>
                      {r.details.map((d) => (
                        <TableCell key={d.assessmentId} align="center">
                          {d.status === 'graded' && d.score !== null ? (
                            <>
                              <Typography variant="body2">{d.score}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                → {d.normalized}/20
                              </Typography>
                            </>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {STATUS_SHORT[d.status] ?? d.status}
                            </Typography>
                          )}
                        </TableCell>
                      ))}
                      <TableCell align="center">
                        <Typography variant="body2" fontWeight={700}>
                          {fmtAverage(r.average)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {r.gradedCount}
                        {r.missingCount > 0 ? (
                          <Typography variant="caption" color="warning.main" display="block">
                            {r.missingCount} manquante(s)
                          </Typography>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {result.results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3 + result.assessments.length}>
                        <EmptyState message="Aucun élève inscrit dans cette classe à la fin de la période." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}

      {!result && (
        <Card sx={{ p: 2 }}>
          <EmptyState message="Choisissez une classe, une matière et une période puis cliquez sur « Afficher »." />
        </Card>
      )}

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
