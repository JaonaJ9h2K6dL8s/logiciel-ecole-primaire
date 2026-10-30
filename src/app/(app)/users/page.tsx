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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import FormDialog from '@/components/admin/FormDialog';
import EmptyState from '@/components/admin/EmptyState';

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  role_code: string;
  role_label: string;
}

interface RoleRow {
  code: string;
  label: string;
}

const EMPTY_FORM = { username: '', fullName: '', email: '', roleCode: 'teacher', password: '' };

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  // Dialogues
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', roleCode: '' });

  const [confirmToggle, setConfirmToggle] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get<{ data: UserRow[]; pagination: { total: number } }>(`/users?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get<{ data: RoleRow[] }>('/users/roles').then((r) => setRoles(r.data)).catch(() => undefined);
  }, []);

  const handleCreate = async () => {
    const errors: Record<string, string> = {};
    if (form.username.trim().length < 3) errors.username = 'Au moins 3 caractères.';
    if (!/^[a-zA-Z0-9._-]+$/.test(form.username.trim())) errors.username = 'Lettres, chiffres, . _ - uniquement.';
    if (form.fullName.trim().length < 2) errors.fullName = 'Nom complet requis.';
    if (form.password.length < 10) errors.password = 'Au moins 10 caractères.';
    else if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      errors.password = 'Doit contenir minuscule, majuscule et chiffre.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await api.post('/users', form);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setSnack('Compte créé avec succès.');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) fe[k] = v[0];
        setFormErrors(fe);
      } else {
        setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
      }
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditForm({ fullName: u.full_name, email: u.email ?? '', roleCode: u.role_code });
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api.patch(`/users/${editUser.id}`, {
        fullName: editForm.fullName,
        email: editForm.email,
        roleCode: editForm.roleCode,
      });
      setEditUser(null);
      setSnack('Compte modifié.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!confirmToggle) return;
    setSaving(true);
    try {
      await api.patch(`/users/${confirmToggle.id}/status`, { active: confirmToggle.is_active !== 1 });
      setSnack(confirmToggle.is_active === 1 ? 'Compte désactivé.' : 'Compte activé.');
      setConfirmToggle(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
      setConfirmToggle(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!resetUser) return;
    if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Le nouveau mot de passe doit contenir au moins 10 caractères (minuscule, majuscule, chiffre).');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { newPassword });
      setResetUser(null);
      setNewPassword('');
      setSnack('Mot de passe réinitialisé. Les sessions de l’utilisateur ont été révoquées.');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Utilisateurs"
        subtitle="Gestion des comptes et des rôles"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Nouveau compte
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Rechercher un identifiant ou un nom…"
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
          <TextField
            select
            size="small"
            label="Rôle"
            value={roleFilter}
            onChange={(e) => {
              setPage(0);
              setRoleFilter(e.target.value);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Tous</MenuItem>
            {roles.map((r) => (
              <MenuItem key={r.code} value={r.code}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Statut"
            value={statusFilter}
            onChange={(e) => {
              setPage(0);
              setStatusFilter(e.target.value);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="active">Actif</MenuItem>
            <MenuItem value="inactive">Désactivé</MenuItem>
          </TextField>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Identifiant</TableCell>
                <TableCell>Nom complet</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Dernière connexion</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {u.username}
                    </Typography>
                    {u.email && (
                      <Typography variant="caption" color="text.secondary">
                        {u.email}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{u.full_name}</TableCell>
                  <TableCell>
                    <Chip label={u.role_label} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.is_active === 1 ? 'Actif' : 'Désactivé'}
                      size="small"
                      color={u.is_active === 1 ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-MG') : 'Jamais'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Modifier">
                        <IconButton size="small" onClick={() => openEdit(u)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={u.is_active === 1 ? 'Désactiver' : 'Activer'}>
                        <IconButton size="small" onClick={() => setConfirmToggle(u)}>
                          {u.is_active === 1 ? (
                            <BlockIcon fontSize="small" color="error" />
                          ) : (
                            <CheckCircleOutlineIcon fontSize="small" color="success" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Réinitialiser le mot de passe">
                        <IconButton size="small" onClick={() => setResetUser(u)}>
                          <LockResetOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState message="Aucun compte trouvé." />
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

      {/* Création */}
      <FormDialog
        open={createOpen}
        title="Nouveau compte utilisateur"
        saving={saving}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitLabel="Créer le compte"
      >
        <Stack spacing={2}>
          <TextField
            label="Identifiant"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            error={Boolean(formErrors.username)}
            helperText={formErrors.username ?? 'Lettres, chiffres, . _ - (3 caractères min.)'}
          />
          <TextField
            label="Nom complet"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            error={Boolean(formErrors.fullName)}
            helperText={formErrors.fullName}
          />
          <TextField
            label="Adresse électronique (facultatif)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={Boolean(formErrors.email)}
            helperText={formErrors.email}
          />
          <TextField
            select
            label="Rôle"
            value={form.roleCode}
            onChange={(e) => setForm({ ...form, roleCode: e.target.value })}
          >
            {roles.map((r) => (
              <MenuItem key={r.code} value={r.code}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Mot de passe provisoire"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={Boolean(formErrors.password)}
            helperText={formErrors.password ?? '10 caractères min. : minuscule, majuscule et chiffre.'}
          />
        </Stack>
      </FormDialog>

      {/* Modification */}
      <FormDialog
        open={Boolean(editUser)}
        title={`Modifier — ${editUser?.username ?? ''}`}
        saving={saving}
        onClose={() => setEditUser(null)}
        onSubmit={handleEdit}
        submitLabel="Enregistrer"
      >
        <Stack spacing={2}>
          <TextField
            label="Nom complet"
            value={editForm.fullName}
            onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
          />
          <TextField
            label="Adresse électronique"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          />
          <TextField
            select
            label="Rôle"
            value={editForm.roleCode}
            onChange={(e) => setEditForm({ ...editForm, roleCode: e.target.value })}
            helperText="Le changement de rôle prend effet à la prochaine connexion."
          >
            {roles.map((r) => (
              <MenuItem key={r.code} value={r.code}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </FormDialog>

      {/* Activation / désactivation */}
      <ConfirmDialog
        open={Boolean(confirmToggle)}
        title={confirmToggle?.is_active === 1 ? 'Désactiver ce compte ?' : 'Activer ce compte ?'}
        message={
          confirmToggle?.is_active === 1
            ? `Le compte « ${confirmToggle?.username} » ne pourra plus ouvrir de session. Ses sessions en cours seront révoquées.`
            : `Le compte « ${confirmToggle?.username} » pourra de nouveau se connecter.`
        }
        confirmLabel={confirmToggle?.is_active === 1 ? 'Désactiver' : 'Activer'}
        confirmColor={confirmToggle?.is_active === 1 ? 'error' : 'primary'}
        loading={saving}
        onConfirm={handleToggle}
        onClose={() => setConfirmToggle(null)}
      />

      {/* Réinitialisation du mot de passe */}
      <FormDialog
        open={Boolean(resetUser)}
        title={`Réinitialiser l’accès — ${resetUser?.username ?? ''}`}
        saving={saving}
        onClose={() => {
          setResetUser(null);
          setNewPassword('');
        }}
        onSubmit={handleReset}
        submitLabel="Réinitialiser"
      >
        <Stack spacing={2}>
          <Alert severity="info">
            Un nouveau mot de passe sera requis à la prochaine connexion. Toutes les sessions actives de
            l’utilisateur seront révoquées.
          </Alert>
          <TextField
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="10 caractères min. : minuscule, majuscule et chiffre."
          />
        </Stack>
      </FormDialog>

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
