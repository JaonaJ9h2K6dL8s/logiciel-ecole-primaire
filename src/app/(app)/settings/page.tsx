'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';

interface SettingsData {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  timezone: string;
  documentHeader: string | null;
  documentFooter: string | null;
}

const MAX_LOGO_BYTES = 400 * 1024;

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('settings.manage'));
  const [form, setForm] = useState<SettingsData>({
    schoolName: '',
    address: '',
    phone: '',
    email: '',
    logo: '',
    timezone: 'Indian/Antananarivo',
    documentHeader: '',
    documentFooter: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: SettingsData | null }>('/settings');
      if (res.data) {
        setForm({
          schoolName: res.data.schoolName ?? '',
          address: res.data.address ?? '',
          phone: res.data.phone ?? '',
          email: res.data.email ?? '',
          logo: res.data.logo ?? '',
          timezone: res.data.timezone ?? 'Indian/Antananarivo',
          documentHeader: res.data.documentHeader ?? '',
          documentFooter: res.data.documentFooter ?? '',
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogo = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Le logo doit être une image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo trop volumineux (max 400 Ko).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (form.schoolName.trim().length < 2) {
      setError('Le nom de l’établissement est requis.');
      return;
    }
    setSaving(true);
    setSuccess(false);
    try {
      await api.put('/settings', {
        schoolName: form.schoolName.trim(),
        address: form.address ?? '',
        phone: form.phone ?? '',
        email: form.email ?? '',
        logo: form.logo ?? '',
        timezone: form.timezone,
        documentHeader: form.documentHeader ?? '',
        documentFooter: form.documentFooter ?? '',
      });
      setSuccess(true);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Paramètres" />
        <Card><CardContent>Chargement…</CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Paramètres de l’établissement"
        subtitle="Ces informations alimentent l’application et les futurs documents imprimables"
        action={
          canManage ? (
            <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={handleSave} disabled={saving}>
              Enregistrer
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          Paramètres enregistrés. La modification est consignée dans les journaux d’audit.
        </Alert>
      )}

      <Card>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={2}>
                <TextField
                  label="Nom de l’établissement"
                  value={form.schoolName}
                  onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                  disabled={!canManage}
                  required
                />
                <TextField
                  label="Adresse"
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  disabled={!canManage}
                />
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Téléphone"
                      value={form.phone ?? ''}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      disabled={!canManage}
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Adresse électronique (facultatif)"
                      type="email"
                      value={form.email ?? ''}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      disabled={!canManage}
                      fullWidth
                    />
                  </Grid>
                </Grid>
                <TextField
                  label="Fuseau horaire"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  disabled={!canManage}
                  helperText="Référence : Indian/Antananarivo (UTC+3)"
                />
                <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>
                  Documents imprimables (préparation)
                </Typography>
                <TextField
                  label="En-tête des documents"
                  value={form.documentHeader ?? ''}
                  onChange={(e) => setForm({ ...form, documentHeader: e.target.value })}
                  disabled={!canManage}
                  placeholder="Ex. République de Madagascar — Ministère de l’Éducation Nationale"
                />
                <TextField
                  label="Pied de page des documents"
                  value={form.documentFooter ?? ''}
                  onChange={(e) => setForm({ ...form, documentFooter: e.target.value })}
                  disabled={!canManage}
                />
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={2} alignItems="center">
                <Typography variant="subtitle2" fontWeight={700}>
                  Logo
                </Typography>
                {form.logo ? (
                  <Avatar src={form.logo} sx={{ width: 120, height: 120 }} variant="rounded" />
                ) : (
                  <Box
                    sx={{
                      width: 120,
                      height: 120,
                      borderRadius: 4,
                      border: '2px dashed',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'text.disabled',
                    }}
                  >
                    Aucun
                  </Box>
                )}
                {canManage && (
                  <Button variant="outlined" component="label" size="small">
                    Choisir une image
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => handleLogo(e.target.files?.[0] ?? null)}
                    />
                  </Button>
                )}
                {canManage && form.logo && (
                  <Button size="small" color="error" onClick={() => setForm({ ...form, logo: '' })}>
                    Retirer le logo
                  </Button>
                )}
                <Typography variant="caption" color="text.secondary" align="center">
                  Image PNG/JPG, 400 Ko maximum. Stockée avec les paramètres de l’établissement.
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </div>
  );
}
