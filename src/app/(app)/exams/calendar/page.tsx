'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftOutlinedIcon from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { api } from '@/services/api';
import {
  EXAM_TYPE_LABELS,
  EXAM_STATUS_LABELS,
  loadExamCalendar,
  monthLabel,
  shiftMonth,
  type ExamCalendarConflict,
  type ExamCalendarItem,
} from '@/services/exams';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  schoolYearId: number;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Grille du mois : semaines commençant lundi, cellules YYYY-MM-DD ou null. */
function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startOffset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const cells: (string | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Mois courant dans le fuseau métier Indian/Antananarivo. */
function currentMonth(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' }).slice(0, 7);
}

export default function ExamsCalendarPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<ExamCalendarItem[] | null>(null);
  const [conflicts, setConflicts] = useState<ExamCalendarConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Référentiel léger : année active + classes visibles (admin : toutes,
        // professeur : ses classes affectées) — sans 403 pour les professeurs.
        const res = await api.get<{
          data: { activeYear: { id: number; label: string } | null; classes: ClassRow[] };
        }>('/exams/classes');
        setClasses(res.data.classes);
        if (res.data.classes.length > 0) setClassId(String(res.data.classes[0].id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des classes.');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loadExamCalendar(Number(classId), month);
      setItems(res.data);
      setConflicts(res.conflicts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement du calendrier.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [classId, month]);

  useEffect(() => {
    load();
  }, [load]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, ExamCalendarItem[]>();
    for (const it of items ?? []) {
      const list = map.get(it.assessmentDate) ?? [];
      list.push(it);
      map.set(it.assessmentDate, list);
    }
    return map;
  }, [items]);

  return (
    <Box>
      <PageHeader
        title="Calendrier des examens"
        subtitle="Épreuves planifiées par classe et par mois — impression possible"
        action={
          <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
            Imprimer
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2, displayPrint: 'none' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            select
            size="small"
            required
            label="Classe"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} ({c.levelName})
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              aria-label="Mois précédent"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            >
              <ChevronLeftOutlinedIcon />
            </IconButton>
            <Typography variant="subtitle1" fontWeight={700} sx={{ minWidth: 180, textAlign: 'center' }}>
              {monthLabel(month)}
            </Typography>
            <IconButton
              aria-label="Mois suivant"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            >
              <ChevronRightOutlinedIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Card>

      {conflicts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={700} gutterBottom>
            Chevauchements / coexistences détectés (avertissement, aucune modification automatique) :
          </Typography>
          {conflicts.map((c, i) => (
            <Typography key={`${c.date}-${c.aId}-${c.bId}-${i}`} variant="body2">
              • {c.message}
            </Typography>
          ))}
        </Alert>
      )}

      <Card sx={{ p: 2 }}>
        {items === null && <EmptyState message={loading ? 'Chargement…' : 'Choisissez une classe.'} />}
        {items !== null && items.length === 0 && (
          <EmptyState message="Aucune épreuve planifiée ce mois pour cette classe." />
        )}
        {items !== null && items.length > 0 && (
          <Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 1,
                mb: 1,
              }}
            >
              {WEEKDAYS.map((d) => (
                <Typography key={d} variant="caption" color="text.secondary" align="center" fontWeight={700}>
                  {d}
                </Typography>
              ))}
            </Box>
            {weeks.map((week, wi) => (
              <Box
                key={wi}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 1,
                  mb: 1,
                }}
              >
                {week.map((day, di) => {
                  const dayItems = day ? (byDay.get(day) ?? []) : [];
                  return (
                    <Box
                      key={di}
                      sx={{
                        minHeight: 96,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 0.5,
                        bgcolor: day ? 'background.paper' : 'transparent',
                        opacity: day ? 1 : 0.3,
                      }}
                    >
                      {day && (
                        <>
                          <Typography variant="caption" color="text.secondary">
                            {Number(day.slice(-2))}
                          </Typography>
                          {dayItems.map((it) => (
                            <Tooltip
                              key={it.id}
                              title={`${it.title} — ${it.subjectName} — ${EXAM_STATUS_LABELS[it.status] ?? it.status}`}
                            >
                              <Box
                                sx={{
                                  mt: 0.25,
                                  px: 0.5,
                                  py: 0.25,
                                  borderRadius: 0.5,
                                  bgcolor: 'action.hover',
                                  border: '1px solid',
                                  borderColor: 'primary.main',
                                  overflow: 'hidden',
                                }}
                              >
                                <Typography variant="caption" noWrap display="block" fontWeight={700}>
                                  {it.startTime ? `${it.startTime} ` : ''}
                                  {it.subjectName}
                                </Typography>
                                <Typography variant="caption" noWrap display="block" color="text.secondary">
                                  {EXAM_TYPE_LABELS[it.assessmentType] ?? it.assessmentType} · {it.title}
                                </Typography>
                              </Box>
                            </Tooltip>
                          ))}
                        </>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}
      </Card>
    </Box>
  );
}
