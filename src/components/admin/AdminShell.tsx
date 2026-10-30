'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  Grid,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Snackbar,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PsychologyAltOutlinedIcon from '@mui/icons-material/PsychologyAltOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import MoneyOffOutlinedIcon from '@mui/icons-material/MoneyOffOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GradingOutlinedIcon from '@mui/icons-material/GradingOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import BackgroundLayer from '@/components/appearance/BackgroundLayer';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { useThemeStore, type ThemePreference } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';

const RAIL_WIDTH = 88;

interface MenuItemDef {
  label: string;
  icon: React.ReactNode;
  href?: string;
  permission?: string;
  disabled?: boolean;
  /** Fonctionnalité réservée aux professeurs : masquée aux administrateurs. */
  teacherOnly?: boolean;
}

const MENU_ITEMS: MenuItemDef[] = [
  { label: 'Tableau de bord', icon: <DashboardOutlinedIcon />, href: '/dashboard', permission: 'dashboard.view' },
  { label: 'Statistiques', icon: <BarChartOutlinedIcon />, href: '/statistics', permission: 'statistics.view' },
  { label: 'Utilisateurs', icon: <PeopleOutlinedIcon />, href: '/users', permission: 'users.manage' },
  { label: 'Élèves', icon: <SchoolOutlinedIcon />, href: '/students', permission: 'students.manage' },
  { label: 'Responsables légaux', icon: <ContactsOutlinedIcon />, href: '/guardians', permission: 'students.manage' },
  { label: 'Pointage', icon: <FingerprintOutlinedIcon />, href: '/entry-punch', permission: 'entry_punches.manage' },
  { label: 'Appel en classe', icon: <FactCheckOutlinedIcon />, href: '/attendance', permission: 'attendance.manage' },
  { label: 'Rapprochement', icon: <CompareArrowsOutlinedIcon />, href: '/reconciliation', permission: 'attendance.reconcile' },
  { label: 'Années scolaires', icon: <CalendarMonthOutlinedIcon />, href: '/school-years', permission: 'school_years.manage' },
  { label: 'Niveaux & classes', icon: <ClassOutlinedIcon />, href: '/classes', permission: 'academics.manage' },
  { label: 'Matières', icon: <MenuBookOutlinedIcon />, href: '/subjects', permission: 'subjects.view' },
  { label: "Périodes d'évaluation", icon: <EventNoteOutlinedIcon />, href: '/grading-periods', permission: 'assessments.view' },
  { label: 'Évaluations', icon: <QuizOutlinedIcon />, href: '/assessments', permission: 'assessments.view' },
  { label: 'Examens', icon: <EditNoteOutlinedIcon />, href: '/exams', permission: 'assessments.view' },
  { label: 'Calendrier des examens', icon: <CalendarMonthOutlinedIcon />, href: '/exams/calendar', permission: 'assessments.view' },
  { label: 'Devoirs & exercices', icon: <AssignmentOutlinedIcon />, href: '/homework', permission: 'homework.view' },
  { label: 'Calendrier des devoirs', icon: <CalendarMonthOutlinedIcon />, href: '/homework/calendar', permission: 'homework.view' },
  { label: 'Tests diagnostiques', icon: <PsychologyAltOutlinedIcon />, href: '/diagnostics', permission: 'diagnostics.view' },
  { label: 'Finance', icon: <PaymentsOutlinedIcon />, href: '/finance', permission: 'finance.view' },
  { label: 'Tarifs des frais', icon: <RequestQuoteOutlinedIcon />, href: '/finance/fees', permission: 'finance.view' },
  { label: 'Frais émis', icon: <ReceiptLongOutlinedIcon />, href: '/finance/charges', permission: 'finance.view' },
  { label: 'Situation des élèves', icon: <PersonSearchOutlinedIcon />, href: '/finance/students', permission: 'finance.view' },
  { label: 'Paiements', icon: <PointOfSaleOutlinedIcon />, href: '/finance/payments', permission: 'finance.view' },
  { label: 'Impayés & relances', icon: <MoneyOffOutlinedIcon />, href: '/finance/arrears', permission: 'finance.view' },
  { label: 'Rapports financiers', icon: <SummarizeOutlinedIcon />, href: '/finance/reports', permission: 'finance.reports.view' },
  { label: 'Annulations de paiements', icon: <GavelOutlinedIcon />, href: '/finance/cancellations', permission: 'finance.view' },
  { label: 'Notes & moyennes', icon: <GradingOutlinedIcon />, href: '/grades', permission: 'assessments.view' },
  { label: 'Bulletins scolaires', icon: <WorkspacePremiumOutlinedIcon />, href: '/report-cards', permission: 'report_cards.view' },
  { label: 'Résultats annuels', icon: <TrendingUpOutlinedIcon />, href: '/annual-results', permission: 'annual_results.view' },
  { label: 'Communications parents', icon: <ForumOutlinedIcon />, href: '/communications', permission: 'parent_contacts.view' },
  { label: 'Suivis à effectuer', icon: <AddTaskOutlinedIcon />, href: '/communications/followups', permission: 'parent_contacts.view' },
  { label: 'Événements scolaires', icon: <EventAvailableOutlinedIcon />, href: '/events', permission: 'school_events.view' },
  { label: 'Calendrier', icon: <CalendarMonthOutlinedIcon />, href: '/events/calendar', permission: 'school_events.view' },
  { label: 'Annonces internes', icon: <NotificationsOutlinedIcon />, href: '/announcements', permission: 'school_announcements.view' },
  { label: 'Assistant IA', icon: <AutoAwesomeOutlinedIcon />, href: '/ai', permission: 'pedagogical_ai.use', teacherOnly: true },
  { label: 'Chat IA', icon: <ChatOutlinedIcon />, href: '/ai/chat', permission: 'pedagogical_ai.use', teacherOnly: true },
  { label: 'Bibliothèque IA', icon: <FolderOpenOutlinedIcon />, href: '/ai/library', permission: 'pedagogical_ai.use', teacherOnly: true },
  { label: 'Configuration IA', icon: <TuneOutlinedIcon />, href: '/ai/config', permission: 'pedagogical_ai.manage', teacherOnly: true },
  { label: 'Apparence', icon: <PaletteOutlinedIcon />, href: '/settings/appearance' },
  { label: 'Paramètres', icon: <SettingsOutlinedIcon />, href: '/settings', permission: 'settings.manage' },
  { label: 'Journaux d’audit', icon: <HistoryOutlinedIcon />, href: '/audit', permission: 'audit.view' },
];

/** Ordre de priorité des icônes épinglées sur le rail latéral. */
const RAIL_PRIORITY = [
  '/dashboard',
  '/students',
  '/homework',
  '/finance',
  '/assessments',
  '/attendance',
  '/statistics',
  '/events',
  '/communications',
  '/report-cards',
  '/grades',
];

function hasPermission(user: ReturnType<typeof useAuthStore.getState>['user'], permission?: string): boolean {
  if (!permission) return true;
  return Boolean(user?.permissions.includes(permission));
}

/** Première route de navigation autorisée pour un ensemble de permissions. */
export function firstAllowedRoute(permissions: string[]): string {
  const item = MENU_ITEMS.find((m) => m.href && (!m.permission || permissions.includes(m.permission)));
  return item?.href ?? '/login';
}

function isActivePath(pathname: string, href?: string): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const router = useRouter();
  const pathname = usePathname();
  const { user, checked, checkSession, logout, setThemePreference } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [launcherEl, setLauncherEl] = useState<null | HTMLElement>(null);
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  // Apparence : préférence individuelle (light / dark / system) — hooks avant
  // tout retour conditionnel (règle des hooks React).
  const themePreference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    if (!checked) {
      checkSession().then((u) => {
        if (!u) {
          router.replace('/login');
          return;
        }
        // Aligner l'apparence sur la préférence persistée du compte connecté
        // (indépendance entre utilisateurs sur un même navigateur).
        setPreference(u.theme_preference ?? 'system');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, checkSession, router]);

  const visibleItems = useMemo(
    () =>
      MENU_ITEMS.filter(
        (item) =>
          hasPermission(user, item.permission) &&
          // Les modules IA sont réservés aux professeurs : masqués aux admins.
          !(item.teacherOnly && user?.role_code === 'admin')
      ),
    [user]
  );

  // Garde de route : la page courante doit correspondre à une entrée de menu
  // autorisée pour le rôle connecté (défense côté interface ; le serveur
  // applique de toute façon les permissions sur chaque endpoint).
  const currentPermission = useMemo(() => {
    const matches = visibleItems
      .filter((item) => item.href && isActivePath(pathname, item.href))
      .sort((a, b) => (b.href as string).length - (a.href as string).length);
    // La route la plus spécifique gouverne : /settings/appearance (sans
    // permission, préférences personnelles) prime sur le préfixe /settings
    // (settings.manage). Sans elle, toute page sans permission tomberait
    // sous le coup d'un préfixe plus court.
    return matches[0]?.permission ?? null;
  }, [pathname, visibleItems]);

  // Une page IA (réservée aux professeurs) ouverte par un admin est bloquée
  // explicitement : sans cela, l'absence d'entrée de menu laisserait passer.
  const teacherPageBlockedAsAdmin = useMemo(() => {
    if (user?.role_code !== 'admin') return false;
    return MENU_ITEMS.some((item) => item.teacherOnly && item.href && isActivePath(pathname, item.href));
  }, [pathname, user]);

  const railItems = useMemo(() => {
    const sorted = [...visibleItems].sort((a, b) => {
      const ia = RAIL_PRIORITY.indexOf(a.href ?? '');
      const ib = RAIL_PRIORITY.indexOf(b.href ?? '');
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return sorted.slice(0, 7);
  }, [visibleItems]);

  if (!checked) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <Typography color="text.secondary">Chargement…</Typography>
      </Box>
    );
  }

  if (!user) {
    return null; // redirection en cours
  }

  const routeAllowed = !teacherPageBlockedAsAdmin && (!currentPermission || user.permissions.includes(currentPermission));

  if (!routeAllowed) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          p: 3,
        }}
      >
        <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
          <BlockOutlinedIcon color="error" sx={{ fontSize: 56, mb: 2 }} />
          <Typography variant="h6" fontWeight={800} gutterBottom>
            Accès non autorisé
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Votre rôle ({user.role_label}) ne permet pas d’ouvrir cette page.
          </Typography>
          <Button variant="contained" onClick={() => router.push(firstAllowedRoute(user.permissions))}>
            Retour à mon espace
          </Button>
        </Box>
      </Box>
    );
  }

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  // Apparence : préférence individuelle (light / dark / system), appliquée
  // immédiatement et enregistrée côté serveur pour l'utilisateur de la session.
  const handleThemeChange = async (preference: ThemePreference) => {
    const previous = themePreference;
    setPreference(preference); // application immédiate, sans rechargement
    setSavingTheme(true);
    try {
      await setThemePreference(preference);
      setSnack({ message: 'Apparence enregistrée.', severity: 'success' });
    } catch {
      setPreference(previous); // retour visuel en cas d'échec d'enregistrement
      setSnack({ message: 'Enregistrement impossible : le serveur ne répond pas. L’apparence sera réappliquée à la prochaine connexion.', severity: 'error' });
    } finally {
      setSavingTheme(false);
    }
  };

  // Liste complète avec libellés (tiroir mobile + lanceur d'applications).
  const labeledNavList = (
    <Box>
      <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <SchoolOutlinedIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={800}>
          Logiciel Scolaire
        </Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1.5, py: 1 }}>
        {visibleItems.map((item) => (
          <ListItemButton
            key={item.label}
            selected={isActivePath(pathname, item.href)}
            onClick={() => {
              if (item.href) {
                router.push(item.href);
                setDrawerOpen(false);
                setLauncherEl(null);
              }
            }}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  // ---------------------------------------------------------------------------
  // Rail latéral flottant (desktop) — icônes seules, info-bulles, avatar en bas.
  // ---------------------------------------------------------------------------
  const rail = (
    <Box
      sx={{
        position: 'fixed',
        top: 12,
        left: 12,
        bottom: 12,
        width: RAIL_WIDTH - 24,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 6,
        boxShadow: '0 4px 18px rgba(31,36,48,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 2,
        px: 1,
        gap: 1,
        zIndex: (t) => t.zIndex.appBar,
      }}
    >
      {/* Logo */}
      <Box
        onClick={() => router.push('/dashboard')}
        title="Logiciel Scolaire"
        sx={{
          width: 44,
          height: 44,
          borderRadius: '16px',
          bgcolor: 'secondary.main',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          mb: 1,
          flexShrink: 0,
        }}
      >
        <SchoolOutlinedIcon />
      </Box>

      {/* Icônes épinglées */}
      {railItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Tooltip key={item.label} title={item.label} placement="right" arrow>
            <IconButton
              onClick={() => item.href && router.push(item.href)}
              sx={{
                width: 46,
                height: 46,
                flexShrink: 0,
                bgcolor: active ? 'primary.main' : 'transparent',
                color: active ? 'primary.contrastText' : 'text.secondary',
                '&:hover': {
                  bgcolor: active ? 'primary.dark' : 'action.hover',
                },
              }}
            >
              {item.icon}
            </IconButton>
          </Tooltip>
        );
      })}

      {/* Lanceur : tous les modules */}
      <Tooltip title="Tous les modules" placement="right" arrow>
        <IconButton
          onClick={(e) => setLauncherEl(e.currentTarget)}
          sx={{
            width: 46,
            height: 46,
            flexShrink: 0,
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <AppsOutlinedIcon />
        </IconButton>
      </Tooltip>

      <Box sx={{ flexGrow: 1 }} />

      {/* Paramètres (si autorisé) */}
      {hasPermission(user, 'settings.manage') && (
        <Tooltip title="Paramètres" placement="right" arrow>
          <IconButton
            onClick={() => router.push('/settings')}
            sx={{ width: 46, height: 46, flexShrink: 0, color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <SettingsOutlinedIcon />
          </IconButton>
        </Tooltip>
      )}

      {/* Avatar / compte */}
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ p: 0, flexShrink: 0, mt: 0.5 }}
        aria-label="Compte utilisateur"
      >
        <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: 14, fontWeight: 700 }}>
          {initialsOf(user.full_name)}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem disabled>
          <Box>
            <Typography variant="body2" fontWeight={700}>
              {user.full_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user.role_label} · {user.username}
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            APPARENCE
          </Typography>
        </Box>
        {(
          [
            ['light', 'Clair'],
            ['dark', 'Sombre'],
            ['system', 'Système'],
          ] as [ThemePreference, string][]
        ).map(([value, label]) => (
          <MenuItem
            key={value}
            selected={themePreference === value}
            disabled={savingTheme}
            onClick={() => handleThemeChange(value)}
          >
            <ListItemIcon>
              {value === 'light' ? <LightModeOutlinedIcon fontSize="small" /> : value === 'dark' ? <DarkModeOutlinedIcon fontSize="small" /> : <SettingsBrightnessOutlinedIcon fontSize="small" />}
            </ListItemIcon>
            {label}
            {themePreference === value && <CheckIcon fontSize="small" sx={{ ml: 'auto', color: 'primary.main' }} />}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" color="error" />
          </ListItemIcon>
          Déconnexion
        </MenuItem>
      </Menu>
    </Box>
  );

  const launcherOpen = Boolean(launcherEl);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {isDesktop && rail}

      {/* Tiroir mobile */}
      {!isDesktop && (
        <AppBar
          position="fixed"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Toolbar sx={{ gap: 1 }}>
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Menu">
              <MenuIcon />
            </IconButton>
            <Box sx={{ flexGrow: 1 }} />
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 13, fontWeight: 700 }}>
              {initialsOf(user.full_name)}
            </Avatar>
          </Toolbar>
        </AppBar>
      )}
      {!isDesktop && (
        <Drawer variant="temporary" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {labeledNavList}
        </Drawer>
      )}

      {/* Lanceur d'applications (tous les modules, avec libellés) */}
      <Popover
        open={launcherOpen}
        anchorEl={launcherEl}
        onClose={() => setLauncherEl(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{ paper: { sx: { borderRadius: 5, p: 2.5, maxWidth: 560, maxHeight: '70vh', overflow: 'auto' } } }}
      >
        <Typography variant="subtitle1" fontWeight={800} sx={{ px: 1, pb: 1.5 }}>
          Tous les modules
        </Typography>
        <Grid container spacing={0.5} sx={{ width: { xs: 'min(520px, calc(100vw - 32px))', sm: 520 } }}>
          {visibleItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Grid size={6} key={item.label}>
                <ListItemButton
                  onClick={() => {
                    if (item.href) {
                      router.push(item.href);
                      setLauncherEl(null);
                    }
                  }}
                  sx={{ borderRadius: 3, py: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: active ? 'primary.main' : 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: 13, fontWeight: active ? 700 : 500 }}
                  />
                </ListItemButton>
              </Grid>
            );
          })}
        </Grid>
      </Popover>

      <Box
        component="main"
        sx={{
          position: 'relative',
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 2, md: 3.5 },
          mt: { xs: 8, md: 0 },
          ml: { md: `${RAIL_WIDTH}px` },
        }}
      >
        {/* Fond personnalisé (portées « app » et « dashboard ») — derrière
            le contenu, les surfaces MUI restent opaques : lisibilité préservée. */}
        <BackgroundLayer scope="app" />
        <BackgroundLayer scope="dashboard" />
        <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
      </Box>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity ?? 'info'} variant="filled" onClose={() => setSnack(null)}>
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
