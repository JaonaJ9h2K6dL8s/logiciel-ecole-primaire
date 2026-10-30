'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import {
  FEE_CATEGORIES,
  FEE_CATEGORY_LABELS,
  FEE_FREQUENCIES,
  FEE_FREQUENCY_LABELS,
  formatAr,
  loadFormOptions,
  type ClassRow,
  type FeeCategory,
  type FeeFrequency,
  type SchoolYear,
  type Tariff,
} from '@/services/finance';

interface PreviewData {
  tariff: { id: number; name: string; amount: number; yearLabel: string };
  totalStudents: number;
  alreadyBilled: number;
  toCreate: number;
}

const emptyForm = () => ({
  school_year_id: '',
  level_id: '' as string,
  class_id: '' as string,
  fee_category: 'tuition' as FeeCategory,
  name: '',
  amount: '',
  frequency: 'once' as FeeFrequency,
  applies_from: '',
  applies_to: '',
  is_active: true,
  description: '',
});

export default function FinanceFeesPage() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [year, setYear] = useState('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tariff | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewTariff, setPreviewTariff] = useState<Tariff | null>(null);

  useEffect(() => {
    loadFormOptions()
      .then(({ years: list }) => {
        setYears(list);
        const active = list.find((y) => y.isActive);
        if (active) setYear(String(active.id));
      })
      .catch(() => setError('Impossible de charger les années scolaires.'));
  }, []);

  useEffect(() => {
    if (!year) return;
    setClasses([]);
    loadFormOptions(Number(year))
      .then(({ classes: list }) => setClasses(list))
      .catch(() => setClasses([]));
  }, [year]);

  const load = useCallback(async () => {
    if (!year) return;
    setError(null);
    try {
      const res = await api.get<{ data: Tariff[] }>(`/finance/tariffs?year=${year}`);
      setTariffs(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setTariffs([]);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), school_year_id: year });
    setFormOpen(true);
  };

  const openEdit = (t: Tariff) => {
    setEditing(t);
    setForm({
      school_year_id: String(t.school_year_id),
      level_id: '',
      class_id: t.class_id ? String(t.class_id) : '',
      fee_category: t.fee_category,
      name: t.name,
      amount: String(Number(t.amount)),
      frequency: t.frequency,
      applies_from: t.applies_from ?? '',
      applies_to: t.applies_to ?? '',
      is_active: t.is_active === 1,
      description: t.description ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        school_year_id: Number(form.school_year_id),
        class_id: form.class_id ? Number(form.class_id) : null,
        fee_category: form.fee_category,
        name: form.name.trim(),
        amount: Number(form.amount),
        frequency: form.frequency,
        applies_from: form.applies_from || null,
        applies_to: form.applies_to || null,
        is_active: form.is_active,
        description: form.description.trim() || null,
      };
      if (editing) {
        await api.patch(`/finance/tariffs/${editing.id}`, body);
        setNotice('Tarif modifié. Les frais déjà émis ne sont pas affectés.');
      } else {
        await api.post('/finance/tariffs', body);
        setNotice('Tarif créé.');
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (t: Tariff) => {
    setPreviewTariff(t);
    setPreview(null);
    setError(null);
    try {
      const res = await api.post<{ data: PreviewData }>(`/finance/tariffs/${t.id}/preview`, {});
      setPreview(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de l’aperçu.');
      setPreviewTariff(null);
    }
  };

  const generate = async () => {
    if (!previewTariff) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: { created: number; skipped: number } }>(
        `/finance/tariffs/${previewTariff.id}/generate`,
        {}
      );
      setNotice(
        `Génération terminée : ${res.data.created} frais créé(s), ${res.data.skipped} déjà existant(s) ignoré(s).`
      );
      setPreviewTariff(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de la génération.');
    } finally {
      setBusy(false);
    }
  };

  const dateError = useMemo(
    () => Boolean(form.applies_from && form.applies_to && form.applies_to < form.applies_from),
    [form.applies_from, form.applies_to]
  );

  const canSubmit = form.school_year_id && form.name.trim() && Number(form.amount) > 0 && !dateError;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Tarifs des frais"
        subtitle="La modification d'un tarif ne modifie jamais les frais déjà émis aux élèves."
        action={
          <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openCreate}>
            Nouveau tarif
          </Button>
        }
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ccc' }}
          aria-label="Année scolaire"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
      </Card>

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Catégorie</TableCell>
              <TableCell>Périmètre</TableCell>
              <TableCell>Montant</TableCell>
              <TableCell>Fréquence</TableCell>
              <TableCell>Application</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tariffs === null ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Chargement…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : tariffs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucun tarif défini pour cette année.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              tariffs.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {t.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={FEE_CATEGORY_LABELS[t.fee_category]} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {t.className ?? (t.levelName ? `Niveau ${t.levelName}` : 'Toutes les classes')}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatAr(t.amount)}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{FEE_FREQUENCY_LABELS[t.frequency]}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {t.applies_from ?? '—'} → {t.applies_to ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={t.is_active === 1 ? 'success' : 'default'}
                      label={t.is_active === 1 ? 'Actif' : 'Inactif'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" startIcon={<BoltOutlinedIcon />} onClick={() => openPreview(t)}>
                        Générer
                      </Button>
                      <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(t)}>
                        Modifier
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Formulaire tarif */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing ? 'Modifier le tarif' : 'Nouveau tarif'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Année scolaire"
                value={form.school_year_id}
                onChange={(e) => setForm({ ...form, school_year_id: e.target.value })}
                fullWidth
                size="small"
              >
                {years.map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Catégorie"
                value={form.fee_category}
                onChange={(e) => setForm({ ...form, fee_category: e.target.value as FeeCategory })}
                fullWidth
                size="small"
              >
                {FEE_CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {FEE_CATEGORY_LABELS[c]}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Classe concernée"
                value={form.class_id}
                onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                fullWidth
                size="small"
                helperText="Vide = toutes les classes de l'année"
              >
                <MenuItem value="">Toutes les classes</MenuItem>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Nom du frais"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                fullWidth
                size="small"
                inputProps={{ maxLength: 150 }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Montant (Ar)"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                fullWidth
                size="small"
                inputProps={{ min: 1, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                select
                label="Fréquence"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as FeeFrequency })}
                fullWidth
                size="small"
              >
                {FEE_FREQUENCIES.map((f) => (
                  <MenuItem key={f} value={f}>
                    {FEE_FREQUENCY_LABELS[f]}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Début d'application"
                type="date"
                value={form.applies_from}
                onChange={(e) => setForm({ ...form, applies_from: e.target.value })}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Fin (facultatif)"
                type="date"
                value={form.applies_to}
                onChange={(e) => setForm({ ...form, applies_to: e.target.value })}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                error={dateError}
                helperText={dateError ? 'Ne peut pas précéder le début.' : ' '}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Description (facultatif)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                fullWidth
                size="small"
                inputProps={{ maxLength: 500 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={save} disabled={busy || !canSubmit}>
            {editing ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Aperçu génération en lot */}
      <Dialog open={Boolean(previewTariff)} onClose={() => setPreviewTariff(null)}>
        <DialogTitle>Génération en lot — aperçu</DialogTitle>
        <DialogContent>
          {preview === null ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              Calcul de l’aperçu…
            </Typography>
          ) : (
            <>
              <DialogContentText component="div" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>{preview.tariff.name}</strong> — {formatAr(preview.tariff.amount)} ·{' '}
                  {preview.tariff.yearLabel}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  Élèves concernés (inscriptions actives) : <strong>{preview.totalStudents}</strong>
                  <br />
                  Déjà facturés (doublons ignorés) : {preview.alreadyBilled}
                  <br />
                  Nouveaux frais à créer : <strong>{preview.toCreate}</strong>
                </Typography>
              </DialogContentText>
              <Alert severity="info" sx={{ mt: 2 }}>
                La génération s’effectue dans une transaction unique. Aucun doublon n’est créé.
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewTariff(null)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={generate}
            disabled={busy || !preview || preview.toCreate === 0}
          >
            Confirmer ({preview?.toCreate ?? 0})
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
