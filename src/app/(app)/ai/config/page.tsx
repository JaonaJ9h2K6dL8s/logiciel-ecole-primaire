'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';

interface AiConfigInfo {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  apiKeyEnv: boolean;
  lastCheckOk: boolean | null;
  lastCheckAt: string | null;
  lastCheckMessage: string | null;
}

interface OllamaStatusInfo {
  reachable: boolean;
  modelInstalled: boolean | null;
  models: string[];
  message: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  none: 'Aucun (IA désactivée)',
  openai: 'OpenAI (distant)',
  anthropic: 'Anthropic (distant)',
  ollama: 'Ollama (modèle local)',
};

export default function AiConfigPage() {
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('pedagogical_ai.manage') ?? false;

  const [cfg, setCfg] = useState<AiConfigInfo | null>(null);
  const [form, setForm] = useState({ provider: 'none', model: '', baseUrl: '' });
  const [ollama, setOllama] = useState<OllamaStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ config: AiConfigInfo }>('/pedagogical-ai/config');
      setCfg(res.config);
      setForm({
        provider: res.config.provider,
        model: res.config.model ?? '',
        baseUrl: res.config.baseUrl ?? '',
      });
      if (res.config.provider === 'ollama') {
        // État du moteur local : vérification légère, distincte d'une génération.
        try {
          setOllama(await api.get<OllamaStatusInfo>('/pedagogical-ai/config/ollama-status'));
        } catch {
          setOllama(null);
        }
      } else {
        setOllama(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ config: AiConfigInfo }>('/pedagogical-ai/config', {
        provider: form.provider,
        model: form.model.trim() === '' ? null : form.model.trim(),
        baseUrl: form.baseUrl.trim() === '' ? null : form.baseUrl.trim(),
      });
      setCfg(res.config);
      setSnack('Configuration enregistrée. Testez la connexion pour vérifier la disponibilité réelle.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; message: string }>('/pedagogical-ai/config/check');
      setSnack(res.ok ? `Connexion vérifiée : ${res.message}` : `Échec du test : ${res.message}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setChecking(false);
    }
  };

  const statusChip = () => {
    if (!cfg) return <Chip icon={<HelpOutlineOutlinedIcon />} label="Non chargé" variant="outlined" />;
    if (cfg.provider === 'none') return <Chip icon={<CloudOffOutlinedIcon />} label="Non configuré" color="warning" variant="outlined" />;
    if (cfg.lastCheckOk === true) return <Chip icon={<CloudDoneOutlinedIcon />} label="Disponible" color="success" variant="outlined" />;
    if (cfg.lastCheckOk === false) return <Chip icon={<CloudOffOutlinedIcon />} label="Indisponible" color="error" variant="outlined" />;
    return <Chip icon={<HelpOutlineOutlinedIcon />} label="Jamais testé" variant="outlined" />;
  };

  return (
    <Box>
      <PageHeader title="Configuration de l'assistant IA" subtitle="Fournisseur, modèle et vérification de disponibilité" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Consultation seule : la modification est réservée aux administrateurs.
        </Alert>
      )}

      <Card sx={{ p: 3, maxWidth: 720 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={800}>
            État du service
          </Typography>
          {statusChip()}
        </Stack>
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body2">
            Fournisseur actif : <b>{cfg ? PROVIDER_LABELS[cfg.provider] ?? cfg.provider : '—'}</b>
          </Typography>
          <Typography variant="body2">
            Modèle : <b>{cfg?.model ?? 'non défini'}</b>
          </Typography>
          <Typography variant="body2">
            Clé API présente dans l&apos;environnement serveur : <b>{cfg?.apiKeyEnv ? 'oui (jamais exposée ici)' : 'non'}</b>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Dernier contrôle : {cfg?.lastCheckAt ? `${new Date(cfg.lastCheckAt).toLocaleString('fr-FR')} — ${cfg.lastCheckMessage ?? ''}` : 'jamais effectué'}
          </Typography>
        </Stack>
        <Button variant="outlined" disabled={!canManage || checking || cfg?.provider === 'none'} onClick={check}>
          {checking ? 'Test en cours…' : 'Tester la connexion (génération réelle)'}
        </Button>

        {/* État du moteur local Ollama : 3 niveaux distincts, aucune
            génération lancée pour cette vérification légère. */}
        {cfg?.provider === 'ollama' && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
              Moteur local Ollama
            </Typography>
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                {ollama === null ? (
                  <Chip icon={<HelpOutlineOutlinedIcon />} label="État inconnu" variant="outlined" />
                ) : ollama.reachable ? (
                  <Chip icon={<CloudDoneOutlinedIcon />} label="Ollama accessible" color="success" variant="outlined" />
                ) : (
                  <Chip icon={<CloudOffOutlinedIcon />} label="Ollama arrêté ou inaccessible" color="error" variant="outlined" />
                )}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                {ollama === null ? (
                  <Chip icon={<HelpOutlineOutlinedIcon />} label="Modèle : état inconnu" variant="outlined" />
                ) : ollama.modelInstalled === true ? (
                  <Chip icon={<CloudDoneOutlinedIcon />} label={`Modèle installé (${cfg.model ?? '—'})`} color="success" variant="outlined" />
                ) : ollama.modelInstalled === false ? (
                  <Chip icon={<CloudOffOutlinedIcon />} label={`Modèle non installé (${cfg.model ?? '—'})`} color="warning" variant="outlined" />
                ) : (
                  <Chip icon={<HelpOutlineOutlinedIcon />} label="Modèle : non vérifiable" variant="outlined" />
                )}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                {cfg.lastCheckOk === true ? (
                  <Chip icon={<CloudDoneOutlinedIcon />} label="Génération testée avec succès" color="success" variant="outlined" />
                ) : cfg.lastCheckOk === false ? (
                  <Chip icon={<CloudOffOutlinedIcon />} label="Génération testée : échec" color="error" variant="outlined" />
                ) : (
                  <Chip icon={<HelpOutlineOutlinedIcon />} label="Génération jamais testée" variant="outlined" />
                )}
              </Stack>
              {ollama && (
                <Typography variant="body2" color="text.secondary">
                  {ollama.message}
                  {ollama.models.length > 0 && ` Modèles installés : ${ollama.models.join(', ')}.`}
                </Typography>
              )}
              {ollama && !ollama.reachable && (
                <Alert severity="warning">
                  Le moteur IA local n&apos;est pas joignable. Aucune donnée n&apos;a quitté le serveur. L&apos;administrateur doit démarrer
                  Ollama sur le PC serveur (aucun téléchargement automatique n&apos;est effectué).
                </Alert>
              )}
            </Stack>
          </>
        )}

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
          Configuration
        </Typography>
        <Stack spacing={2}>
          <TextField
            select
            label="Fournisseur"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            disabled={!canManage}
            helperText="La clé API se définit uniquement dans les variables d'environnement du serveur (AI_API_KEY) — jamais ici."
          >
            {Object.entries(PROVIDER_LABELS).map(([k, label]) => (
              <MenuItem key={k} value={k}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Modèle"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            disabled={!canManage}
            helperText="Ex. : gpt-4o-mini, claude-3-5-haiku-latest, llama3.1 (local)"
          />
          <TextField
            label="URL de base (facultatif)"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            disabled={!canManage}
            helperText="Proxy d'établissement ou Ollama local (ex. : http://127.0.0.1:11434)"
          />
          {canManage && (
            <Button variant="contained" disabled={saving} onClick={save}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          )}
        </Stack>

        <Alert severity="info" sx={{ mt: 3 }}>
          Aucun contenu officiel (notes, appréciations, bulletins, décisions) n&apos;est modifié par l&apos;IA. Les modules de gestion
          fonctionnent normalement sans Internet et sans fournisseur configuré.
        </Alert>
      </Card>

      <Snackbar open={Boolean(snack)} autoHideDuration={5000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
