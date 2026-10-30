'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import MascotCarousel from '@/components/mascots/MascotCarousel';

interface YearRef {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: number;
}

interface PeriodRef {
  id: number;
  name: string;
  displayOrder: number;
  startDate: string;
  endDate: string;
}

const CARD_STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  ready: 'Prêt',
  validated: 'Validé',
  locked: 'Verrouillé',
  cancelled: 'Annulé',
};

const CARD_STATUS_COLOR: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'default',
  ready: 'info',
  validated: 'success',
  locked: 'warning',
  cancelled: 'error',
};

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v.toLocaleString('fr-FR')} %`;
}

function fmtNum(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toLocaleString('fr-FR');
}

function fmtDateTime(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function KpiCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {title}
            </Typography>
            <Typography variant="h6" fontWeight={800} noWrap>
              {value === undefined ? <Skeleton width={70} /> : value}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.secondary">
                {hint}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Vue d'ensemble
// ---------------------------------------------------------------------------

interface OverviewData {
  year: YearRef;
  asOfDate: string;
  enrollment: {
    active: number;
    byStatus: Record<string, number>;
    byLevel: { level: string; count: number }[];
  };
  today: {
    punches: { arrivals: number; exits: number; distinctStudents: number };
    attendance: { sessions: number; classes: number; byStatus: Record<string, number>; recorded: number };
  };
  currentPeriod: PeriodRef | null;
  reportCards: Record<string, number> | null;
  activity: {
    eventsNext30Days: number;
    followups: { todo: number; ongoing: number; overdue: number };
  };
}

function OverviewTab({ yearId }: { yearId: number }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .get<{ data: OverviewData }>('/statistics/overview' + (yearId ? `?year=${yearId}` : ''))
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Skeleton variant="rounded" height={220} />;

  const att = data.today.attendance;
  const toFinalize = data.reportCards ? data.reportCards.draft + data.reportCards.ready : null;

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Élèves inscrits (année)" value={fmtNum(data.enrollment.active)} icon={<PeopleOutlinedIcon />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Pointés aujourd'hui"
            value={fmtNum(data.today.punches.distinctStudents)}
            hint={`${data.today.punches.arrivals} arrivée(s), ${data.today.punches.exits} sortie(s)`}
            icon={<FingerprintOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Appel du jour"
            value={att.recorded > 0 ? `${att.byStatus.PRESENT + att.byStatus.LATE}/${att.recorded}` : 'Aucun appel'}
            hint={
              att.recorded > 0
                ? `${att.byStatus.ABSENT} absence(s), ${att.byStatus.LATE} retard(s), ${att.byStatus.EXCUSED} dispensé(s)`
                : `${att.sessions} séance(s) aujourd'hui`
            }
            icon={<FactCheckOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Bulletins à finaliser"
            value={data.currentPeriod ? fmtNum(toFinalize ?? 0) : '—'}
            hint={data.currentPeriod ? data.currentPeriod.name : 'Aucune période'}
            icon={<WorkspacePremiumOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Événements (30 jours)"
            value={fmtNum(data.activity.eventsNext30Days)}
            icon={<EventAvailableOutlinedIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Suivis à traiter"
            value={fmtNum(data.activity.followups.todo + data.activity.followups.ongoing)}
            hint={`dont ${data.activity.followups.overdue} en retard`}
            icon={<NotificationsActiveOutlinedIcon />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Effectifs par niveau
              </Typography>
              {data.enrollment.byLevel.length === 0 ? (
                <EmptyState message="Aucune inscription active — Aucune donnée pour cette année." />
              ) : (
                <BarChart
                  height={260}
                  xAxis={[{ scaleType: 'band', data: data.enrollment.byLevel.map((l) => l.level) }]}
                  series={[{ data: data.enrollment.byLevel.map((l) => l.count), label: 'Élèves inscrits', color: '#1976d2' }]}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Bulletins — {data.currentPeriod?.name ?? 'période courante'}
              </Typography>
              {!data.reportCards || Object.values(data.reportCards).every((v) => v === 0) ? (
                <EmptyState message="Aucun bulletin — Aucun bulletin généré pour cette période." />
              ) : (
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                  {Object.entries(data.reportCards).map(([status, count]) => (
                    <Stack key={status} direction="row" alignItems="center" justifyContent="space-between">
                      <Chip size="small" label={CARD_STATUS_LABEL[status] ?? status} color={CARD_STATUS_COLOR[status] ?? 'default'} />
                      <Typography fontWeight={700}>{fmtNum(count)}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Effectifs
// ---------------------------------------------------------------------------

interface EnrollmentData {
  byStatus: Record<string, number>;
  byClass: { classId: number; className: string; level: string; capacity: number | null; active: number; fillRate: number | null }[];
  byLevel: { level: string; active: number }[];
  byYear: { yearId: number; label: string; isActive: boolean; students: number }[];
}

function EnrollmentTab({ yearId }: { yearId: number }) {
  const [data, setData] = useState<EnrollmentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .get<{ data: EnrollmentData }>(`/statistics/enrollment?year=${yearId}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Skeleton variant="rounded" height={220} />;

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Évolution des effectifs (toutes années)
              </Typography>
              <LineChart
                height={260}
                xAxis={[{ scaleType: 'point', data: data.byYear.map((y) => y.label) }]}
                series={[{ data: data.byYear.map((y) => y.students), label: 'Élèves', color: '#2e7d32', area: true }]}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Effectifs par classe
              </Typography>
              {data.byClass.length === 0 ? (
                <EmptyState message="Aucune classe — Aucune classe pour cette année." />
              ) : (
                <BarChart
                  height={260}
                  xAxis={[{ scaleType: 'band', data: data.byClass.map((c) => c.className) }]}
                  series={[
                    { data: data.byClass.map((c) => c.active), label: 'Inscrits', color: '#1976d2' },
                    { data: data.byClass.map((c) => c.capacity ?? 0), label: 'Capacité', color: '#bdbdbd' },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={800} gutterBottom>
            Détail par classe
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Classe</TableCell>
                  <TableCell>Niveau</TableCell>
                  <TableCell align="right">Inscrits</TableCell>
                  <TableCell align="right">Capacité</TableCell>
                  <TableCell align="right">Remplissage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.byClass.map((c) => (
                  <TableRow key={c.classId}>
                    <TableCell>{c.className}</TableCell>
                    <TableCell>{c.level}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fmtNum(c.active)}
                    </TableCell>
                    <TableCell align="right">{c.capacity === null ? '—' : fmtNum(c.capacity)}</TableCell>
                    <TableCell align="right">{fmtPct(c.fillRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Assiduité
// ---------------------------------------------------------------------------

interface AttendanceData {
  range: { from: string; to: string };
  summary: {
    sessions: number;
    classes: number;
    days: number;
    byStatus: Record<string, number>;
    recorded: number;
    rates: { present: number | null; absent: number | null; late: number | null; excused: number | null };
  };
  byClass: { classId: number; className: string; level: string; sessions: number; present: number; absent: number; late: number; excused: number; recorded: number }[];
  daily: { date: string; present: number; absent: number; late: number; excused: number }[];
  punchDaily: { date: string; arrivals: number; exits: number; distinctStudents: number }[];
}

function AttendanceTab({ yearId }: { yearId: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFrom('');
    setTo(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(yearId) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<{ data: AttendanceData }>(`/statistics/attendance?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [yearId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField
              label="Du"
              type="date"
              size="small"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Au"
              type="date"
              size="small"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Typography variant="body2" color="text.secondary">
              Par défaut : 30 derniers jours. Les appels et pointages validés sont comptabilisés.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {summary && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}>
            <KpiCard title="Séances d'appel" value={fmtNum(summary.sessions)} hint={`${summary.days} jour(s), ${summary.classes} classe(s)`} icon={<FactCheckOutlinedIcon />} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <KpiCard
              title="Présences (présents + retards)"
              value={fmtNum(summary.byStatus.PRESENT + summary.byStatus.LATE)}
              hint={fmtPct(summary.recorded > 0 ? Math.round(((summary.byStatus.PRESENT + summary.byStatus.LATE) / summary.recorded) * 10000) / 100 : null)}
              icon={<PeopleOutlinedIcon />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <KpiCard title="Absences" value={fmtNum(summary.byStatus.ABSENT)} hint={fmtPct(summary.rates.absent)} icon={<FactCheckOutlinedIcon />} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <KpiCard title="Retards" value={fmtNum(summary.byStatus.LATE)} hint={fmtPct(summary.rates.late)} icon={<FingerprintOutlinedIcon />} />
          </Grid>
        </Grid>
      )}

      {!data && !error && <Skeleton variant="rounded" height={260} />}

      {data && (
        <>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                    Appels par jour
                  </Typography>
                  {data.daily.length === 0 ? (
                    <EmptyState message="Aucun appel — Aucune séance sur cette période." />
                  ) : (
                    <BarChart
                      height={280}
                      xAxis={[{ scaleType: 'band', data: data.daily.map((d) => d.date.slice(5)) }]}
                      series={[
                        { data: data.daily.map((d) => d.present), label: 'Présents', stack: 'a', color: '#43a047' },
                        { data: data.daily.map((d) => d.late), label: 'Retards', stack: 'a', color: '#fdd835' },
                        { data: data.daily.map((d) => d.excused), label: 'Dispensés', stack: 'a', color: '#90a4ae' },
                        { data: data.daily.map((d) => d.absent), label: 'Absents', stack: 'a', color: '#e53935' },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                    Pointages d&apos;entrée par jour
                  </Typography>
                  {data.punchDaily.length === 0 ? (
                    <EmptyState message="Aucun pointage — Aucun pointage sur cette période." />
                  ) : (
                    <LineChart
                      height={280}
                      xAxis={[{ scaleType: 'point', data: data.punchDaily.map((d) => d.date.slice(5)) }]}
                      series={[
                        { data: data.punchDaily.map((d) => d.arrivals), label: 'Arrivées', color: '#1976d2' },
                        { data: data.punchDaily.map((d) => d.exits), label: 'Sorties', color: '#8e24aa' },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Classes avec le plus d&apos;absences
              </Typography>
              {data.byClass.length === 0 ? (
                <EmptyState message="Aucune donnée — Aucun appel enregistré sur cette période." />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Classe</TableCell>
                        <TableCell>Niveau</TableCell>
                        <TableCell align="right">Séances</TableCell>
                        <TableCell align="right">Présents</TableCell>
                        <TableCell align="right">Absents</TableCell>
                        <TableCell align="right">Retards</TableCell>
                        <TableCell align="right">Dispensés</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.byClass.map((c) => (
                        <TableRow key={c.classId}>
                          <TableCell>{c.className}</TableCell>
                          <TableCell>{c.level}</TableCell>
                          <TableCell align="right">{fmtNum(c.sessions)}</TableCell>
                          <TableCell align="right">{fmtNum(c.present)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: c.absent > 0 ? 800 : 400, color: c.absent > 0 ? 'error.main' : undefined }}>
                            {fmtNum(c.absent)}
                          </TableCell>
                          <TableCell align="right">{fmtNum(c.late)}</TableCell>
                          <TableCell align="right">{fmtNum(c.excused)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

interface GradesData {
  periods: PeriodRef[];
  selectedPeriod: PeriodRef | null;
  byPeriod: { periodId: number; periodName: string; cards: number; gradedCards: number; average: number | null; successRate: number | null }[];
  byClass: { classId: number; className: string; level: string; cards: number; gradedCards: number; average: number | null; successRate: number | null }[];
  bySubject: { subjectId: number; subjectName: string; gradedLines: number; average: number | null; successRate: number | null }[];
}

function GradesTab({ yearId }: { yearId: number }) {
  const [periodId, setPeriodId] = useState<number | ''>('');
  const [data, setData] = useState<GradesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPeriodId('');
  }, [yearId]);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(yearId) });
      if (periodId !== '') params.set('period', String(periodId));
      const res = await api.get<{ data: GradesData }>(`/statistics/grades?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [yearId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <TextField
            select
            label="Période"
            size="small"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value === '' ? '' : Number(e.target.value))}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="">Automatique (période en cours)</MenuItem>
            {(data?.periods ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={260} />}

      {data && (
        <>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                    Moyennes et réussite par période
                  </Typography>
                  <BarChart
                    height={280}
                    xAxis={[{ scaleType: 'band', data: data.byPeriod.map((p) => p.periodName) }]}
                    series={[
                      { data: data.byPeriod.map((p) => p.average), label: 'Moyenne générale /20', color: '#1976d2' },
                      { data: data.byPeriod.map((p) => p.successRate), label: 'Taux de réussite (%)', color: '#43a047' },
                    ]}
                  />
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                    Réussite par matière — {data.selectedPeriod?.name ?? '—'}
                  </Typography>
                  {data.bySubject.length === 0 ? (
                    <EmptyState message="Aucune note — Aucun bulletin avec notes sur cette période." />
                  ) : (
                    <BarChart
                      height={280}
                      xAxis={[{ scaleType: 'band', data: data.bySubject.map((s) => s.subjectName) }]}
                      series={[
                        { data: data.bySubject.map((s) => s.average), label: 'Moyenne /20', color: '#8e24aa' },
                        { data: data.bySubject.map((s) => s.successRate), label: 'Réussite (%)', color: '#43a047' },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Résultats par classe — {data.selectedPeriod?.name ?? '—'}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Classe</TableCell>
                      <TableCell>Niveau</TableCell>
                      <TableCell align="right">Bulletins</TableCell>
                      <TableCell align="right">Avec moyenne</TableCell>
                      <TableCell align="right">Moyenne</TableCell>
                      <TableCell align="right">Réussite (≥ 10/20)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.byClass.map((c) => (
                      <TableRow key={c.classId}>
                        <TableCell>{c.className}</TableCell>
                        <TableCell>{c.level}</TableCell>
                        <TableCell align="right">{fmtNum(c.cards)}</TableCell>
                        <TableCell align="right">{fmtNum(c.gradedCards)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {fmtNum(c.average)}
                        </TableCell>
                        <TableCell align="right">{fmtPct(c.successRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Source officielle : bulletins validés ou en préparation (moyenne générale ≥ 10/20 = réussite). Les périodes sans bulletin n&apos;affichent aucune valeur inventée.
              </Typography>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Bulletins
// ---------------------------------------------------------------------------

interface ReportCardsData {
  periods: PeriodRef[];
  selectedPeriod: PeriodRef | null;
  byPeriod: { periodId: number; periodName: string; total: number; draft: number; ready: number; validated: number; locked: number; cancelled: number }[];
  byClass: { classId: number; className: string; level: string; enrolled: number; cards: number; draft: number; ready: number; validated: number; locked: number; cancelled: number; missing: number }[];
}

function ReportCardsTab({ yearId }: { yearId: number }) {
  const [periodId, setPeriodId] = useState<number | ''>('');
  const [data, setData] = useState<ReportCardsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPeriodId('');
  }, [yearId]);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(yearId) });
      if (periodId !== '') params.set('period', String(periodId));
      const res = await api.get<{ data: ReportCardsData }>(`/statistics/report-cards?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [yearId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <TextField
            select
            label="Période"
            size="small"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value === '' ? '' : Number(e.target.value))}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="">Automatique (période en cours)</MenuItem>
            {(data?.periods ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={260} />}

      {data && (
        <>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Avancement par période
              </Typography>
              <BarChart
                height={280}
                xAxis={[{ scaleType: 'band', data: data.byPeriod.map((p) => p.periodName) }]}
                series={[
                  { data: data.byPeriod.map((p) => p.draft), label: 'Brouillons', stack: 'a', color: '#9e9e9e' },
                  { data: data.byPeriod.map((p) => p.ready), label: 'Prêts', stack: 'a', color: '#1e88e5' },
                  { data: data.byPeriod.map((p) => p.validated), label: 'Validés', stack: 'a', color: '#43a047' },
                  { data: data.byPeriod.map((p) => p.locked), label: 'Verrouillés', stack: 'a', color: '#fb8c00' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Détail par classe — {data.selectedPeriod?.name ?? '—'}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Classe</TableCell>
                      <TableCell align="right">Inscrits</TableCell>
                      <TableCell align="right">Bulletins</TableCell>
                      <TableCell align="right">Brouillons</TableCell>
                      <TableCell align="right">Prêts</TableCell>
                      <TableCell align="right">Validés</TableCell>
                      <TableCell align="right">Verrouillés</TableCell>
                      <TableCell align="right">Manquants</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.byClass.map((c) => (
                      <TableRow key={c.classId}>
                        <TableCell>{c.className}</TableCell>
                        <TableCell align="right">{fmtNum(c.enrolled)}</TableCell>
                        <TableCell align="right">{fmtNum(c.cards)}</TableCell>
                        <TableCell align="right">{fmtNum(c.draft)}</TableCell>
                        <TableCell align="right">{fmtNum(c.ready)}</TableCell>
                        <TableCell align="right">{fmtNum(c.validated)}</TableCell>
                        <TableCell align="right">{fmtNum(c.locked)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: c.missing > 0 ? 800 : 400, color: c.missing > 0 ? 'warning.main' : undefined }}>
                          {fmtNum(c.missing)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Activité
// ---------------------------------------------------------------------------

interface ActivityData {
  events: { id: number; title: string; category: string; color: string | null; startAt: string; endAt: string; location: string | null; status: string }[];
  followups: {
    id: number;
    studentName: string;
    occurredAt: string;
    subject: string;
    channel: string;
    followupStatus: string;
    followupDueDate: string | null;
    actionDecided: string | null;
    overdue: boolean;
  }[];
  counts: { eventsNext30: number; followupsTodo: number; followupsOngoing: number; followupsOverdue: number };
}

const FOLLOWUP_STATUS_LABEL: Record<string, string> = {
  todo: 'À faire',
  ongoing: 'En cours',
};

function ActivityTab() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: ActivityData }>('/statistics/activity?limit=10')
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Skeleton variant="rounded" height={220} />;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`${data.counts.eventsNext30} événement(s) à venir (30 j)`} color="primary" variant="outlined" />
        <Chip label={`${data.counts.followupsTodo} suivi(s) à faire`} color="warning" variant="outlined" />
        <Chip label={`${data.counts.followupsOngoing} en cours`} color="info" variant="outlined" />
        <Chip label={`${data.counts.followupsOverdue} en retard`} color="error" variant="outlined" />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Prochains événements
              </Typography>
              {data.events.length === 0 ? (
                <EmptyState message="Aucun événement — Aucun événement planifié à venir." />
              ) : (
                <Stack spacing={1.5}>
                  {data.events.map((e) => (
                    <Box key={e.id} sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700}>
                          {e.title}
                        </Typography>
                        <Chip size="small" label={e.category} variant="outlined" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {fmtDateTime(e.startAt)} — {e.location ?? 'lieu non précisé'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                Suivis nécessitant une action
              </Typography>
              {data.followups.length === 0 ? (
                <EmptyState message="Aucun suivi — Aucun suivi parent en attente." />
              ) : (
                <Stack spacing={1.5}>
                  {data.followups.map((f) => (
                    <Box key={f.id} sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700}>
                          {f.studentName}
                        </Typography>
                        {f.overdue ? (
                          <Chip size="small" color="error" label={`En retard — échéance ${f.followupDueDate ?? '—'}`} />
                        ) : (
                          <Chip size="small" color={f.followupStatus === 'todo' ? 'warning' : 'info'} label={FOLLOWUP_STATUS_LABEL[f.followupStatus] ?? f.followupStatus} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {f.subject} · {f.channel} · {fmtDateTime(f.occurredAt)}
                        {f.actionDecided ? ` · ${f.actionDecided}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

const TAB_LABELS = ['Vue d’ensemble', 'Effectifs', 'Assiduité', 'Résultats', 'Bulletins', 'Activité'];

export default function StatisticsPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState(0);
  const [years, setYears] = useState<YearRef[] | null>(null);
  const [yearId, setYearId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ data: YearRef[] }>('/statistics/years');
        setYears(res.data);
        const active = res.data.find((y) => y.isActive === 1);
        if (active) setYearId(active.id);
        else if (res.data.length > 0) setYearId(res.data[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des années.');
      }
    })();
  }, []);

  return (
    <Box>
      <PageHeader title="Statistiques" subtitle="Centre de pilotage de l’établissement" />

      {/* Zone mascottes (étape 22) — page d'accueil réelle des enseignants,
          qui n'ont pas accès à /dashboard dans le modèle de permissions. */}
      {(user?.role_code === 'admin' || user?.role_code === 'teacher') && (
        <Box sx={{ mb: 3 }}>
          <MascotCarousel />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 1 }}>
        <TextField
          select
          label="Année scolaire"
          size="small"
          value={yearId}
          onChange={(e) => setYearId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ minWidth: 200 }}
        >
          {(years ?? []).map((y) => (
            <MenuItem key={y.id} value={y.id}>
              {y.label}
              {y.isActive === 1 ? ' (active)' : ''}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {TAB_LABELS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      {yearId === '' ? (
        <EmptyState message="Aucune année scolaire — Créez d’abord une année scolaire." />
      ) : (
        <>
          {tab === 0 && <OverviewTab yearId={yearId} />}
          {tab === 1 && <EnrollmentTab yearId={yearId} />}
          {tab === 2 && <AttendanceTab yearId={yearId} />}
          {tab === 3 && <GradesTab yearId={yearId} />}
          {tab === 4 && <ReportCardsTab yearId={yearId} />}
          {tab === 5 && <ActivityTab />}
        </>
      )}
    </Box>
  );
}
