'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  LinearProgress,
  Link as MuiLink,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import GradingOutlinedIcon from '@mui/icons-material/GradingOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  HOMEWORK_STATUS_LABELS,
  HOMEWORK_TYPES,
  HOMEWORK_TYPE_LABELS,
  isOverdue,
  type HomeworkDetail,
  type HomeworkType,
} from '@/services/homework';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'default',
  published: 'info',
  closed: 'success',
  archived: 'default',
};

export default function HomeworkDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const id = Number(params.id);

  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState<null | { to: string; label: string }>(null);
  const [note, setNote] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    homework_type: 'homework',
    publish_date: '',
    due_date: '',
    estimated_minutes: '',
    max_score: '',
  });

  const canManage = Boolean(user?.permissions.includes('homework.manage'));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: HomeworkDetail }>(`/homework/${id}`);
      setHw(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = () => {
    if (!hw) return;
    setForm({
      title: hw.title,
      description: hw.description ?? '',
      homework_type: hw.homework_type,
      publish_date: hw.publish_date ?? '',
      due_date: hw.due_date ?? '',
      estimated_minutes: hw.estimated_minutes !== null ? String(hw.estimated_minutes) : '',
      max_score: hw.max_score !== null ? String(Number(hw.max_score)) : '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!hw) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/homework/${hw.id}`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        homework_type: form.homework_type as HomeworkType,
        publish_date: form.publish_date || null,
        due_date: form.due_date || null,
        estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null,
        max_score: form.max_score ? Number(form.max_score) : null,
      });
      setEditOpen(false);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Erreur lors de la modification.');
    } finally {
      setBusy(false);
    }
  };

  const doTransition = async () => {
    if (!hw || !transitionOpen) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/homework/${hw.id}/${transitionOpen.to}`, note.trim() ? { note: note.trim() } : undefined);
      setTransitionOpen(null);
      setNote('');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Erreur lors du changement de statut.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!hw) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.delete(`/homework/${hw.id}`);
      router.push('/homework');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Erreur lors de la suppression.');
      setBusy(false);
      setDeleteOpen(false);
    }
  };

  if (loading) return <LinearProgress />;
  if (error || !hw) {
    return (
      <Box>
        <PageHeader title="Devoir" />
        <Alert severity="error">{error ?? 'Devoir introuvable.'}</Alert>
      </Box>
    );
  }

  const editEditable = hw.status === 'draft' || hw.status === 'published';

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={Link} href="/homework" underline="hover">
          Devoirs
        </MuiLink>
        <Typography color="text.primary">{hw.title}</Typography>
      </Breadcrumbs>

      <PageHeader
        title={hw.title}
        subtitle={`${hw.className} · ${hw.subjectName} · ${hw.yearLabel} · ${HOMEWORK_TYPE_LABELS[hw.homework_type]}`}
        action={
          <Chip
            color={STATUS_COLORS[hw.status]}
            label={HOMEWORK_STATUS_LABELS[hw.status]}
            sx={{ fontWeight: 700 }}
          />
        }
      />

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {isOverdue(hw) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          La date limite ({hw.due_date}) est dépassée.
        </Alert>
      )}

      {canManage && (
        <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap' }} useFlexGap>
          {editEditable && (
            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={openEdit}>
              Modifier
            </Button>
          )}
          {hw.status === 'draft' && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PublishOutlinedIcon />}
              onClick={() => setTransitionOpen({ to: 'publish', label: 'publier' })}
            >
              Publier
            </Button>
          )}
          {hw.status === 'published' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<LockClockOutlinedIcon />}
              onClick={() => setTransitionOpen({ to: 'close', label: 'clôturer' })}
            >
              Clôturer
            </Button>
          )}
          {hw.status === 'closed' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArchiveOutlinedIcon />}
              onClick={() => setTransitionOpen({ to: 'archive', label: 'archiver' })}
            >
              Archiver
            </Button>
          )}
          {hw.status === 'archived' && user?.role_code === 'admin' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<UnarchiveOutlinedIcon />}
              onClick={() => setTransitionOpen({ to: 'reopen', label: 'rouvrir' })}
            >
              Rouvrir
            </Button>
          )}
          {hw.status === 'draft' && hw.counts.assigned === 0 && hw.counts.submitted === 0 && (
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineOutlinedIcon />}
              onClick={() => setDeleteOpen(true)}
            >
              Supprimer le brouillon
            </Button>
          )}
        </Stack>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={800}>
              {hw.counts.questions}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Questions
            </Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={800}>
              {hw.counts.assigned}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Élèves affectés
            </Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={800}>
              {hw.counts.submitted}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Remises
            </Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={800}>
              {hw.counts.graded}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Corrigées
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ p: 3, mb: 3 }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle2" fontWeight={700}>
            Informations
          </Typography>
          <Divider />
          <Typography variant="body2">
            <strong>Publication :</strong> {hw.publish_date ?? 'non publiée (date)'} ·{' '}
            <strong>Date limite :</strong> {hw.due_date ?? 'aucune'} ·{' '}
            <strong>Durée estimée :</strong> {hw.estimated_minutes ? `${hw.estimated_minutes} min` : '—'} ·{' '}
            <strong>Barème :</strong> {hw.max_score ? Number(hw.max_score) : '—'} ·{' '}
            <strong>Professeur :</strong> {hw.teacherName ?? '—'}
          </Typography>
          {hw.description && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {hw.description}
            </Typography>
          )}
          {hw.corrections_published === 1 && (
            <Chip size="small" color="success" label="Corrections publiées" sx={{ alignSelf: 'flex-start' }} />
          )}
        </Stack>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            component={Link}
            href={`/homework/${hw.id}/questions`}
            sx={{ p: 2.5, textDecoration: 'none', color: 'inherit', '&:hover': { boxShadow: 4 } }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <QuizOutlinedIcon color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={700}>
                  Questions et barème
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Énoncés, points, réponses attendues
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            component={Link}
            href={`/homework/${hw.id}/tracking`}
            sx={{ p: 2.5, textDecoration: 'none', color: 'inherit', '&:hover': { boxShadow: 4 } }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TrackChangesOutlinedIcon color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={700}>
                  Suivi des élèves
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Affectations, remises, retards
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            component={Link}
            href={`/homework/${hw.id}/correction`}
            sx={{ p: 2.5, textDecoration: 'none', color: 'inherit', '&:hover': { boxShadow: 4 } }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <GradingOutlinedIcon color="primary" />
              <Box>
                <Typography variant="body1" fontWeight={700}>
                  Correction
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Appréciations et notes indicatives
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Dialogues de confirmation */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Modifier le devoir</DialogTitle>
        <DialogContent>
          {hw.status === 'published' && (
            <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
              Ce devoir est publié : la modification sera tracée dans l’historique.
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Titre"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              fullWidth
              size="small"
              inputProps={{ maxLength: 180 }}
            />
            <TextField
              label="Description et consignes"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              multiline
              minRows={2}
              fullWidth
              size="small"
            />
            <TextField
              select
              label="Type"
              value={form.homework_type}
              onChange={(e) => setForm({ ...form, homework_type: e.target.value })}
              fullWidth
              size="small"
            >
              {HOMEWORK_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {HOMEWORK_TYPE_LABELS[t]}
                  </MenuItem>
                ))}
            </TextField>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Publication"
                  type="date"
                  value={form.publish_date}
                  onChange={(e) => setForm({ ...form, publish_date: e.target.value })}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Date limite"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(form.publish_date && form.due_date && form.due_date < form.publish_date)}
                  helperText={
                    form.publish_date && form.due_date && form.due_date < form.publish_date
                      ? 'Ne peut pas précéder la publication.'
                      : ' '
                  }
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Durée estimée (min)"
                  type="number"
                  value={form.estimated_minutes}
                  onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ min: 1, max: 600 }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Barème"
                  type="number"
                  value={form.max_score}
                  onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                  fullWidth
                  size="small"
                  inputProps={{ min: 0, step: '0.5' }}
                  helperText="Doit correspondre au total des points des questions."
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={saveEdit} disabled={busy || !form.title.trim()}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(transitionOpen)} onClose={() => setTransitionOpen(null)}>
        <DialogTitle>Confirmer le changement de statut</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Voulez-vous vraiment {transitionOpen?.label} ce devoir ?
            {transitionOpen?.to === 'close' && ' Un devoir clôturé ne peut plus être modifié.'}
            {transitionOpen?.to === 'archive' && ' Un devoir archivé reste consultable selon les permissions.'}
            {transitionOpen?.to === 'reopen' && ' La réouverture est réservée à l’administration.'}
          </DialogContentText>
          <TextField
            label="Note (facultative, tracée)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 255 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransitionOpen(null)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="contained" onClick={doTransition} disabled={busy}>
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Supprimer ce brouillon ?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Seul un brouillon sans affectation ni remise peut être supprimé. Cette action est définitive.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button color="error" variant="contained" onClick={doDelete} disabled={busy}>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
