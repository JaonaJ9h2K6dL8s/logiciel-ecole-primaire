'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { api } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface StudentRow {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
  birth_date: string | null;
  status: 'active' | 'departed' | 'archived';
  currentClassName: string | null;
  currentYearLabel: string | null;
  primaryGuardianName: string | null;
  primaryGuardianPhone: string | null;
}

interface FilterData {
  levels: { id: number; name: string }[];
  classes: { id: number; name: string; levelId: number }[];
  years: { id: number; label: string; isActive: boolean }[];
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Inscrit',
  departed: 'Départ',
  archived: 'Archivé',
};

function computeAge(birthDate: string | null): string {
  if (!birthDate) return '—';
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return '—';
  const now = new Date();
  const age = Math.floor((now.getTime() - b.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${age} ans`;
}

export default function StudentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('last_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<FilterData>({ levels: [], classes: [], years: [] });
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: { id: number; name: string }[] }>('/academics/levels'),
      api.get<{ data: { id: number; name: string; levelId: number }[] }>('/academics/classes'),
      api.get<{ data: { id: number; label: string; isActive: boolean }[] }>('/school-years'),
    ])
      .then(([lv, cl, yr]) => setFilters({ levels: lv.data, classes: cl.data, years: yr.data }))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), sortBy, sortDir });
      if (search) params.set('search', search);
      if (yearFilter) params.set('schoolYearId', yearFilter);
      if (levelFilter) params.set('levelId', levelFilter);
      if (classFilter) params.set('classId', classFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get<{ data: StudentRow[]; pagination: { total: number } }>(`/students?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [page, pageSize, search, yearFilter, levelFilter, classFilter, statusFilter, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  const visibleClasses = levelFilter
    ? filters.classes.filter((c) => String(c.levelId) === levelFilter)
    : filters.classes;

  return (
    <Box>
      <PageHeader
        title="Élèves"
        subtitle="Dossiers des élèves, responsables légaux et inscriptions"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => router.push('/students/new')}>
            Nouvel élève
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Matricule, nom ou prénom…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(0);
                setSearch(searchInput);
              }
            }}
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select size="small" label="Année" value={yearFilter}
            onChange={(e) => { setPage(0); setYearFilter(e.target.value); }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Toutes</MenuItem>
            {filters.years.map((y) => (
              <MenuItem key={y.id} value={String(y.id)}>{y.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Niveau" value={levelFilter}
            onChange={(e) => { setPage(0); setLevelFilter(e.target.value); setClassFilter(''); }}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="">Tous</MenuItem>
            {filters.levels.map((l) => (
              <MenuItem key={l.id} value={String(l.id)}>{l.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Classe" value={classFilter}
            onChange={(e) => { setPage(0); setClassFilter(e.target.value); }}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">Toutes</MenuItem>
            {visibleClasses.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Statut" value={statusFilter}
            onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="active">Inscrit</MenuItem>
            <MenuItem value="departed">Départ</MenuItem>
            <MenuItem value="archived">Archivé</MenuItem>
          </TextField>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortBy === 'matricule' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'matricule'} direction={sortDir} onClick={() => handleSort('matricule')}>
                    Matricule
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'last_name' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'last_name'} direction={sortDir} onClick={() => handleSort('last_name')}>
                    Nom
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'first_names' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'first_names'} direction={sortDir} onClick={() => handleSort('first_names')}>
                    Prénom(s)
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'birth_date' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'birth_date'} direction={sortDir} onClick={() => handleSort('birth_date')}>
                    Naissance
                  </TableSortLabel>
                </TableCell>
                <TableCell>Classe actuelle</TableCell>
                <TableCell>Responsable principal</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((s) => (
                <TableRow
                  key={s.id}
                  hover
                  onClick={() => router.push(`/students/${s.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontWeight={700}>
                      {s.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>{s.last_name}</TableCell>
                  <TableCell>{s.first_names}</TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {s.birth_date ? `${new Date(s.birth_date).toLocaleDateString('fr-MG')} (${computeAge(s.birth_date)})` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {s.currentClassName ? (
                      <Stack>
                        <Typography variant="body2" fontWeight={600}>{s.currentClassName}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.currentYearLabel}</Typography>
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">Non inscrit</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography variant="caption">{s.primaryGuardianName ?? '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.primaryGuardianPhone ?? ''}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABELS[s.status] ?? s.status}
                      size="small"
                      color={s.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Consulter la fiche">
                        <IconButton size="small" onClick={() => router.push(`/students/${s.id}`)}>
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Imprimer la fiche">
                        <IconButton size="small" onClick={() => window.open(`/students/${s.id}/print`, '_blank')}>
                          <PrintOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      message="Aucun élève trouvé."
                      actionLabel="Créer le premier dossier"
                      onAction={() => router.push('/students/new')}
                    />
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
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="Lignes par page"
        />
      </Card>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
