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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import { useAuthStore } from '@/stores/authStore';

// Annonces internes : brouillon, ciblage, publication, expiration, archivage.

interface AnnouncementRow {
  id: number;
  title: string;
  content: string;
  status: string;
  expired: boolean;
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  author_username: string;
}

interface Target {
  roleId: number | null;
  classId: number | null;
}

interface ContextData {
  roles: { id: number; code: string; label: string }[];
  classes: { id: number; name: string; schoolYearId: number; schoolYearLabel: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publiée',
  archived: 'Archivée',
};
const STATUS_COLORS: Record<string, 'default' | 'success' | 'info'> = {
  draft: 'default',
  published: 'success',
  archived: 'default',
};

const EMPTY_FORM = {
  title: '',
  content: '',
  expiresAt: '',
  roleIds: [] as string[],
  classIds: [] as string[],
};

export default function AnnouncementsPage() {
  const { user } = useAuthStore();
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'));
  const canManage = user?.permissions.includes('school_announcements.manage') ?? false;
  const isAdmin = user?.role_code === 'admin';

  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [context, setContext] = useState<ContextData | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<{ data: AnnouncementRow; targets: Target[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (isAdmin && statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get<{ data: AnnouncementRow[]; pagination: { total: number } }>(
        `/school-announcements?${params.toString()}`
      );
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const loadContext = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await api.get<{ data: ContextData }>('/school-announcements/context');
      setContext(res.data);
    } catch {
      setContext(null);
    }
  }, [canManage]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = async (id: number) => {
    setError(null);
    try {
      const res = await api.get<{ data: AnnouncementRow; targets: Target[] }>(`/school-announcements/${id}`);
      setEditing(res.data);
      setForm({
        title: res.data.title,
        content: res.data.content,
        expiresAt: res.data.expiresAt ? new Date(res.data.expiresAt).toISOString().slice(0, 16) : '',
        roleIds: res.targets
          .filter((t) => t.roleId !== null)
          .map((t) => String(t.roleId)),
        classIds: res.targets
          .filter((t) => t.classId !== null)
          .map((t) => String(t.classId)),
      });
      setDetail(null);
      setDialogOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Titre et contenu sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const targets: Target[] = [
        ...form.roleIds.map((r) => ({ roleId: Number(r), classId: null })),
        ...form.classIds.map((c) => ({ roleId: null, classId: Number(c) })),
      ];
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        content: form.content.trim(),
        targets,
        expiresAt: form.expiresAt === '' ? null : new Date(form.expiresAt).toISOString(),
      };
      if (editing) {
        const patchPayload =
          editing.status === 'published'
            ? { expiresAt: form.expiresAt === '' ? null : new Date(form.expiresAt).toISOString() }
            : payload;
        await api.patch(`/school-announcements/${editing.id}`, patchPayload);
        setSnack('Annonce modifiée.');
      } else {
        await api.post('/school-announcements', payload);
        setSnack('Annonce créée en brouillon.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (id: number, action: 'publish' | 'archive') => {
    setError(null);
    try {
      await api.post(`/school-announcements/${id}/${action}`, {});
      setSnack(action === 'publish' ? 'Annonce publiée.' : 'Annonce archivée.');
      setDetail(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const targetLabels = (targets: Target[]) => {
    if (!context) return '';
    return targets
      .map((t) => {
        if (t.roleId !== null) return context.roles.find((r) => r.id === t.roleId)?.label ?? `Rôle ${t.roleId}`;
        return context.classes.find((c) => c.id === t.classId)?.name ?? `Classe ${t.classId}`;
      })
      .join(', ');
  };

  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  return (
    <Box>
      <PageHeader
        title="Annonces internes"
        subtitle="Informations publiées à destination des utilisateurs de l'application"
        action={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Nouvelle annonce
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isAdmin && (
        <Card sx={{ mb: 2 }}>
          <Stack direction="row" spacing={2} sx={{ p: 2 }}>
            <TextField
              select
              size="small"
              label="Statut"
              sx={{ minWidth: 180 }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="all">Tous</MenuItem>
              <MenuItem value="draft">Brouillons</MenuItem>
              <MenuItem value="published">Publiées</MenuItem>
              <MenuItem value="expired">Expirées</MenuItem>
              <MenuItem value="archived">Archivées</MenuItem>
            </TextField>
          </Stack>
        </Card>
      )}

      <Card>
        {loading ? (
          <Box sx={{ p: 4 }}>
            <Typography>Chargement…</Typography>
          </Box>
        ) : rows.length === 0 ? (
          <EmptyState message="Aucune annonce visible pour votre profil." />
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Titre</TableCell>
                    <TableCell>Auteur</TableCell>
                    <TableCell>Publication</TableCell>
                    <TableCell>Expiration</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Button
                          size="small"
                          sx={{ textTransform: 'none', p: 0 }}
                          onClick={async () => {
                            try {
                              const res = await api.get<{ data: AnnouncementRow; targets: Target[] }>(
                                `/school-announcements/${row.id}`
                              );
                              setDetail(res);
                            } catch (err) {
                              setError(err instanceof ApiError ? err.message : 'Erreur.');
                            }
                          }}
                        >
                          {row.title}
                        </Button>
                      </TableCell>
                      <TableCell>{row.author_username}</TableCell>
                      <TableCell>{fmt(row.publishedAt ?? row.createdAt)}</TableCell>
                      <TableCell>
                        {fmt(row.expiresAt)}
                        {row.expired && (
                          <Chip size="small" label="Expirée" color="warning" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_LABELS[row.status] ?? row.status}
                          color={STATUS_COLORS[row.status] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {canManage && (
                          <Button size="small" onClick={() => openEdit(row.id)}>
                            Modifier
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {total} annonce(s)
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

      {/* Détail */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        {detail && (
          <>
            <DialogTitle>{detail.data.title}</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {detail.data.author_username} — {fmt(detail.data.publishedAt ?? detail.data.createdAt)}
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {detail.data.content}
              </Typography>
              {detail.targets.length > 0 && (
                <Typography variant="body2" sx={{ mt: 2 }}>
                  <strong>Destinataires :</strong> {targetLabels(detail.targets)}
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              {canManage && detail.data.status === 'draft' && (
                <Button color="primary" variant="contained" onClick={() => doAction(detail.data.id, 'publish')}>
                  Publier
                </Button>
              )}
              {canManage && detail.data.status !== 'archived' && (
                <Button color="error" onClick={() => doAction(detail.data.id, 'archive')}>
                  Archiver
                </Button>
              )}
              <Button onClick={() => setDetail(null)}>Fermer</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Création / modification */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle>{editing ? 'Modifier l’annonce' : 'Nouvelle annonce'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Titre"
              required
              fullWidth
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <TextField
              label="Contenu"
              required
              fullWidth
              multiline
              minRows={5}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <TextField
              label="Date d'expiration (facultative)"
              type="datetime-local"
              fullWidth
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            {canManage && context && (
              <>
                <TextField
                  select
                  label="Rôles destinataires"
                  fullWidth
                  SelectProps={{ multiple: true }}
                  value={form.roleIds}
                  onChange={(e) => {
                    const v = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                    setForm({ ...form, roleIds: v });
                  }}
                  helperText="Chaque destinataire désigne un rôle ou une classe."
                >
                  {context.roles.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Classes destinataires"
                  fullWidth
                  SelectProps={{ multiple: true }}
                  value={form.classIds}
                  onChange={(e) => {
                    const v = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                    setForm({ ...form, classIds: v });
                  }}
                >
                  {context.classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({c.schoolYearLabel})
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}
            {editing && editing.status === 'published' && (
              <Alert severity="info">
                Une annonce publiée ne peut être modifiée que sur sa date d&apos;expiration.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {editing ? 'Enregistrer' : 'Créer le brouillon'}
          </Button>
        </DialogActions>
      </Dialog>

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
