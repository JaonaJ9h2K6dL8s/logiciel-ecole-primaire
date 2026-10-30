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
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface ContentRow {
  id: number;
  kind: string;
  title: string;
  language: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  preview: string | null;
}

interface ContentFull {
  id: number;
  kind: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const KIND_LABELS: Record<string, string> = {
  course: 'Cours',
  exercises: 'Exercices',
  explanation: 'Explication',
  remediation: 'Remédiation',
  fiche: 'Fiche',
};

const STATUS_LABELS: Record<string, string> = {
  generated: 'Généré',
  edited: 'Modifié',
  validated: 'Validé',
  archived: 'Archivé',
};

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  generated: 'info',
  edited: 'warning',
  validated: 'success',
  archived: 'default',
};

export default function AiLibraryPage() {
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ kind: '', status: '', q: '' });
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [viewing, setViewing] = useState<ContentFull | null>(null);
  const [editJson, setEditJson] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const pageSize = 20;

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.kind) params.set('kind', filters.kind);
      if (filters.status) params.set('status', filters.status);
      if (filters.q.trim()) params.set('q', filters.q.trim());
      const res = await api.get<{ items: ContentRow[]; total: number }>(`/pedagogical-ai/content?${params.toString()}`);
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const openView = async (id: number) => {
    setError(null);
    try {
      const res = await api.get<{ content: ContentFull }>(`/pedagogical-ai/content/${id}`);
      setViewing(res.content);
      setEditJson(JSON.stringify(res.content.content, null, 2));
      setEditTitle(res.content.title);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const saveView = async () => {
    if (!viewing) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editJson) as Record<string, unknown>;
      const res = await api.patch<{ content: ContentFull }>(`/pedagogical-ai/content/${viewing.id}`, {
        title: editTitle,
        content: parsed,
      });
      setViewing(res.content);
      setSnack('Contenu mis à jour.');
      load();
    } catch (err) {
      setError(err instanceof SyntaxError ? 'JSON invalide.' : err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: number, action: 'validate' | 'archive' | 'duplicate') => {
    try {
      await api.post(`/pedagogical-ai/content/${id}/${action}`);
      setSnack(action === 'validate' ? 'Contenu validé.' : action === 'archive' ? 'Contenu archivé.' : 'Contenu dupliqué.');
      if (viewing && action !== 'duplicate') await openView(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const exportRow = (row: ContentFull) => {
    const text = `${row.title}\n\n${JSON.stringify(row.content, null, 2)}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${row.title.replace(/[^\w\s-]/g, '').slice(0, 60) || 'contenu'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Box>
      <PageHeader title="Bibliothèque pédagogique" subtitle="Vos brouillons générés par l'assistant IA, modifiables et réutilisables" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            size="small"
            label="Recherche (titre, contenu)"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setPage(1);
            }}
            sx={{ minWidth: 240 }}
          />
          <TextField
            select
            size="small"
            label="Type"
            value={filters.kind}
            onChange={(e) => {
              setFilters({ ...filters, kind: e.target.value });
              setPage(1);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Tous</MenuItem>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <MenuItem key={k} value={k}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Statut"
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPage(1);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Tous</MenuItem>
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <MenuItem key={k} value={k}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Titre</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Dernière modification</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Button size="small" variant="text" onClick={() => openView(row.id)} sx={{ textTransform: 'none' }}>
                      {row.title}
                    </Button>
                    {row.preview && (
                      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ maxWidth: 380 }}>
                        {row.preview}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={KIND_LABELS[row.kind] ?? row.kind} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABELS[row.status] ?? row.status} color={STATUS_COLORS[row.status] ?? 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{new Date(row.updatedAt).toLocaleString('fr-FR')}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Dupliquer">
                        <IconButton size="small" onClick={() => act(row.id, 'duplicate')}>
                          <ContentCopyOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Valider">
                        <span>
                          <IconButton size="small" disabled={row.status === 'validated' || row.status === 'archived'} onClick={() => act(row.id, 'validate')}>
                            <CheckCircleOutlinedIcon fontSize="small" color="success" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Archiver">
                        <span>
                          <IconButton size="small" disabled={row.status === 'archived'} onClick={() => act(row.id, 'archive')}>
                            <ArchiveOutlinedIcon fontSize="small" color="warning" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState message="Aucun contenu enregistré. Générez une proposition depuis l'assistant IA." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {pageCount > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <Pagination count={pageCount} page={page} onChange={(_e, p) => setPage(p)} color="primary" />
          </Box>
        )}
      </Card>

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} maxWidth="md" fullWidth>
        <DialogTitle>{viewing?.title ?? ''}</DialogTitle>
        <DialogContent dividers>
          {viewing && (
            <Stack spacing={2}>
              <TextField
                size="small"
                label="Titre"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={viewing.status === 'archived'}
              />
              <TextField
                label="Contenu JSON modifiable"
                multiline
                fullWidth
                minRows={14}
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                disabled={viewing.status === 'archived'}
                slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {viewing && (
            <Button startIcon={<DownloadOutlinedIcon />} onClick={() => exportRow(viewing)}>
              Exporter
            </Button>
          )}
          <Button onClick={() => setViewing(null)}>Fermer</Button>
          <Button
            variant="contained"
            disabled={saving || viewing?.status === 'archived'}
            onClick={saveView}
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
