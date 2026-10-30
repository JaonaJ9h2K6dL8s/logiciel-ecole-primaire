'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Pagination,
  Snackbar,
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
import AddIcon from '@mui/icons-material/Add';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import EventParticipantsDialog from '@/components/events/EventParticipantsDialog';

// Événements scolaires : liste filtrée, création, modification et transitions de statut.

interface EventRow {
  id: number;
  title: string;
  categoryId: number;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  schoolYearId: number;
  audience: string;
  organizerId: number | null;
  logistics: string | null;
  budgetEstimated: number | null;
  status: string;
  summary: string | null;
  category_name: string;
  organizer_username: string | null;
}

interface ContextData {
  years: { id: number; label: string; isActive: number }[];
  classes: { id: number; name: string; schoolYearId: number; levelName: string }[];
  categories: { id: number; name: string; color: string | null }[];
  organizers: { id: number; username: string; full_name: string }[];
}

interface EventClassRow {
  id: number;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  planned: 'Planifié',
  completed: 'Terminé',
  cancelled: 'Annulé',
  archived: 'Archivé',
};
const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success' | 'info' | 'error'> = {
  draft: 'default',
  planned: 'info',
  completed: 'success',
  cancelled: 'error',
  archived: 'default',
};
const AUDIENCE_LABELS: Record<string, string> = {
  all_students: 'Tous les élèves',
  selected_classes: 'Classes sélectionnées',
  parents: 'Parents',
  staff: 'Personnel',
};

const EMPTY_FORM = {
  title: '',
  categoryId: '',
  description: '',
  startDate: '',
  startTime: '08:00',
  endDate: '',
  endTime: '10:00',
  location: '',
  schoolYearId: '',
  audience: 'selected_classes',
  classIds: [] as number[],
  organizerId: '',
  logistics: '',
  budgetEstimated: '',
  status: 'draft',
};

function toLocalInput(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function EventsPage() {
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('school_events.manage') ?? false;
  const canManageParticipants = user?.permissions.includes('school_events.manage_participants') ?? false;

  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [filters, setFilters] = useState({ status: '', categoryId: '', from: '', to: '' });

  const [context, setContext] = useState<ContextData | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<{ event: EventRow; classes: EventClassRow[] } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EventRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [participantsTarget, setParticipantsTarget] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.status) params.set('status', filters.status);
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await api.get<{ data: EventRow[]; pagination: { total: number } }>(
        `/school-events?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const loadContext = useCallback(async () => {
    try {
      const res = await api.get<{ data: ContextData }>('/school-events/context');
      setContext(res.data);
    } catch {
      setContext(null);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const openDetail = async (id: number) => {
    setError(null);
    try {
      const res = await api.get<{ event: EventRow; classes: EventClassRow[] }>(`/school-events/${id}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const openCreate = () => {
    setEditing(null);
    const activeYear = context?.years.find((y) => y.isActive === 1);
    setForm({ ...EMPTY_FORM, schoolYearId: activeYear ? String(activeYear.id) : '' });
    setDialogOpen(true);
  };

  const openEdit = (row: EventRow) => {
    setEditing(row);
    const s = toLocalInput(row.startAt);
    const e = toLocalInput(row.endAt);
    setForm({
      title: row.title,
      categoryId: String(row.categoryId),
      description: row.description ?? '',
      startDate: s.date,
      startTime: s.time,
      endDate: e.date,
      endTime: e.time,
      location: row.location ?? '',
      schoolYearId: String(row.schoolYearId),
      audience: row.audience,
      classIds: detail?.classes.map((c) => c.id) ?? [],
      organizerId: row.organizerId ? String(row.organizerId) : '',
      logistics: row.logistics ?? '',
      budgetEstimated: row.budgetEstimated !== null ? String(row.budgetEstimated) : '',
      status: row.status,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.startDate || !form.endDate || !form.schoolYearId || !form.categoryId) {
      setError('Titre, catégorie, dates et année scolaire sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startAt = new Date(`${form.startDate}T${form.startTime}:00`).toISOString();
      const endAt = new Date(`${form.endDate}T${form.endTime}:00`).toISOString();
      const payload = {
        title: form.title.trim(),
        categoryId: Number(form.categoryId),
        description: form.description.trim() === '' ? null : form.description.trim(),
        startAt,
        endAt,
        location: form.location.trim() === '' ? null : form.location.trim(),
        schoolYearId: Number(form.schoolYearId),
        audience: form.audience,
        classIds: form.audience === 'selected_classes' ? form.classIds : form.classIds,
        organizerId: form.organizerId === '' ? null : Number(form.organizerId),
        logistics: form.logistics.trim() === '' ? null : form.logistics.trim(),
        budgetEstimated: form.budgetEstimated === '' ? null : Number(form.budgetEstimated),
        status: form.status,
      };
      if (editing) {
        await api.patch(`/school-events/${editing.id}`, payload);
        setSnack('Événement modifié.');
      } else {
        await api.post('/school-events', payload);
        setSnack('Événement créé.');
      }
      setDialogOpen(false);
      setDetail(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const doTransition = async (id: number, action: 'complete' | 'archive' | 'cancel', reason?: string) => {
    setError(null);
    try {
      await api.post(`/school-events/${id}/${action}`, reason !== undefined ? { reason } : {});
      setSnack(action === 'cancel' ? 'Événement annulé.' : action === 'complete' ? 'Événement marqué terminé.' : 'Événement archivé.');
      setCancelTarget(null);
      setCancelReason('');
      setDetail(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const fmtDateTime = (v: string) =>
    v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const yearLabel = (id: number) => context?.years.find((y) => y.id === id)?.label ?? String(id);

  return (
    <Box>
      <PageHeader
        title="Événements scolaires"
        subtitle="Réunions, activités et événements de l'établissement"
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Nouvel événement
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ p: 2 }} useFlexGap>
          <TextField
            select
            label="Statut"
            size="small"
            sx={{ minWidth: 160 }}
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPage(1);
            }}
          >
            <MenuItem value="">Tous</MenuItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Catégorie"
            size="small"
            sx={{ minWidth: 180 }}
            value={filters.categoryId}
            onChange={(e) => {
              setFilters({ ...filters, categoryId: e.target.value });
              setPage(1);
            }}
          >
            <MenuItem value="">Toutes</MenuItem>
            {context?.categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Du"
            type="date"
            size="small"
            sx={{ width: 170 }}
            value={filters.from}
            onChange={(e) => {
              setFilters({ ...filters, from: e.target.value });
              setPage(1);
            }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Au"
            type="date"
            size="small"
            sx={{ width: 170 }}
            value={filters.to}
            onChange={(e) => {
              setFilters({ ...filters, to: e.target.value });
              setPage(1);
            }}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </Card>

      <Card>
        {loading ? (
          <Box sx={{ p: 4 }}>
            <Typography>Chargement…</Typography>
          </Box>
        ) : rows.length === 0 ? (
          <EmptyState message="Aucun événement. Cliquez sur « Nouvel événement » pour commencer." />
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Titre</TableCell>
                    <TableCell>Catégorie</TableCell>
                    <TableCell>Début</TableCell>
                    <TableCell>Fin</TableCell>
                    <TableCell>Lieu</TableCell>
                    <TableCell>Année</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Button size="small" sx={{ textTransform: 'none', p: 0 }} onClick={() => openDetail(row.id)}>
                          {row.title}
                        </Button>
                      </TableCell>
                      <TableCell>{row.category_name}</TableCell>
                      <TableCell>{fmtDateTime(row.startAt)}</TableCell>
                      <TableCell>{fmtDateTime(row.endAt)}</TableCell>
                      <TableCell>{row.location ?? '—'}</TableCell>
                      <TableCell>{yearLabel(row.schoolYearId)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_LABELS[row.status] ?? row.status}
                          color={STATUS_COLORS[row.status] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => openDetail(row.id)}>
                          Détail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {total} événement(s)
              </Typography>
              <Pagination
                count={Math.max(1, Math.ceil(total / pageSize))}
                page={page}
                onChange={(_, p) => setPage(p)}
                color="primary"
              />
            </Stack>
          </>
        )}
      </Card>

      {/* Détail d'un événement */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        {detail && (
          <>
            <DialogTitle>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" fontWeight={800}>
                  {detail.event.title}
                </Typography>
                <Chip
                  size="small"
                  label={STATUS_LABELS[detail.event.status] ?? detail.event.status}
                  color={STATUS_COLORS[detail.event.status] ?? 'default'}
                />
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Catégorie :</strong> {detail.event.category_name}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Public :</strong> {AUDIENCE_LABELS[detail.event.audience] ?? detail.event.audience}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Début :</strong> {fmtDateTime(detail.event.startAt)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Fin :</strong> {fmtDateTime(detail.event.endAt)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Lieu :</strong> {detail.event.location ?? '—'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Année scolaire :</strong> {yearLabel(detail.event.schoolYearId)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Responsable :</strong> {detail.event.organizer_username ?? '—'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    <strong>Budget prévisionnel :</strong>{' '}
                    {detail.event.budgetEstimated !== null ? `${detail.event.budgetEstimated} Ar` : '—'}
                  </Typography>
                </Grid>
                {detail.event.description && (
                  <Grid size={12}>
                    <Typography variant="body2">
                      <strong>Description :</strong> {detail.event.description}
                    </Typography>
                  </Grid>
                )}
                {detail.event.logistics && (
                  <Grid size={12}>
                    <Typography variant="body2">
                      <strong>Logistique :</strong> {detail.event.logistics}
                    </Typography>
                  </Grid>
                )}
                {detail.event.summary && (
                  <Grid size={12}>
                    <Typography variant="body2">
                      <strong>Bilan :</strong> {detail.event.summary}
                    </Typography>
                  </Grid>
                )}
                <Grid size={12}>
                  <Typography variant="body2" fontWeight={700}>
                    Classes concernées
                  </Typography>
                  {detail.classes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Aucune classe associée.
                    </Typography>
                  ) : (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                      {detail.classes.map((c) => (
                        <Chip key={c.id} size="small" label={c.name} />
                      ))}
                    </Stack>
                  )}
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              {canManageParticipants && detail.event.status !== 'archived' && detail.event.status !== 'cancelled' && (
                <Button onClick={() => setParticipantsTarget(detail.event.id)}>Participants</Button>
              )}
              {canManage && detail.event.status !== 'archived' && (
                <>
                  <Button onClick={() => openEdit(detail.event)}>Modifier</Button>
                  {(detail.event.status === 'draft' || detail.event.status === 'planned') && (
                    <>
                      <Button color="success" onClick={() => doTransition(detail.event.id, 'complete')}>
                        Marquer terminé
                      </Button>
                      <Button color="error" onClick={() => setCancelTarget(detail.event)}>
                        Annuler l&apos;événement
                      </Button>
                    </>
                  )}
                  {(detail.event.status === 'completed' || detail.event.status === 'cancelled') && (
                    <Button onClick={() => doTransition(detail.event.id, 'archive')}>Archiver</Button>
                  )}
                </>
              )}
              <Button onClick={() => setDetail(null)}>Fermer</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Création / modification */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? 'Modifier l’événement' : 'Nouvel événement'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                label="Titre"
                required
                fullWidth
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Catégorie"
                required
                fullWidth
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                {context?.categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Date de début"
                type="date"
                required
                fullWidth
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Heure de début"
                type="time"
                required
                fullWidth
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Date de fin"
                type="date"
                required
                fullWidth
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Heure de fin"
                type="time"
                required
                fullWidth
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Année scolaire"
                required
                fullWidth
                value={form.schoolYearId}
                onChange={(e) => setForm({ ...form, schoolYearId: e.target.value, classIds: [] })}
              >
                {context?.years.map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                    {y.isActive === 1 ? ' (active)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Public concerné"
                fullWidth
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              >
                {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField
                select
                label="Classes concernées"
                fullWidth
                SelectProps={{ multiple: true }}
                value={form.classIds.map(String)}
                onChange={(e) => {
                  const values = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                  setForm({ ...form, classIds: values.map(Number) });
                }}
                helperText="Les classes doivent appartenir à l'année scolaire sélectionnée."
              >
                {context?.classes
                  .filter((c) => form.schoolYearId === '' || c.schoolYearId === Number(form.schoolYearId))
                  .map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({c.levelName})
                    </MenuItem>
                  ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Lieu"
                fullWidth
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Grid>
            {canManage && context && context.organizers.length > 0 && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label="Responsable de l'organisation"
                  fullWidth
                  value={form.organizerId}
                  onChange={(e) => setForm({ ...form, organizerId: e.target.value })}
                >
                  <MenuItem value="">—</MenuItem>
                  {context.organizers.map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.full_name || o.username}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid size={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                minRows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Besoins logistiques / matériel"
                fullWidth
                multiline
                minRows={2}
                value={form.logistics}
                onChange={(e) => setForm({ ...form, logistics: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Budget prévisionnel (Ar)"
                type="number"
                fullWidth
                value={form.budgetEstimated}
                onChange={(e) => setForm({ ...form, budgetEstimated: e.target.value })}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Statut"
                fullWidth
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <MenuItem value="draft">Brouillon</MenuItem>
                <MenuItem value="planned">Planifié</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {editing ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Annulation motivée */}
      <Dialog open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Annuler l&apos;événement</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            L&apos;événement sera marqué annulé. Il restera consultable dans l&apos;historique.
          </Typography>
          <TextField
            label="Motif (facultatif)"
            fullWidth
            multiline
            minRows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTarget(null)}>Retour</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => cancelTarget && doTransition(cancelTarget.id, 'cancel', cancelReason.trim() || undefined)}
          >
            Confirmer l&apos;annulation
          </Button>
        </DialogActions>
      </Dialog>

      {participantsTarget !== null && (
        <EventParticipantsDialog
          eventId={participantsTarget}
          onClose={() => setParticipantsTarget(null)}
          onSaved={() => {
            setSnack('Participants mis à jour.');
            setParticipantsTarget(null);
            load();
          }}
        />
      )}

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
