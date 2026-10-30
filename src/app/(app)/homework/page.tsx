'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Pagination,
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
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { useDebounce } from '@/hooks/useDebounce';
import {
  HOMEWORK_STATUSES,
  HOMEWORK_STATUS_LABELS,
  HOMEWORK_TYPES,
  HOMEWORK_TYPE_LABELS,
  isOverdue,
  loadFormOptions,
  loadSubjects,
  type ClassRow,
  type HomeworkListResponse,
  type HomeworkRow,
  type SchoolYear,
  type ClassSubject,
} from '@/services/homework';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'default',
  published: 'info',
  closed: 'success',
  archived: 'default',
};

const PAGE_SIZE = 20;

export default function HomeworkListPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(user?.permissions.includes('homework.manage'));

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);

  const [year, setYear] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [items, setItems] = useState<HomeworkRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Options via /homework/form-options : accessible aux professeurs
    // (leurs affectations) sans exposer /school-years ni /academics/classes.
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
    setClassId('');
    setSubjectId('');
    loadFormOptions(Number(year))
      .then(({ classes: list }) => setClasses(list))
      .catch(() => setClasses([]));
  }, [year]);

  useEffect(() => {
    if (!classId) {
      setSubjects([]);
      return;
    }
    loadSubjects(Number(classId))
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [classId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (year) qs.set('year', year);
      if (classId) qs.set('class', classId);
      if (subjectId) qs.set('subject', subjectId);
      qs.set('status', status);
      qs.set('type', type);
      if (debouncedSearch.trim()) qs.set('q', debouncedSearch.trim());
      qs.set('page', String(page));
      qs.set('limit', String(PAGE_SIZE));
      const res = await api.get<HomeworkListResponse>(`/homework?${qs.toString()}`);
      setItems(res.data.items);
      setPages(Math.max(1, res.data.pagination.pages));
      setTotal(res.data.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, classId, subjectId, status, type, debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [year, classId, subjectId, status, type, debouncedSearch]);

  return (
    <Box>
      <PageHeader
        title="Devoirs et exercices"
        subtitle={`${total} devoir(s) — suivi pédagogique de la classe`}
        action={
          canManage ? (
            <Button component={Link} href="/homework/new" variant="contained" startIcon={<AddOutlinedIcon />}>
              Nouveau devoir
            </Button>
          ) : undefined
        }
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label="Année scolaire"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            sx={{ minWidth: 180 }}
            size="small"
          >
            <MenuItem value="">Toutes</MenuItem>
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Classe"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            sx={{ minWidth: 180 }}
            size="small"
          >
            <MenuItem value="">Toutes</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Matière"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            sx={{ minWidth: 180 }}
            size="small"
            disabled={!classId}
          >
            <MenuItem value="">Toutes</MenuItem>
            {subjects.map((s) => (
              <MenuItem key={s.subjectId} value={s.subjectId}>
                {s.subjectName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 140 }}
            size="small"
          >
            <MenuItem value="all">Tous</MenuItem>
            {HOMEWORK_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {HOMEWORK_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            sx={{ minWidth: 190 }}
            size="small"
          >
            <MenuItem value="all">Tous</MenuItem>
            {HOMEWORK_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {HOMEWORK_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Rechercher par titre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ minWidth: 220, flexGrow: 1 }}
          />
        </Stack>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Titre</TableCell>
              <TableCell>Classe</TableCell>
              <TableCell>Matière</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Publication</TableCell>
              <TableCell>Date limite</TableCell>
              <TableCell>Statut</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Chargement…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    Aucun devoir ne correspond aux filtres.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((hw) => (
                <TableRow key={hw.id} hover>
                  <TableCell>
                    <Link href={`/homework/${hw.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Typography variant="body2" fontWeight={700} sx={{ '&:hover': { textDecoration: 'underline' } }}>
                        {hw.title}
                      </Typography>
                    </Link>
                  </TableCell>
                  <TableCell>{hw.className}</TableCell>
                  <TableCell>{hw.subjectName}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{HOMEWORK_TYPE_LABELS[hw.homework_type]}</Typography>
                  </TableCell>
                  <TableCell>{hw.publish_date ?? '—'}</TableCell>
                  <TableCell>
                    {hw.due_date ? (
                      <Tooltip title={isOverdue(hw) ? 'Date limite dépassée' : ''}>
                        <Chip
                          size="small"
                          icon={<EventOutlinedIcon />}
                          label={hw.due_date}
                          color={isOverdue(hw) ? 'error' : 'default'}
                          variant={isOverdue(hw) ? 'filled' : 'outlined'}
                        />
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLORS[hw.status]} label={HOMEWORK_STATUS_LABELS[hw.status]} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={pages} page={page} onChange={(_e, p) => setPage(p)} color="primary" />
        </Box>
      )}
    </Box>
  );
}
