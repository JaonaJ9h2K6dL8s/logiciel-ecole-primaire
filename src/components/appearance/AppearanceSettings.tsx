'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import { useSnackbar } from 'notistack';
import { useTheme } from '@mui/material/styles';
import {
  APPEARANCE_DEFAULTS,
  EMPTY_APPEARANCE,
  saveAppearanceToServer,
  useAppearanceStore,
  type AppearanceSettings,
  type BackgroundScope,
  type MascotAnimationName,
  type ThemeModePref,
} from '@/stores/appearanceStore';
import { BACKGROUNDS, BACKGROUND_GROUPS, getBackground } from './backgrounds';
import { MASCOT_ANIMATIONS, MASCOTS } from '@/components/mascots/MascotCharacter';
import MascotCharacter from '@/components/mascots/MascotCharacter';

/** Palettes prédéfinies adaptées à une application scolaire. */
const PALETTES: { id: string; label: string; primary: string; secondary: string; accent: string }[] = [
  { id: 'bleu-educatif', label: 'Bleu éducatif', primary: '#1976D2', secondary: '#FF8A5C', accent: '#0288D1' },
  { id: 'vert-nature', label: 'Vert nature', primary: '#2E7D32', secondary: '#8BC34A', accent: '#66BB6A' },
  { id: 'violet-creatif', label: 'Violet créatif', primary: '#6C5CE7', secondary: '#F06292', accent: '#AB47BC' },
  { id: 'orange-energie', label: 'Orange énergique', primary: '#E65100', secondary: '#039BE5', accent: '#FF9800' },
  { id: 'rose-doux', label: 'Rose doux', primary: '#C2185B', secondary: '#7E57C2', accent: '#EC407A' },
  { id: 'turquoise', label: 'Turquoise', primary: '#00838F', secondary: '#FFB300', accent: '#26C6DA' },
  { id: 'classique', label: 'Thème classique', primary: '#2E7D6F', secondary: '#FF6B35', accent: '#4CAF9C' },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface ColorFieldProps {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}

/** Sélecteur de couleur personnalisé avec validation hex stricte. */
function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [text, setText] = useState(value ?? '');
  const [error, setError] = useState(false);
  const shown = value ?? '#000000';
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box
        component="input"
        type="color"
        value={shown}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const v = e.target.value;
          setText(v);
          setError(false);
          onChange(v);
        }}
        sx={{ width: 44, height: 36, border: 'none', background: 'none', cursor: 'pointer', p: 0 }}
        aria-label={`${label} — palette`}
      />
      <TextField
        size="small"
        label={label}
        value={text}
        error={error}
        helperText={error ? 'Format : #RRGGBB' : ' '}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (v === '') {
            setError(false);
            onChange(null);
          } else if (HEX_RE.test(v)) {
            setError(false);
            onChange(v);
          } else {
            setError(true);
          }
        }}
        sx={{ width: 170 }}
        placeholder="Défaut"
      />
    </Stack>
  );
}

export default function AppearanceSettings() {
  const store = useAppearanceStore();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  // Brouillon local : aperçu immédiat dans la page.
  const [draft, setDraft] = useState<AppearanceSettings>({ ...store.settings });
  // Dernier état connu/enregistré : point de retour du bouton « Annuler ».
  const [applied, setApplied] = useState<AppearanceSettings>({ ...store.settings });
  const [saving, setSaving] = useState(false);

  // Application INSTANTANÉE : chaque clic (palette, couleur, mode, arrondi)
  // met à jour le thème de toute l'application sans attendre « Appliquer »,
  // qui se contente d'enregistrer côté serveur.
  const patch = (p: Partial<AppearanceSettings>) => {
    setDraft((d) => ({ ...d, ...p }));
    store.setSettings(p);
  };

  const cancel = () => {
    setDraft({ ...applied });
    store.setSettings(applied);
  };

  const previewRadius = draft.borderRadius ?? APPEARANCE_DEFAULTS.borderRadius;
  const previewBg = getBackground(draft.backgroundId);
  const previewPrimary = draft.primaryColor ?? theme.palette.primary.main;

  const mascotList = useMemo(() => MASCOTS, []);

  const apply = async (override?: AppearanceSettings) => {
    const toSave = override ?? draft;
    setSaving(true);
    store.setSettings(toSave);
    setApplied({ ...toSave });
    const ok = await saveAppearanceToServer(toSave);
    setSaving(false);
    if (ok) {
      enqueueSnackbar('Préférences d’apparence enregistrées.', { variant: 'success' });
    } else {
      enqueueSnackbar('Préférences appliquées localement, mais l’enregistrement serveur a échoué.', { variant: 'warning' });
    }
  };

  const reset = async () => {
    const cleared = { ...EMPTY_APPEARANCE };
    setDraft(cleared);
    setApplied({ ...cleared });
    store.resetSettings();
    setSaving(true);
    const ok = await saveAppearanceToServer(cleared);
    setSaving(false);
    enqueueSnackbar(
      ok ? 'Préférences réinitialisées par défaut.' : 'Réinitialisé localement (serveur injoignable).',
      { variant: ok ? 'success' : 'warning' }
    );
  };

  return (
    <Stack spacing={3}>
      {/* ————— Aperçu en direct ————— */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Aperçu en direct
        </Typography>
        <Box
          sx={{
            position: 'relative',
            borderRadius: 2,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            minHeight: 120,
          }}
        >
          {previewBg && draft.backgroundType !== 'none' && (
            <Box sx={{ position: 'absolute', inset: 0, ...previewBg.css, opacity: (draft.backgroundOpacity ?? APPEARANCE_DEFAULTS.backgroundOpacity) / 100 }} />
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" sx={{ position: 'relative', p: 2 }}>
            <Stack spacing={1.5} sx={{ flex: 1, width: '100%' }}>
              <Paper sx={{ p: 1.5, borderRadius: previewRadius }}>
                <Typography variant="body2" fontWeight={700}>Carte de contenu</Typography>
                <Typography variant="caption" color="text.secondary">
                  Le fond reste derrière les surfaces opaques : la lisibilité est préservée.
                </Typography>
              </Paper>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" sx={{ borderRadius: previewRadius / 2, bgcolor: previewPrimary }}>
                  Bouton
                </Button>
                <Button variant="outlined" size="small" sx={{ borderRadius: previewRadius / 2 }}>
                  Secondaire
                </Button>
              </Stack>
            </Stack>
            <MascotCharacter design={MASCOTS[0]} animation={draft.mascotAnimation ?? 'wave'} size={86} />
          </Stack>
        </Box>
      </Card>

      {/* ————— Couleurs ————— */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Couleurs du thème
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {PALETTES.map((p) => {
            const active =
              draft.primaryColor?.toLowerCase() === p.primary.toLowerCase() &&
              draft.secondaryColor?.toLowerCase() === p.secondary.toLowerCase();
            return (
              <Button
                key={p.id}
                size="small"
                variant={active ? 'contained' : 'outlined'}
                onClick={() => patch({ primaryColor: p.primary, secondaryColor: p.secondary, accentColor: p.accent })}
                startIcon={
                  <Box sx={{ width: 14, height: 14, borderRadius: '50%', background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }} />
                }
                sx={{ textTransform: 'none' }}
              >
                {p.label}
              </Button>
            );
          })}
        </Stack>
        <Grid container spacing={1}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <ColorField label="Couleur principale" value={draft.primaryColor} onChange={(v) => patch({ primaryColor: v })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <ColorField label="Couleur secondaire" value={draft.secondaryColor} onChange={(v) => patch({ secondaryColor: v })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <ColorField label="Accentuation" value={draft.accentColor} onChange={(v) => patch({ accentColor: v })} />
          </Grid>
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Mode d’affichage</InputLabel>
              <Select
                label="Mode d’affichage"
                value={draft.themeMode ?? 'system'}
                onChange={(e) => patch({ themeMode: e.target.value as ThemeModePref })}
              >
                <MenuItem value="light">Clair</MenuItem>
                <MenuItem value="dark">Sombre</MenuItem>
                <MenuItem value="system">Suivre le système</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Arrondi des éléments : {previewRadius} px
            </Typography>
            <Slider
              min={0}
              max={24}
              step={2}
              value={previewRadius}
              onChange={(_, v) => patch({ borderRadius: v as number })}
              marks
              valueLabelDisplay="auto"
            />
          </Grid>
        </Grid>
      </Card>

      {/* ————— Fond d’écran ————— */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>Fond d’écran</Typography>
          <FormControlLabel
            control={<Switch checked={draft.backgroundType !== 'none'} onChange={(e) => patch({ backgroundType: e.target.checked ? 'gradient' : 'none', backgroundId: e.target.checked ? (draft.backgroundId ?? 'grad-sky') : null })} />}
            label="Activer"
          />
        </Stack>
        {draft.backgroundType !== 'none' && (
          <>
            {BACKGROUND_GROUPS.map((g) => (
              <Box key={g.type} sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{g.label}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {BACKGROUNDS.filter((b) => b.type === g.type).map((b) => (
                    <Box
                      key={b.id}
                      component="button"
                      onClick={() => patch({ backgroundId: b.id, backgroundType: b.type })}
                      aria-label={`Fond ${b.label}`}
                      sx={{
                        width: 64,
                        height: 44,
                        borderRadius: 1.5,
                        cursor: 'pointer',
                        border: draft.backgroundId === b.id ? '2px solid' : '1px solid',
                        borderColor: draft.backgroundId === b.id ? 'primary.main' : 'divider',
                        p: 0,
                        overflow: 'hidden',
                        ...b.thumbCss,
                      }}
                    >
                      {draft.backgroundId === b.id && (
                        <CheckOutlinedIcon sx={{ fontSize: 16, color: 'primary.main', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: '50%' }} />
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Intensité : {draft.backgroundOpacity ?? APPEARANCE_DEFAULTS.backgroundOpacity} %
                </Typography>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={draft.backgroundOpacity ?? APPEARANCE_DEFAULTS.backgroundOpacity}
                  onChange={(_, v) => patch({ backgroundOpacity: v as number })}
                  valueLabelDisplay="auto"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Portée du fond</InputLabel>
                  <Select
                    label="Portée du fond"
                    value={draft.backgroundScope ?? 'dashboard'}
                    onChange={(e) => patch({ backgroundScope: e.target.value as BackgroundScope })}
                  >
                    <MenuItem value="dashboard">Dashboard uniquement</MenuItem>
                    <MenuItem value="app">Toute l’application</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </>
        )}
      </Card>

      {/* ————— Mascottes ————— */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>Mascottes</Typography>
          <FormControlLabel
            control={<Switch checked={draft.mascotEnabled ?? true} onChange={(e) => patch({ mascotEnabled: e.target.checked })} />}
            label="Afficher"
          />
        </Stack>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Mascotte préférée</InputLabel>
              <Select
                label="Mascotte préférée"
                value={draft.selectedMascotId ?? ''}
                onChange={(e) => patch({ selectedMascotId: e.target.value || null })}
              >
                <MenuItem value="">
                  <em>Défilement libre</em>
                </MenuItem>
                {mascotList.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Animation</InputLabel>
              <Select
                label="Animation"
                value={draft.mascotAnimation ?? 'wave'}
                onChange={(e) => patch({ mascotAnimation: e.target.value as MascotAnimationName })}
              >
                {MASCOT_ANIMATIONS.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FormControlLabel
              control={<Switch checked={draft.mascotCarouselEnabled ?? true} onChange={(e) => patch({ mascotCarouselEnabled: e.target.checked })} />}
              label="Défilement automatique"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Intervalle : {draft.mascotCarouselInterval ?? APPEARANCE_DEFAULTS.mascotCarouselInterval} s
            </Typography>
            <Slider
              min={3}
              max={60}
              step={1}
              value={draft.mascotCarouselInterval ?? APPEARANCE_DEFAULTS.mascotCarouselInterval}
              onChange={(_, v) => patch({ mascotCarouselInterval: v as number })}
              disabled={!(draft.mascotCarouselEnabled ?? true)}
              valueLabelDisplay="auto"
            />
          </Grid>
        </Grid>
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Les animations respectent la préférence système « réduire les mouvements ». Leurs messages sont génériques et n’affichent aucune donnée personnelle.
        </Alert>
      </Card>

      {/* ————— Actions ————— */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
        <Button startIcon={<RestartAltOutlinedIcon />} onClick={() => void reset()} disabled={saving}>
          Réinitialiser par défaut
        </Button>
        <Button startIcon={<UndoOutlinedIcon />} onClick={cancel} disabled={saving}>
          Annuler
        </Button>
        <Button variant="contained" onClick={() => void apply()} disabled={saving}>
          Appliquer
        </Button>
      </Stack>
    </Stack>
  );
}
