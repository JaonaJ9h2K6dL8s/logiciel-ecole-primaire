'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, Chip, Stack, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';

// Calendrier mensuel des événements scolaires, sans service externe ni CDN.

interface EventRow {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  planned: 'info',
  completed: 'success',
  cancelled: 'error',
  archived: 'default',
};

function ymd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function EventCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { from: ymd(first), to: ymd(last) };
  }, [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: EventRow[] }>(
        `/school-events?from=${from}&to=${to}&pageSize=100&page=1`
      );
      setEvents(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // Événements par jour (un événement apparaît sur chaque jour qu'il couvre).
  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const ev of events) {
      const start = new Date(ev.startAt);
      const end = new Date(ev.endAt);
      if (Number.isNaN(start.getTime())) continue;
      const safeEnd = Number.isNaN(end.getTime()) ? start : end;
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(safeEnd.getFullYear(), safeEnd.getMonth(), safeEnd.getDate());
      let guard = 0;
      while (cursor <= last && guard < 60) {
        const key = ymd(cursor);
        const list = map.get(key) ?? [];
        list.push(ev);
        map.set(key, list);
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
      }
    }
    return map;
  }, [events]);

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
    } else {
      setMonth(month - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const todayKey = ymd(now);

  return (
    <Box>
      <PageHeader
        title="Calendrier des événements"
        subtitle="Vue mensuelle des événements scolaires"
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button onClick={prevMonth} startIcon={<ChevronLeftIcon />}>
              Mois précédent
            </Button>
            <Typography variant="h6" fontWeight={800} sx={{ minWidth: 190, textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </Typography>
            <Button onClick={nextMonth} endIcon={<ChevronRightIcon />}>
              Mois suivant
            </Button>
          </Stack>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 2 }}>
        {loading ? (
          <Typography sx={{ p: 2 }}>Chargement…</Typography>
        ) : (
          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
              {WEEKDAYS.map((d) => (
                <Typography key={d} variant="subtitle2" align="center" color="text.secondary" sx={{ py: 0.5 }}>
                  {d}
                </Typography>
              ))}
              {cells.map((day, idx) => {
                if (day === null) return <Box key={`empty-${idx}`} sx={{ minHeight: 90 }} />;
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = byDay.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <Box
                    key={key}
                    sx={{
                      minHeight: 90,
                      border: '1px solid',
                      borderColor: isToday ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      p: 0.5,
                      bgcolor: isToday ? 'action.selected' : 'background.paper',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {day}
                    </Typography>
                    <Stack spacing={0.25}>
                      {dayEvents.slice(0, 3).map((ev) => (
                        <Chip
                          key={ev.id}
                          size="small"
                          label={ev.title}
                          color={STATUS_COLORS[ev.status] ?? 'default'}
                          sx={{ fontSize: 11, height: 20, '& .MuiChip-label': { px: 0.5, overflow: 'hidden', textOverflow: 'ellipsis' } }}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <Typography variant="caption" color="text.secondary">
                          +{dayEvents.length - 3} autre(s)
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </Card>
    </Box>
  );
}
