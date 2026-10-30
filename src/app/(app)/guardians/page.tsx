'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface GuardianRow {
  id: number;
  last_name: string;
  first_names: string;
  relationship: string;
  phoneMain: string;
  phoneSecondary: string | null;
  email: string | null;
  address: string | null;
  status: string;
  studentCount: number;
}

const REL_LABELS: Record<string, string> = {
  father: 'Père',
  mother: 'Mère',
  legal_guardian: 'Tuteur légal',
  other: 'Autre',
};

const EMPTY_FORM = { lastName: '', firstNames: '', relationship: 'father', phoneMain: '', phoneSecondary: '', email: '', address: '' };

export default function GuardiansPage() {
  const [rows, setRows] = useState<GuardianRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      const res = await api.get<{ data: GuardianRow[]; pagination: { total: number } }>(`/guardians?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (g: GuardianRow) => {
    setForm({
      lastName: g.last_name,
      firstNames: g.first_names,
      relationship: g.relationship,
      phoneMain: g.phoneMain,
      phoneSecondary: g.phoneSecondary ?? '',
      email: g.email ?? '',
      address: g.address ?? '',
    });
    setEditId(g.id);
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.lastName.trim()) errors.lastName = 'Nom obligatoire.';
    if (!form.firstNames.trim()) errors.firstNames = 'Prénom(s) obligatoire(s).';
    if (!/^[+0-9][0-9 ()\.\-]{6,25}$/.test(form.phoneMain.trim())) errors.phoneMain = 'Téléphone invalide (ex. 034 00 000 00).';
    if (form.email && !form.email.includes('@')) errors.email = 'Adresse électronique invalide.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/guardians/${editId}`, form);
        setSnack('Responsable modifié.');
      } else {
        await api.post('/guardians', form);
        setSnack('Responsable créé. Associez-le aux élèves depuis leur fiche.');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) fe[k] = v[0];
        setFormErrors(fe);
      } else {
        setError(err instanceof Error ? err.message : 'Erreur.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Responsables légaux"
        subtitle="Un responsable peut suivre plusieurs enfants ; le téléphone est le contact principal"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Nouveau responsable
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <Box sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Nom ou téléphone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(0);
                setSearch(searchInput);
              }
            }}
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Lien</TableCell>
                <TableCell>Téléphone principal</TableCell>
                <TableCell>Téléphone secondaire</TableCell>
                <TableCell>Enfants suivis</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((g) => (
                <TableRow key={g.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {g.last_name} {g.first_names}
                    </Typography>
                    {g.email && (
                      <Typography variant="caption" color="text.secondary">
                        {g.email}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{REL_LABELS[g.relationship] ?? g.relationship}</TableCell>
                  <TableCell>{g.phoneMain}</TableCell>
                  <TableCell>{g.phoneSecondary ?? '—'}</TableCell>
                  <TableCell>
                    <Chip label={String(g.studentCount)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(g)} title="Modifier">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="Aucun responsable trouvé." actionLabel="Créer un responsable" onAction={openCreate} />
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Modifier le responsable' : 'Nouveau responsable légal'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Nom" required fullWidth value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                error={Boolean(formErrors.lastName)} helperText={formErrors.lastName}
              />
              <TextField
                label="Prénom(s)" required fullWidth value={form.firstNames}
                onChange={(e) => setForm({ ...form, firstNames: e.target.value })}
                error={Boolean(formErrors.firstNames)} helperText={formErrors.firstNames}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                select label="Lien avec l’enfant" fullWidth value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              >
                <MenuItem value="father">Père</MenuItem>
                <MenuItem value="mother">Mère</MenuItem>
                <MenuItem value="legal_guardian">Tuteur légal</MenuItem>
                <MenuItem value="other">Autre</MenuItem>
              </TextField>
              <TextField
                label="Téléphone principal" required fullWidth placeholder="034 00 000 00"
                value={form.phoneMain}
                onChange={(e) => setForm({ ...form, phoneMain: e.target.value })}
                error={Boolean(formErrors.phoneMain)} helperText={formErrors.phoneMain}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Téléphone secondaire (facultatif)" fullWidth value={form.phoneSecondary}
                onChange={(e) => setForm({ ...form, phoneSecondary: e.target.value })}
              />
              <TextField
                label="Adresse électronique (facultative)" fullWidth value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={Boolean(formErrors.email)} helperText={formErrors.email}
              />
            </Stack>
            <TextField
              label="Adresse (facultative)" fullWidth value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {editId ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
