'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  GlobalStyles,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { loadAppearanceFromServer, mergeServerSettings } from '@/stores/appearanceStore';
import { firstAllowedRoute } from '@/components/admin/AdminShell';
import { MASCOTS } from '@/components/mascots/MascotCharacter';
import MascotCharacter from '@/components/mascots/MascotCharacter';

const REMEMBER_KEY = 'login.rememberedUsername';

/** Types d'espaces de connexion, un jeu de champs chacun. */
type Portal = 'teacher' | 'admin';

const PORTALS: Array<{
  id: Portal;
  title: string;
  chipLabel: string;
  subtitle: string;
  mascotId: string;
  roles: string[];
}> = [
  {
    id: 'teacher',
    title: 'Espace Professeur',
    chipLabel: 'Professeur',
    subtitle: 'Réservé aux comptes professeurs et personnel',
    mascotId: 'garcon',
    roles: ['teacher', 'reception'],
  },
  {
    id: 'admin',
    title: 'Espace Administrateur',
    chipLabel: 'Administrateur',
    subtitle: 'Réservé aux comptes administrateurs',
    mascotId: 'blaireau',
    roles: ['admin'],
  },
];

/** Animations décoratives de la page (formes flottantes, entrée de carte…). */
const loginGlobalStyles = (
  <GlobalStyles
    styles={{
      '@keyframes login-float-a': {
        '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
        '50%': { transform: 'translate(14px, -18px) rotate(6deg)' },
      },
      '@keyframes login-float-b': {
        '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
        '50%': { transform: 'translate(-16px, 14px) rotate(-8deg)' },
      },
      '@keyframes login-float-c': {
        '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
        '50%': { transform: 'translate(10px, 12px) scale(1.06)' },
      },
      '@keyframes login-sway': {
        '0%, 100%': { transform: 'rotate(-4deg)' },
        '50%': { transform: 'rotate(4deg)' },
      },
      '@keyframes login-card-in': {
        from: { opacity: 0, transform: 'translateY(28px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
      '@keyframes login-scene-in': {
        from: { opacity: 0, transform: 'scale(0.94)' },
        to: { opacity: 1, transform: 'scale(1)' },
      },
      '@media (prefers-reduced-motion: reduce)': {
        '& [data-login-anim]': {
          animation: 'none !important',
        },
      },
    }}
  />
);

/** Forme géométrique flottante du fond de page. */
function FloatingShape({
  type,
  color,
  opacity,
  size,
  top,
  left,
  right,
  bottom,
  duration,
  variant,
}: {
  type: 'circle' | 'halfcircle' | 'diamond' | 'arc' | 'ring';
  color: string;
  opacity: number;
  size: number;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  duration: number;
  variant: 'a' | 'b' | 'c';
}) {
  return (
    <Box
      data-login-anim
      aria-hidden
      sx={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        width: size,
        height: size,
        opacity,
        animation: `login-float-${variant} ${duration}s ease-in-out infinite alternate`,
        ...(type === 'circle' && { borderRadius: '50%', bgcolor: color }),
        ...(type === 'ring' && { borderRadius: '50%', border: `${Math.round(size / 10)}px solid ${color}` }),
        ...(type === 'halfcircle' && {
          borderRadius: `${size}px ${size}px 0 0`,
          bgcolor: color,
          transform: 'rotate(90deg)',
        }),
        ...(type === 'diamond' && {
          bgcolor: color,
          transform: 'rotate(45deg)',
          borderRadius: 4,
        }),
        ...(type === 'arc' && {
          borderRadius: '50%',
          bgcolor: 'transparent',
          border: `${Math.round(size / 8)}px solid ${color}`,
          borderTopColor: 'transparent',
          borderLeftColor: 'transparent',
          transform: 'rotate(30deg)',
        }),
      }}
    />
  );
}

/** Plante stylisée dans un vase, balancement doux. */
function PottedPlant() {
  return (
    <Box
      data-login-anim
      aria-hidden
      sx={{
        transformOrigin: 'bottom center',
        animation: 'login-sway 5s ease-in-out infinite',
      }}
    >
      <svg width="86" height="120" viewBox="0 0 86 120">
        {/* Feuilles */}
        <path d="M43 62 Q28 44 33 24 Q46 36 45 60 Z" fill="#57B87B" />
        <path d="M43 62 Q58 44 53 22 Q39 36 41 60 Z" fill="#3E9A63" />
        <path d="M43 60 Q43 34 43 18 Q50 34 45 60 Z" fill="#6FCB8F" />
        {/* Tige */}
        <path d="M43 62 L43 80" stroke="#3E9A63" strokeWidth="3" strokeLinecap="round" />
        {/* Vase */}
        <path d="M30 78 L56 78 L52 112 Q43 116 34 112 Z" fill="#DCE7FB" />
        <path d="M28 76 L58 76 L58 82 L28 82 Z" fill="#C3D4F6" />
        {/* Motif du vase */}
        <circle cx="43" cy="94" r="4" fill="#F2B84B" />
      </svg>
    </Box>
  );
}

/** Scène illustrée de la colonne droite : ardoise + mascotte + plante. */
function LoginScene({ design, reducedMotion }: { design: (typeof MASCOTS)[number]; reducedMotion: boolean }) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 320,
        mx: 'auto',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Ardoise / tableau blanc légèrement penché */}
      <Box
        sx={{
          position: 'relative',
          width: '86%',
          transform: 'rotate(-4deg)',
          bgcolor: '#FFFFFF',
          borderRadius: '18px',
          border: '1px solid #E3E8F0',
          boxShadow: '0 18px 40px rgba(36,86,230,0.14)',
          px: 3,
          pt: 3,
          pb: 8,
        }}
      >
        {/* Barre supérieure du tableau */}
        <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#F2B84B' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#57B87B' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#E23B3B' }} />
        </Stack>
        {/* Lignes placeholder arrondies */}
        <Box sx={{ width: '92%', height: 12, borderRadius: 999, bgcolor: '#EDF2FB', mb: 1.5 }} />
        <Box sx={{ width: '75%', height: 12, borderRadius: 999, bgcolor: '#EDF2FB', mb: 1.5 }} />
        <Box sx={{ width: '84%', height: 12, borderRadius: 999, bgcolor: '#EDF2FB' }} />
      </Box>

      {/* Mascotte devant le tableau, salutation en boucle douce */}
      <Box
        key={design.id}
        data-login-anim={!reducedMotion ? 'true' : undefined}
        sx={{
          position: 'absolute',
          bottom: -14,
          left: '50%',
          ml: '-60px',
          animation: reducedMotion ? undefined : 'login-scene-in 0.45s ease both',
          transition: 'opacity 0.3s ease',
        }}
      >
        <MascotCharacter design={design} animation="wave" reducedMotion={reducedMotion} size={130} />
      </Box>

      {/* Plante à côté du tableau */}
      <Box sx={{ position: 'absolute', bottom: -14, right: -6 }}>
        <PottedPlant />
      </Box>
    </Box>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  // Un état de formulaire par portail.
  const [forms, setForms] = useState<Record<Portal, { username: string; password: string }>>({
    teacher: { username: '', password: '' },
    admin: { username: '', password: '' },
  });
  const [remember, setRemember] = useState<Record<Portal, boolean>>({ teacher: false, admin: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [portalError, setPortalError] = useState<Partial<Record<Portal, string>>>({});
  const [loadingPortal, setLoadingPortal] = useState<Portal | null>(null);
  // Espace choisi : contrôlé par le segmented control.
  const [activePortal, setActivePortal] = useState<Portal>('teacher');

  // Respect des préférences de mouvement réduit.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // « Se souvenir de moi » : pré-remplit l'identifiant depuis le navigateur.
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setForms((f) => ({ teacher: { ...f.teacher, username: saved }, admin: { ...f.admin, username: saved } }));
      setRemember({ teacher: true, admin: true });
    }
  }, []);

  const setField = (portal: Portal, field: 'username' | 'password', value: string) => {
    setForms((f) => ({ ...f, [portal]: { ...f[portal], [field]: value } }));
  };

  const handleSubmit = async (portal: Portal) => {
    setPortalError((e) => ({ ...e, [portal]: null }));
    const { username, password } = forms[portal];
    const errors: Record<string, string> = {};
    if (!username.trim()) errors[`${portal}-username`] = 'Veuillez saisir votre identifiant.';
    if (!password) errors[`${portal}-password`] = 'Veuillez saisir votre mot de passe.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoadingPortal(portal);
    try {
      const user = await login(username.trim(), password);
      const allowed = PORTALS.find((p) => p.id === portal)?.roles ?? [];
      if (user?.role_code && !allowed.includes(user.role_code)) {
        // Compte valide mais mauvais espace : session fermée immédiatement.
        await logout();
        setPortalError((e) => ({
          ...e,
          [portal]:
            user.role_code === 'admin'
              ? "Ce compte est administrateur : utilisez l'espace Administrateur."
              : "Ce compte n'a pas accès à cet espace.",
        }));
        return;
      }
      if (remember[portal]) window.localStorage.setItem(REMEMBER_KEY, username.trim());
      else window.localStorage.removeItem(REMEMBER_KEY);
      // Préférences d'apparence du compte restaurées avant la première page.
      const prefs = await loadAppearanceFromServer();
      if (prefs) mergeServerSettings(prefs);
      router.replace(firstAllowedRoute(user?.permissions ?? []));
    } catch (err) {
      if (err instanceof ApiError) {
        setPortalError((e) => ({ ...e, [portal]: err.message }));
      } else {
        setPortalError((e) => ({
          ...e,
          [portal]: 'Impossible de joindre le serveur. Vérifiez que le backend est démarré.',
        }));
      }
    } finally {
      setLoadingPortal(null);
    }
  };

  const active = PORTALS.find((p) => p.id === activePortal) ?? PORTALS[0];
  const form = forms[activePortal];
  const loading = loadingPortal === activePortal;
  const activeDesign = MASCOTS.find((m) => m.id === active.mascotId) ?? MASCOTS[0];

  return (
    <>
      {loginGlobalStyles}
      <Box
        sx={{
          position: 'relative',
          minHeight: '100vh',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: { xs: 3, md: 6 },
          px: { xs: 2, md: 4 },
          background: 'linear-gradient(160deg, #2F6BFF 0%, #2456E6 100%)',
        }}
      >
        {/* Grandes formes géométriques du fond, animations lentes */}
        <FloatingShape type="circle" color="#5C8BFF" opacity={0.22} size={280} top={-70} left={-60} duration={9} variant="a" />
        <FloatingShape type="ring" color="#7EA5FF" opacity={0.18} size={180} top="12%" right="-40px" duration={11} variant="b" />
        <FloatingShape type="diamond" color="#1D47C4" opacity={0.25} size={140} bottom="8%" left="6%" duration={10} variant="b" />
        <FloatingShape type="halfcircle" color="#5C8BFF" opacity={0.2} size={190} bottom={-60} right="10%" duration={8} variant="a" />
        <FloatingShape type="arc" color="#8FB3FF" opacity={0.25} size={150} top="6%" left="38%" duration={12} variant="c" />
        <FloatingShape type="circle" color="#1D47C4" opacity={0.18} size={90} bottom="26%" right="30%" duration={7} variant="a" />
        <FloatingShape type="diamond" color="#8FB3FF" opacity={0.16} size={70} top="48%" left="4%" duration={9} variant="c" />

        {/* Carte centrale */}
        <Box
          data-login-anim
          sx={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 1000,
            bgcolor: '#FFFFFF',
            borderRadius: { xs: '20px', md: '26px' },
            boxShadow: '0 30px 80px rgba(13,35,99,0.35)',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            overflow: 'hidden',
            animation: reducedMotion ? undefined : 'login-card-in 0.5s ease both',
          }}
        >
          {/* Colonne gauche : formulaire */}
          <Box
            sx={{
              flex: { md: '1 1 55%' },
              px: { xs: 3, sm: 5, md: 6 },
              py: { xs: 4, md: 6 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {/* Segmented control : choix de l'espace */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignSelf: 'flex-start',
                mb: 4,
                p: 0.5,
                borderRadius: 999,
                bgcolor: '#F1F4FA',
              }}
            >
              {PORTALS.map((p) => {
                const isActive = p.id === activePortal;
                return (
                  <Box
                    key={p.id}
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={0}
                    onClick={() => setActivePortal(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActivePortal(p.id);
                      }
                    }}
                    sx={{
                      cursor: 'pointer',
                      px: { xs: 2, sm: 2.5 },
                      py: 0.75,
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 700,
                      userSelect: 'none',
                      transition: 'background-color 0.2s ease, color 0.2s ease, transform 0.15s ease',
                      ...(isActive
                        ? { bgcolor: '#2F6BFF', color: '#FFFFFF', boxShadow: '0 6px 14px rgba(47,107,255,0.35)' }
                        : { bgcolor: 'transparent', color: '#5A6B8C', '&:hover': { bgcolor: '#E5EBF7' } }),
                    }}
                  >
                    {p.chipLabel}
                  </Box>
                );
              })}
            </Stack>

            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.22em',
                color: '#2F6BFF',
                mb: 1,
              }}
            >
              CONNEXION
            </Typography>
            <Typography component="h1" sx={{ fontSize: { xs: 30, md: 36 }, fontWeight: 800, color: '#1B2B55', lineHeight: 1.15 }}>
              Bonjour<span style={{ color: '#2F6BFF' }}> !</span>
            </Typography>
            <Typography sx={{ mt: 1, mb: 3.5, color: '#5A6B8C', fontSize: 15 }}>
              Pas encore de compte ?{' '}
              <Link href="#" underline="hover" sx={{ color: '#2F6BFF', fontWeight: 600 }} onClick={(e) => e.preventDefault()}>
                Contactez l&apos;administrateur.
              </Link>
            </Typography>

            {/* Message d'erreur de l'espace actif */}
            {portalError[activePortal] && (
              <Alert
                severity="error"
                sx={{
                  mb: 2.5,
                  width: '100%',
                  borderRadius: '12px',
                  '& .MuiAlert-icon': { alignItems: 'center' },
                }}
              >
                {portalError[activePortal]}
              </Alert>
            )}

            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(activePortal);
              }}
              noValidate
              sx={{ width: '100%' }}
            >
              <Stack spacing={2.5}>
                <TextField
                  label="Identifiant ou e-mail"
                  variant="outlined"
                  value={form.username}
                  onChange={(e) => setField(activePortal, 'username', e.target.value)}
                  error={Boolean(fieldErrors[`${activePortal}-username`])}
                  helperText={fieldErrors[`${activePortal}-username`]}
                  fullWidth
                  disabled={loadingPortal !== null}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <PersonOutlinedIcon fontSize="small" sx={{ color: '#8B99B5' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      bgcolor: '#FFFFFF',
                      '& fieldset': { borderColor: '#E3E8F0' },
                      '&:hover fieldset': { borderColor: '#B9C8EA' },
                      '&.Mui-focused fieldset': { borderColor: '#2F6BFF' },
                    },
                    '& .MuiInputLabel-root': { fontWeight: 600, fontSize: 14 },
                  }}
                />
                <TextField
                  label="Mot de passe"
                  type="password"
                  variant="outlined"
                  value={form.password}
                  onChange={(e) => setField(activePortal, 'password', e.target.value)}
                  error={Boolean(fieldErrors[`${activePortal}-password`])}
                  helperText={fieldErrors[`${activePortal}-password`]}
                  fullWidth
                  disabled={loadingPortal !== null}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <LockOutlinedIcon fontSize="small" sx={{ color: '#8B99B5' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      bgcolor: '#FFFFFF',
                      '& fieldset': { borderColor: '#E3E8F0' },
                      '&:hover fieldset': { borderColor: '#B9C8EA' },
                      '&.Mui-focused fieldset': { borderColor: '#2F6BFF' },
                    },
                    '& .MuiInputLabel-root': { fontWeight: 600, fontSize: 14 },
                  }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={remember[activePortal]}
                      onChange={(e) => setRemember((r) => ({ ...r, [activePortal]: e.target.checked }))}
                      sx={{ color: '#8B99B5', '&.Mui-checked': { color: '#2F6BFF' } }}
                    />
                  }
                  label={<Typography variant="body2" sx={{ color: '#5A6B8C' }}>Se souvenir de moi</Typography>}
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loadingPortal !== null}
                  disableElevation
                  sx={{
                    borderRadius: 999,
                    py: 1.4,
                    fontWeight: 700,
                    fontSize: 16,
                    bgcolor: '#2F6BFF',
                    '&:hover': {
                      bgcolor: '#2456E6',
                      transform: reducedMotion ? undefined : 'scale(1.02)',
                    },
                    transition: 'transform 0.15s ease, background-color 0.2s ease',
                  }}
                >
                  {loading ? <CircularProgress size={22} color="inherit" /> : 'Se connecter'}
                </Button>
              </Stack>
            </Box>

            <Typography sx={{ mt: 2, color: '#8B99B5', fontSize: 13, textAlign: 'center' }}>
              En cas d&apos;oubli, contactez l&apos;administrateur.
            </Typography>
          </Box>

          {/* Colonne droite : scène illustrée animée (masquée sous sm) */}
          <Box
            sx={{
              flex: { md: '1 1 45%' },
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              px: 5,
              py: 6,
              position: 'relative',
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #F3F7FF 0%, #EDF3FF 100%)',
              borderLeft: '1px solid #E9EFFB',
            }}
          >
            {/* Petites formes flottantes claires de la scène */}
            <Box data-login-anim aria-hidden sx={{ position: 'absolute', top: 26, left: 30, width: 42, height: 42, borderRadius: '50%', bgcolor: 'rgba(47,107,255,0.10)', animation: 'login-float-c 8s ease-in-out infinite alternate' }} />
            <Box data-login-anim aria-hidden sx={{ position: 'absolute', top: 60, right: 34, width: 30, height: 30, bgcolor: 'rgba(47,107,255,0.12)', borderRadius: 2, transform: 'rotate(45deg)', animation: 'login-float-a 10s ease-in-out infinite alternate' }} />
            <Box data-login-anim aria-hidden sx={{ position: 'absolute', bottom: 90, right: 60, width: 18, height: 18, borderRadius: '50%', bgcolor: 'rgba(242,184,75,0.35)', animation: 'login-float-b 9s ease-in-out infinite alternate' }} />

            <LoginScene design={activeDesign} reducedMotion={reducedMotion} />

            <Typography sx={{ mt: 5, color: '#5A6B8C', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>
              {active.title}
            </Typography>
            <Typography sx={{ mt: 0.5, color: '#8B99B5', fontSize: 13, textAlign: 'center' }}>
              {active.subtitle}
            </Typography>
          </Box>
        </Box>
      </Box>
    </>
  );
}
