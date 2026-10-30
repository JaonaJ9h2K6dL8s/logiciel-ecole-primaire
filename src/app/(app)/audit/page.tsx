'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  Chip,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { api } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface AuditRow {
  id: number;
  actorUsername: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: 'success' | 'failure';
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (actionFilter) params.set('action', actionFilter);
      if (resultFilter) params.set('result', resultFilter);
      if (search) params.set('search', search);
      const res = await api.get<{ data: AuditRow[]; pagination: { total: number } }>(`/audit?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [page, pageSize, actionFilter, resultFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get<{ data: { action: string }[] }>('/audit/actions').then((r) => setActions(r.data.map((a) => a.action))).catch(() => undefined);
  }, []);

  return (
    <Box>
      <PageHeader title="Journaux d’audit" subtitle="Historique lecture seule des opérations sensibles" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Rechercher (auteur, action, entité)…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(0);
                setSearch(searchInput);
              }
            }}
            sx={{ minWidth: 260 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="Action"
            value={actionFilter}
            onChange={(e) => {
              setPage(0);
              setActionFilter(e.target.value);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Toutes</MenuItem>
            {actions.map((a) => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Résultat"
            value={resultFilter}
            onChange={(e) => {
              setPage(0);
              setResultFilter(e.target.value);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="success">Succès</MenuItem>
            <MenuItem value="failure">Échec</MenuItem>
          </TextField>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date et heure</TableCell>
                <TableCell>Auteur</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entité</TableCell>
                <TableCell>Résultat</TableCell>
                <TableCell>Détails</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>
                    <Typography variant="caption">
                      {new Date(a.createdAt).toLocaleString('fr-MG')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {a.actorUsername ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {a.action}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {a.entityType ? `${a.entityType}#${a.entityId ?? ''}` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={a.result === 'success' ? 'Succès' : 'Échec'}
                      size="small"
                      color={a.result === 'success' ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'inline-block',
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={a.details ?? undefined}
                    >
                      {a.details ?? '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="Aucun événement enregistré pour ces critères." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Lignes par page"
        />
      </Card>
    </Box>
  );
}
