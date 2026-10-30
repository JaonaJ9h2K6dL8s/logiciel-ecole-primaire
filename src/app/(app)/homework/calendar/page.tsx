'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import {
  loadFormOptions,
  loadSubjects,
  todayAppTz,
  type ClassRow,
  type ClassSubject,
  type HomeworkRow,
  type SchoolYear,
} from '@/services/homework';

// Calendrier mensuel des devoirs, sans service externe ni CDN.
// Fuseau de référence : Indian/Antananarivo (serveur).

interface CalendarDay {
  day: string;
  homeworks: (HomeworkRow & { sameDayClassCount: number; overload: boolean })[];
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function HomeworkCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [days, setDays] = useState<CalendarDay[]>([]);
  const [today, setToday] = useState(todayAppTz());
  const [loading, setLoading] = useState(true);
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
    loadSubjects(Number(classId))
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [classId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (yearId) qs.set('year', yearId);
      if (classId) qs.set('class', classId);
      if (subjectId) qs.set('subject', subjectId);
      const res = await api.get<{ data: { month: string; today: string; days: CalendarDay[] } }>(
        `/homework/calendar?${qs.toString()}`
      );
      setDays(res.data.days);
      setToday(res.data.today);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [yearId, classId, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDay['homeworks']>();
    for (const d of days) map.set(d.day, d.homeworks);
    return map;
  }, [days]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const list: (number | null)[] = [];
    for (let i = 0; i < offset; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const cellDate = (d: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${year}-${pad(month + 1)}-${pad(d)}`;
  };

  const overloadDays = new Set(
    days
      .filter((d) => d.homeworks.some((h) => h.overload))
      .map((d) => d.day)
  );

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        title="Calendrier des devoirs"
        subtitle="Dates limites des devoirs publiés et clôturés (heure Indian/Antananarivo)."
        action={
          <Button component={Link} href="/homework" variant="outlined" size="small">
            Liste des devoirs
          </Button>
        }
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" onClick={prevMonth} aria-label="Mois précédent">
              <ChevronLeftIcon />
            </Button>
            <Typography variant="subtitle1" fontWeight={800} sx={{ minWidth: 160, textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </Typography>
            <Button size="small" onClick={nextMonth} aria-label="Mois suivant">
              <ChevronRightIcon />
            </Button>
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Année scolaire"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
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
              size="small"
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
              label="Matière"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              size="small"
              sx={{ minWidth: 150 }}
              disabled={!classId}
            >
              <MenuItem value="">Toutes</MenuItem>
              {subjects.map((s) => (
                <MenuItem key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Stack>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {overloadDays.size > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Charge importante : plusieurs devoirs le même jour pour une même classe
          {overloadDays.size <= 5 ? ` (${Array.from(overloadDays).join(', ')})` : ''}. C’est un avertissement,
          pas un blocage.
        </Alert>
      )}

      <Card sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 1,
          }}
        >
          {WEEKDAYS.map((w) => (
            <Typography key={w} variant="caption" fontWeight={700} color="text.secondary" align="center">
              {w}
            </Typography>
          ))}
          {cells.map((d, idx) => {
            if (d === null) return <Box key={`empty-${idx}`} />;
            const dayStr = cellDate(d);
            const items = byDay.get(dayStr) ?? [];
            const isToday = dayStr === today;
            const dayOverload = items.some((h) => h.overload);
            return (
              <Box
                key={dayStr}
                sx={{
                  minHeight: 96,
                  border: '1px solid',
                  borderColor: isToday ? 'primary.main' : 'divider',
                  borderRadius: 1.5,
                  p: 0.75,
                  bgcolor: isToday ? 'action.selected' : 'background.paper',
                }}
              >
                <Typography variant="caption" fontWeight={isToday ? 800 : 500}>
                  {d}
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {items.slice(0, 3).map((h) => (
                    <Chip
                      key={h.id}
                      component={Link}
                      href={`/homework/${h.id}`}
                      clickable
                      size="small"
                      label={h.title.length > 22 ? `${h.title.slice(0, 22)}…` : h.title}
                      color={dayOverload || h.overload ? 'warning' : 'default'}
                      variant="outlined"
                      sx={{ fontSize: 11, height: 22, justifyContent: 'flex-start' }}
                    />
                  ))}
                  {items.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      +{items.length - 3} autre(s)
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Box>
        {loading && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Chargement…
          </Typography>
        )}
      </Card>
    </Box>
  );
}
