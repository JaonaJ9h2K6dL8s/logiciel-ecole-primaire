'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import {
  EXAM_TYPE_LABELS,
  EXAM_STATUS_LABELS,
  loadExamDashboard,
  type ExamDashboardData,
  type ExamFilters,
} from '@/services/exams';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  schoolYearId: number;
}

interface GradingPeriod {
  id: number;
  schoolYearId: number;
  name: string;
}

interface ClassSubject {
  subjectId: number;
  subjectName: string;
  isActive: boolean;
}

const EMPTY_FILTERS: ExamFilters = {
  schoolYearId: '',
  gradingPeriodId: '',
  classId: '',
  subjectId: '',
  assessmentType: '',
  fromDate: '',
  toDate: '',
};

export default function ExamsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  // La liste complète des années exige « school_years.manage » (admin) ;
  // les professeurs utilisent le référentiel léger /exams/classes.
  const hasYearPerm = user?.permissions.includes('school_years.manage') ?? false;

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);

  const [filters, setFilters] = useState<ExamFilters>(EMPTY_FILTERS);
  const [data, setData] = useState<ExamDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{
          data: { activeYear: { id: number; label: string } | null; classes: ClassRow[] };
        }>('/exams/classes');
        const d = res.data;
        if (!hasYearPerm) {
          // Professeur : année active + classes qui lui sont affectées
          if (d.activeYear) {
            setFilters((f) => (f.schoolYearId ? f : { ...f, schoolYearId: String(d.activeYear!.id) }));
          }
          setClasses(d.classes);
        }
      } catch {
        if (!hasYearPerm) setClasses([]);
      }
    })();
  }, [hasYearPerm]);

  useEffect(() => {
    if (!hasYearPerm) return;
    (async () => {
      try {
        const res = await api.get<{ data: SchoolYear[] }>('/school-years');
        setYears(res.data);
        const active = res.data.find((y) => y.isActive);
        if (active) setFilters((f) => ({ ...f, schoolYearId: String(active.id) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des années.');
      }
    })();
  }, [hasYearPerm]);

  useEffect(() => {
    (async () => {
      if (!hasYearPerm || !filters.schoolYearId) {
        // Professeur : classes déjà fournies par /exams/classes
        return;
      }
      try {
        const res = await api.get<{ data: ClassRow[] }>(
          `/academics/classes?schoolYearId=${filters.schoolYearId}`
        );
        setClasses(res.data);
      } catch {
        setClasses([]);
      }
    })();
  }, [filters.schoolYearId, hasYearPerm]);

  useEffect(() => {
    (async () => {
      if (!filters.schoolYearId) {
        setPeriods([]);
        return;
      }
      try {
        const res = await api.get<{ data: GradingPeriod[] }>(
          `/grading-periods?schoolYearId=${filters.schoolYearId}`
        );
        setPeriods(res.data);
      } catch {
        setPeriods([]);
      }
    })();
  }, [filters.schoolYearId]);

  useEffect(() => {
    (async () => {
      if (!filters.classId) {
        setSubjects([]);
        return;
      }
      try {
        const res = await api.get<{ data: ClassSubject[] }>(
          `/subjects/class-assignments?classId=${filters.classId}`
        );
        setSubjects(res.data.filter((s) => s.isActive));
      } catch {
        setSubjects([]);
      }
    })();
  }, [filters.classId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadExamDashboard(filters));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = [
    {
      label: 'Épreuves planifiées',
      value: data?.total ?? 0,
      icon: <EventOutlinedIcon color="primary" />,
    },
    {
      label: 'À venir',
      value: data?.upcoming ?? 0,
      icon: <ScheduleOutlinedIcon color="info" />,
    },
    {
      label: 'Passées',
      value: data?.past ?? 0,
      icon: <HistoryOutlinedIcon color="warning" />,
    },
    {
      label: 'Notes à saisir',
      value: data?.awaitingGrades ?? 0,
      icon: <RateReviewOutlinedIcon color="error" />,
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Examens & devoirs surveillés"
        subtitle="Pilotage des épreuves planifiées et du suivi de saisie des notes"
        action={
          <Button variant="outlined" onClick={() => router.push('/exams/calendar')}>
            Calendrier des examens
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
          {hasYearPerm && (
            <TextField
              select
              size="small"
              label="Année scolaire"
              value={filters.schoolYearId}
              onChange={(e) =>
                setFilters({ ...EMPTY_FILTERS, schoolYearId: e.target.value })
              }
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">Toutes</MenuItem>
              {years.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            label="Période"
            value={filters.gradingPeriodId}
            onChange={(e) => setFilters({ ...filters, gradingPeriodId: e.target.value })}
            sx={{ minWidth: 150 }}
            disabled={!filters.schoolYearId}
          >
            <MenuItem value="">Toutes</MenuItem>
            {periods.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Classe"
            value={filters.classId}
            onChange={(e) =>
              setFilters({ ...filters, classId: e.target.value, subjectId: '' })
            }
            sx={{ minWidth: 150 }}
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
            size="small"
            label="Matière"
            value={filters.subjectId}
            onChange={(e) => setFilters({ ...filters, subjectId: e.target.value })}
            sx={{ minWidth: 150 }}
            disabled={!filters.classId}
          >
            <MenuItem value="">Toutes</MenuItem>
            {subjects.map((s) => (
              <MenuItem key={s.subjectId} value={s.subjectId}>
                {s.subjectName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Type"
            value={filters.assessmentType}
            onChange={(e) => setFilters({ ...filters, assessmentType: e.target.value })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Tous</MenuItem>
            {Object.entries(EXAM_TYPE_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Du"
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            size="small"
            label="Au"
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150 }}
          />
        </Stack>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        {kpis.map((k) => (
          <Card key={k.label} sx={{ flex: 1, p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            {k.icon}
            <Box>
              <Typography variant="h5" fontWeight={700}>
                {loading ? '…' : k.value}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {k.label}
              </Typography>
            </Box>
          </Card>
        ))}
      </Stack>

      {data && data.byType.length > 0 && (
        <Card sx={{ mb: 2, p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Répartition par type
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {data.byType.map((t) => (
              <Chip
                key={t.type}
                size="small"
                variant="outlined"
                label={`${EXAM_TYPE_LABELS[t.type] ?? t.type} : ${t.count}`}
              />
            ))}
          </Stack>
        </Card>
      )}

      <Card>
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Prochaines épreuves
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Heure</TableCell>
                <TableCell>Titre</TableCell>
                <TableCell>Classe</TableCell>
                <TableCell>Matière</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Responsable</TableCell>
                <TableCell>État</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.upcomingItems ?? []).map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>{e.assessmentDate}</TableCell>
                  <TableCell>
                    {e.startTime ? `${e.startTime}${e.durationMinutes ? ` (${e.durationMinutes} min)` : ''}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {e.title}
                    </Typography>
                  </TableCell>
                  <TableCell>{e.className}</TableCell>
                  <TableCell>{e.subjectName}</TableCell>
                  <TableCell>{EXAM_TYPE_LABELS[e.assessmentType] ?? e.assessmentType}</TableCell>
                  <TableCell>{e.teacherName}</TableCell>
                  <TableCell>{EXAM_STATUS_LABELS[e.status] ?? e.status}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<VisibilityOutlinedIcon />}
                      onClick={() => router.push(`/assessments/${e.id}`)}
                    >
                      Ouvrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data !== null && data.upcomingItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState message="Aucune épreuve à venir pour ces filtres." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
