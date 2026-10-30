'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface StudentRow {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
  status: string;
  classId: number;
  className: string;
  levelName: string;
}

interface PunchResult {
  data: {
    id: number;
    eventType: string;
    occurredAt: string;
    schoolDate: string;
    status: string;
  };
  alreadyProcessed: boolean;
  message: string;
}

const fmtTime = (dt: string | undefined) =>
  dt ? new Date(dt).toLocaleTimeString('fr-MG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export default function EntryPunchPage() {
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState<number | 'all'>('all');
  const [classes, setClasses] = useState<{ id: number; name: string; levelName: string }[]>([]);
  const [schoolYearLabel, setSchoolYearLabel] = useState<string>('');

  const [eventType, setEventType] = useState<'ARRIVAL' | 'EXIT'>('ARRIVAL');
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; time?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .get<{ data: { id: number; name: string; levelName: string }[] }>('/entry-punches/class-options')
      .then((r) => setClasses(r.data))
      .catch(() => setClasses([]));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (classId !== 'all') params.set('classId', String(classId));
      const res = await api.get<{
        data: StudentRow[];
        schoolYear: { label: string };
        pagination: { total: number };
      }>(`/entry-punches/punchable-students?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setSchoolYearLabel(res.schoolYear.label);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [page, pageSize, search, classId]);

  useEffect(() => {
    load();
  }, [load]);

  // Recherche côté serveur avec debounce
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      setSearch(value);
    }, 300);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    setResult(null);
    try {
      const res = await api.post<PunchResult>('/entry-punches', {
        studentId: selected.id,
        eventType,
        // Clé d'idempotence unique par confirmation : un double clic ou un
        // renvoi réseau renvoie l'événement d'origine au lieu d'un doublon.
        idempotencyKey: crypto.randomUUID(),
      });
      setResult({ ok: true, message: res.message, time: res.data.occurredAt });
      setSnack(res.message);
      setSelected(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erreur : pointage non enregistré.';
      setResult({ ok: false, message });
      setError(message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Pointage d'entrée / sortie"
        subtitle={`Heure officielle serveur — année scolaire ${schoolYearLabel || '…'}`}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
        {/* Recherche et résultats */}
        <Card sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }}>
            <TextField
              size="small"
              autoFocus
              placeholder="Matricule, nom ou prénom…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              sx={{ flex: 1 }}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Classe</InputLabel>
              <Select
                value={classId === 'all' ? '' : String(classId)}
                label="Classe"
                onChange={(e) => {
                  setPage(0);
                  setSelected(null);
                  setClassId(e.target.value === '' ? 'all' : Number(e.target.value));
                }}
              >
                <MenuItem value="">Toutes les classes</MenuItem>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name} ({c.levelName})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Matricule</TableCell>
                  <TableCell>Nom complet</TableCell>
                  <TableCell>Classe</TableCell>
                  <TableCell align="right">Sélection</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(rows ?? []).map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={selected?.id === s.id}
                    onClick={() => setSelected(s)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {s.matricule}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {s.last_name} {s.first_names}
                    </TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant={selected?.id === s.id ? 'contained' : 'outlined'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(s);
                        }}
                      >
                        Choisir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows !== null && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <EmptyState message="Aucun élève trouvé avec une inscription active." />
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

        {/* Récapitulatif et confirmation */}
        <Paper variant="outlined" sx={{ width: { md: 340 }, p: 2.5, alignSelf: 'flex-start' }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={800}>
              <PersonPinIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Pointage
            </Typography>

            <ToggleButtonGroup
              value={eventType}
              exclusive
              onChange={(_e, v) => v && setEventType(v)}
              fullWidth
              size="small"
            >
              <ToggleButton value="ARRIVAL" color="primary">
                <LoginIcon fontSize="small" sx={{ mr: 1 }} /> Arrivée
              </ToggleButton>
              <ToggleButton value="EXIT" color="warning">
                <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> Sortie
              </ToggleButton>
            </ToggleButtonGroup>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Élève sélectionné
              </Typography>
              {selected ? (
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="body1" fontWeight={700}>
                    {selected.last_name} {selected.first_names}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Chip label={selected.matricule} size="small" variant="outlined" />
                    <Chip label={selected.className} size="small" variant="outlined" />
                  </Stack>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Aucun élève sélectionné.
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Type d&rsquo;événement
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {eventType === 'ARRIVAL' ? 'Arrivée à l’établissement' : 'Sortie de l’établissement'}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Heure officielle (serveur)
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                Enregistrée à la confirmation
              </Typography>
            </Box>

            <Button
              variant="contained"
              size="large"
              disabled={!selected || confirming}
              onClick={handleConfirm}
            >
              {confirming ? 'Enregistrement…' : 'Confirmer le pointage'}
            </Button>

            {result && (
              <Alert severity={result.ok ? 'success' : 'error'}>
                {result.message}
                {result.time && (
                  <Typography variant="caption" display="block">
                    Heure de l’événement : {fmtTime(result.time)} (Indian/Antananarivo)
                  </Typography>
                )}
              </Alert>
            )}
          </Stack>
        </Paper>
      </Stack>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
