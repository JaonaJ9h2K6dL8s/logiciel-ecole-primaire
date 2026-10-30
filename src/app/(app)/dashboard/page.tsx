'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ArrowOutwardOutlinedIcon from '@mui/icons-material/ArrowOutwardOutlined';
import { PieChart } from '@mui/x-charts/PieChart';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import MascotCarousel from '@/components/mascots/MascotCarousel';
import {
  HOMEWORK_STATUS_LABELS,
  isOverdue,
  todayAppTz,
  type HomeworkRow,
  type HomeworkStatus,
} from '@/services/homework';

// ---------------------------------------------------------------------------
// Données réelles uniquement — aucun chiffre fictif.
// ---------------------------------------------------------------------------

interface DashboardData {
  users: { totalUsers: number; activeUsers: number; teachers: number };
  classes: { totalClasses: number };
  activeYear: { id: number; label: string; startDate: string; endDate: string } | null;
  students: { total: number; active: number };
  database: 'ok' | 'injoignable';
}

interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  publishedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<HomeworkStatus, string> = {
  draft: '#9CA3AF',
  published: '#6C5CE7',
  closed: '#16A34A',
  archived: '#D97706',
};

/** Tuiles pastel des cartes d'accès (fond, couleur d'icône). */
const TONES: { bg: string; fg: string }[] = [
  { bg: '#FFE8DF', fg: '#F4502C' },
  { bg: '#E8E4FF', fg: '#6C5CE7' },
  { bg: '#E3F2E9', fg: '#16A34A' },
  { bg: '#FFF3D6', fg: '#D97706' },
  { bg: '#E1EFFE', fg: '#2563EB' },
  { bg: '#FDE7F1', fg: '#DB2777' },
];

function IconTile({ icon, tone }: { icon: React.ReactNode; tone: { bg: string; fg: string } }) {
  return (
    <Box
      sx={{
        width: 44,
        height: 44,
        borderRadius: '14px',
        bgcolor: tone.bg,
        color: tone.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </Box>
  );
}

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role_code === 'admin';

  const [data, setData] = useState<DashboardData | null>(null);
  const [homeworks, setHomeworks] = useState<HomeworkRow[] | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayAppTz();

  const canAnnouncements = user?.permissions.includes('school_announcements.view') ?? false;
  const canHomework = user?.permissions.includes('homework.view') ?? false;
  const canStatistics = user?.permissions.includes('statistics.view') ?? false;
  const canStudents = user?.permissions.includes('students.manage') ?? false;
  const canAssessments = user?.permissions.includes('assessments.view') ?? false;
  const canReportCards = user?.permissions.includes('report_cards.view') ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      if (isAdmin) {
        const res = await api.get<{ data: DashboardData }>('/dashboard');
        setData(res.data);
      }
      if (canHomework) {
        const res = await api.get<{ data: { items: HomeworkRow[] } }>('/homework?page=1&limit=100&status=all');
        setHomeworks(res.data.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [isAdmin, canHomework]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ data: AnnouncementItem[] }>('/school-announcements?page=1&pageSize=4')
      .then((r) => setAnnouncements(r.data))
      .catch(() => setAnnouncements(null));
  }, []);

  // Statistiques de devoirs (prof) — calculées sur la liste réelle renvoyée par l'API.
  const hwStats = useMemo(() => {
    const items = homeworks ?? [];
    const byStatus: Record<HomeworkStatus, number> = { draft: 0, published: 0, closed: 0, archived: 0 };
    for (const hw of items) byStatus[hw.status] += 1;
    const classes = new Set(items.map((hw) => hw.class_id)).size;
    const upcoming = items
      .filter((hw) => hw.status === 'published' && hw.due_date && hw.due_date >= today)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .slice(0, 3);
    const recent = items.slice(0, 5);
    return { byStatus, classes, upcoming, recent, total: items.length };
  }, [homeworks, today]);

  const donutData = useMemo(() => {
    if (isAdmin && data) {
      const inactive = Math.max(0, data.students.total - data.students.active);
      return [
        { id: 0, label: 'Élèves actifs', value: data.students.active, color: '#6C5CE7' },
        { id: 1, label: 'Autres', value: inactive, color: '#E8E4FF' },
      ];
    }
    if (!isAdmin && homeworks) {
      return (Object.entries(hwStats.byStatus) as [HomeworkStatus, number][])
        .filter(([, v]) => v > 0)
        .map(([k, v], i) => ({ id: i, label: HOMEWORK_STATUS_LABELS[k], value: v, color: STATUS_COLORS[k] }));
    }
    return [];
  }, [isAdmin, data, homeworks, hwStats]);

  const donutTotal = donutData.reduce((acc, d) => acc + d.value, 0);

  const firstName = user?.full_name.split(/\s+/)[0] ?? '';

  // Accès rapides selon les permissions.
  const quickLinks = [
    canStudents && { label: 'Élèves', href: '/students', icon: <SchoolOutlinedIcon /> },
    canHomework && { label: 'Devoirs', href: '/homework', icon: <AssignmentOutlinedIcon /> },
    canAssessments && { label: 'Évaluations', href: '/assessments', icon: <QuizOutlinedIcon /> },
    canStatistics && { label: 'Statistiques', href: '/statistics', icon: <BarChartOutlinedIcon /> },
    canReportCards && { label: 'Bulletins', href: '/report-cards', icon: <WorkspacePremiumOutlinedIcon /> },
    user?.permissions.includes('school_events.view') && {
      label: 'Calendrier',
      href: '/events/calendar',
      icon: <CalendarMonthOutlinedIcon />,
    },
  ].filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[];

  const roleLabel =
    user?.role_code === 'admin' ? 'Administration' : user?.role_code === 'teacher' ? 'Enseignant' : (user?.role_label ?? '');

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ------------------------------ Zone mascottes (admin + enseignants) ------------------------------ */}
        {(user?.role_code === 'admin' || user?.role_code === 'teacher') && (
          <Grid size={12}>
            <MascotCarousel />
          </Grid>
        )}
        {/* ------------------------------ Colonne principale ------------------------------ */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '3rem' } }}>
              Bonjour, {firstName} 👋
            </Typography>
          </Stack>

          {/* Accès rapides (chips pastel) */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 4, flexWrap: 'wrap' }} useFlexGap>
            {quickLinks.map((q, i) => (
              <Button
                key={q.label}
                component={Link}
                href={q.href}
                startIcon={<IconTile icon={q.icon} tone={TONES[i % TONES.length]} />}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '18px',
                  px: 2.5,
                  py: 1.2,
                  color: 'text.primary',
                  boxShadow: '0 2px 8px rgba(31,36,48,0.04)',
                  '& .MuiButton-startIcon': { mr: 1.25 },
                  '&:hover': { boxShadow: '0 6px 18px rgba(31,36,48,0.08)', transform: 'translateY(-1px)' },
                }}
              >
                {q.label}
              </Button>
            ))}
          </Stack>

          {/* À venir : devoirs (prof) ou accès modules (admin) */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Typography variant="h5">À venir</Typography>
            {canHomework && (
              <Button component={Link} href="/homework" size="small" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                Voir tout
              </Button>
            )}
          </Stack>

          <Grid container spacing={2} sx={{ mb: 4 }}>
            {isAdmin
              ? quickLinks.slice(0, 2).map((q, i) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={q.label}>
                    <Card
                      component={Link}
                      href={q.href}
                      sx={{ p: 0, textDecoration: 'none', color: 'inherit', display: 'block', '&:hover': { boxShadow: 3 } }}
                    >
                      <Box sx={{ height: 84, bgcolor: TONES[i % TONES.length].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 21, borderTopRightRadius: 21 }}>
                        <IconTile icon={q.icon} tone={{ bg: '#FFFFFF', fg: TONES[i % TONES.length].fg }} />
                      </Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2 }}>
                        <Box>
                          <Chip size="small" label={q.label} variant="outlined" sx={{ mb: 0.5 }} />
                          <Typography variant="body1" fontWeight={700}>
                            Ouvrir le module
                          </Typography>
                        </Box>
                        <ArrowOutwardOutlinedIcon sx={{ color: 'text.secondary' }} />
                      </Stack>
                    </Card>
                  </Grid>
                ))
              : (hwStats.upcoming.length > 0
                  ? hwStats.upcoming.map((hw, i) => (
                      <Grid size={{ xs: 12, sm: 6 }} key={hw.id}>
                        <Card
                          component={Link}
                          href={`/homework/${hw.id}`}
                          sx={{ p: 0, textDecoration: 'none', color: 'inherit', display: 'block', '&:hover': { boxShadow: 3 } }}
                        >
                          <Box
                            sx={{
                              height: 84,
                              bgcolor: TONES[i % TONES.length].bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 2,
                              borderTopLeftRadius: 21,
                              borderTopRightRadius: 21,
                            }}
                          >
                            <Chip size="small" label={`À rendre le ${hw.due_date}`} sx={{ bgcolor: '#fff', fontWeight: 700 }} />
                            <ArrowOutwardOutlinedIcon sx={{ color: TONES[i % TONES.length].fg }} />
                          </Box>
                          <Box sx={{ p: 2 }}>
                            <Chip size="small" label={hw.subjectName} variant="outlined" sx={{ mb: 0.5 }} />
                            <Typography variant="body1" fontWeight={700} noWrap>
                              {hw.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {hw.className}
                              {isOverdue(hw) ? '' : ''}
                            </Typography>
                          </Box>
                        </Card>
                      </Grid>
                    ))
                  : (
                    <Grid size={12}>
                      <Card sx={{ p: 3 }}>
                        <Typography color="text.secondary">
                          {homeworks === null ? 'Chargement…' : 'Aucun devoir publié à venir.'}
                        </Typography>
                      </Card>
                    </Grid>
                  ))}
          </Grid>

          {/* En cours */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Typography variant="h5">{isAdmin ? 'Annonces récentes' : 'Devoirs récents'}</Typography>
            {isAdmin && canAnnouncements && (
              <Button component={Link} href="/announcements" size="small" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                Voir tout
              </Button>
            )}
          </Stack>

          <Stack spacing={1.5}>
            {isAdmin
              ? (announcements === null
                  ? [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 5 }} />)
                  : announcements.length === 0
                    ? (
                      <Card sx={{ p: 2.5 }}>
                        <Typography color="text.secondary">Aucune annonce publiée.</Typography>
                      </Card>
                    )
                    : announcements.map((a) => (
                        <Card key={a.id} sx={{ p: 2 }}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <IconTile icon={<NotificationsOutlinedIcon />} tone={TONES[5]} />
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                              <Typography variant="subtitle2" fontWeight={700} noWrap>
                                {a.title}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap display="block">
                                {a.content}
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                              {new Date(a.publishedAt ?? a.createdAt).toLocaleDateString('fr-FR')}
                            </Typography>
                          </Stack>
                        </Card>
                      )))
              : (homeworks === null
                  ? [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 5 }} />)
                  : hwStats.recent.length === 0
                    ? (
                      <Card sx={{ p: 2.5 }}>
                        <Typography color="text.secondary">Aucun devoir enregistré pour le moment.</Typography>
                      </Card>
                    )
                    : hwStats.recent.map((hw, i) => (
                        <Card
                          key={hw.id}
                          component={Link}
                          href={`/homework/${hw.id}`}
                          sx={{
                            p: 2,
                            textDecoration: 'none',
                            color: 'inherit',
                            display: 'block',
                            '&:hover': { boxShadow: 3 },
                          }}
                        >
                          <Stack direction="row" spacing={2} alignItems="center">
                            <IconTile icon={<AssignmentOutlinedIcon />} tone={TONES[i % TONES.length]} />
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                              <Chip size="small" label={hw.subjectName} variant="outlined" sx={{ mb: 0.25 }} />
                              <Typography variant="subtitle2" fontWeight={700} noWrap>
                                {hw.title}
                              </Typography>
                            </Box>
                            <Tooltip title={HOMEWORK_STATUS_LABELS[hw.status]}>
                              <Chip
                                size="small"
                                label={hw.due_date ? `Échéance ${hw.due_date}` : HOMEWORK_STATUS_LABELS[hw.status]}
                                sx={{
                                  bgcolor: isOverdue(hw) ? '#FEE2E2' : TONES[i % TONES.length].bg,
                                  color: isOverdue(hw) ? '#B91C1C' : TONES[i % TONES.length].fg,
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              />
                            </Tooltip>
                          </Stack>
                        </Card>
                      )))}
          </Stack>
        </Grid>

        {/* ------------------------------ Panneau latéral ------------------------------ */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: { md: 24 } }}>
            {/* Profil */}
            <Card sx={{ p: 3, textAlign: 'center' }}>
              <Avatar sx={{ width: 76, height: 76, mx: 'auto', bgcolor: 'primary.light', color: 'primary.dark', fontSize: 26, fontWeight: 700 }}>
                {initialsOf(user?.full_name ?? '')}
              </Avatar>
              <Typography variant="h6" sx={{ mt: 1.5 }}>
                {user?.full_name}
              </Typography>
              <Chip size="small" label={roleLabel} sx={{ mt: 0.75, bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }} />
              {isAdmin && data?.activeYear && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  Année active : {data.activeYear.label}
                </Typography>
              )}
            </Card>

            {/* Tuiles statistiques */}
            <Grid container spacing={1.5}>
              {(isAdmin
                ? [
                    { icon: <SchoolOutlinedIcon sx={{ color: '#F4502C' }} />, value: data?.students.active, label: 'Élèves actifs' },
                    { icon: <ClassOutlinedIcon sx={{ color: '#6C5CE7' }} />, value: data?.classes.totalClasses, label: 'Classes' },
                    { icon: <PeopleOutlinedIcon sx={{ color: '#D97706' }} />, value: data?.users.teachers, label: 'Professeurs' },
                  ]
                : [
                    { icon: <AssignmentOutlinedIcon sx={{ color: '#6C5CE7' }} />, value: hwStats.byStatus.published, label: 'Publiés' },
                    { icon: <ClassOutlinedIcon sx={{ color: '#16A34A' }} />, value: hwStats.classes, label: 'Classes' },
                    { icon: <QuizOutlinedIcon sx={{ color: '#F4502C' }} />, value: hwStats.byStatus.draft, label: 'Brouillons' },
                  ]
              ).map((t) => (
                <Grid size={4} key={t.label}>
                  <Card sx={{ p: 1.75, textAlign: 'center', height: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>{t.icon}</Box>
                    <Typography variant="h6" fontWeight={800}>
                      {t.value === undefined || t.value === null ? <Skeleton width={30} sx={{ mx: 'auto' }} /> : t.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t.label}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Activité (donut) */}
            <Card sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>
                  Activité
                </Typography>
                <Chip
                  size="small"
                  label={isAdmin ? 'Effectifs' : 'Statuts des devoirs'}
                  sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}
                />
              </Stack>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {isAdmin ? (data ? data.students.total : <Skeleton width={60} />) : homeworks ? hwStats.total : <Skeleton width={60} />}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {isAdmin ? 'élèves' : 'devoirs'}
                </Typography>
              </Typography>
              {donutTotal > 0 ? (
                <>
                  <PieChart
                    height={170}
                    series={[
                      {
                        data: donutData,
                        innerRadius: 52,
                        outerRadius: 78,
                        paddingAngle: 3,
                        cornerRadius: 8,
                      },
                    ]}
                    slotProps={{ legend: { direction: 'vertical', position: { vertical: 'middle', horizontal: 'end' }, sx: { display: 'none' } } }}
                    margin={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  />
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {donutData.map((d) => (
                      <Stack key={d.id} direction="row" alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: d.color }} />
                          <Typography variant="caption" fontWeight={600}>
                            {d.label}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          {Math.round((d.value / Math.max(1, donutTotal)) * 100)} %
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  Aucune donnée à afficher pour le moment.
                </Typography>
              )}
            </Card>

            {/* Mini cartes */}
            <Grid container spacing={1.5}>
              <Grid size={6}>
                <Card sx={{ p: 2, height: '100%' }}>
                  <IconTile icon={<NotificationsOutlinedIcon />} tone={TONES[0]} />
                  <Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>
                    {announcements === null ? '—' : announcements.length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Annonces récentes
                  </Typography>
                  {canAnnouncements && (
                    <Button component={Link} href="/announcements" size="small" variant="outlined" fullWidth>
                      Voir tout
                    </Button>
                  )}
                </Card>
              </Grid>
              <Grid size={6}>
                <Card sx={{ p: 2, height: '100%' }}>
                  <IconTile icon={<EventAvailableOutlinedIcon />} tone={TONES[3]} />
                  <Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>
                    {isAdmin && data ? data.users.activeUsers : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    {isAdmin ? 'Utilisateurs actifs' : 'Cette semaine'}
                  </Typography>
                  <Button
                    component={Link}
                    href={isAdmin ? '/users' : '/homework/calendar'}
                    size="small"
                    variant="outlined"
                    fullWidth
                  >
                    Voir tout
                  </Button>
                </Card>
              </Grid>
            </Grid>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
