'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import AddIcon from '@mui/icons-material/Add';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { api, ApiError } from '@/services/api';
import StudentContactsSection from '@/components/contacts/StudentContactsSection';

interface StudentDetail {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
  birth_date: string | null;
  sex: 'M' | 'F' | null;
  address: string | null;
  entry_date: string | null;
  status: 'active' | 'departed' | 'archived';
  createdByName: string | null;
  updatedByName: string | null;
  created_at: string;
  updated_at: string;
}

interface EnrollmentRow {
  id: number;
  enrollmentDate: string;
  status: string;
  exitDate: string | null;
  exitReason: string | null;
  className: string;
  levelName: string;
  schoolYearLabel: string;
}

interface GuardianRow {
  guardianId: number;
  lastName: string;
  firstNames: string;
  relationship: string;
  phoneMain: string;
  phoneSecondary: string | null;
  email: string | null;
  isPrimaryContact: boolean;
  isLegalGuardian: boolean;
  contactAllowed: boolean;
}

const REL_LABELS: Record<string, string> = {
  father: 'Père',
  mother: 'Mère',
  legal_guardian: 'Tuteur légal',
  other: 'Autre',
};

const ENROLL_STATUS: Record<string, string> = {
  active: 'Active',
  transferred: 'Transféré',
  completed: 'Clôturée',
  withdrawn: 'Départ',
};

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modification identité
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ lastName: '', firstNames: '', birthDate: '', sex: '', address: '' });

  // Inscription / changement de classe
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ classId: '', enrollmentDate: new Date().toISOString().slice(0, 10) });
  const [classes, setClasses] = useState<{ id: number; name: string; levelName: string; yearLabel: string; capacity: number | null }[]>([]);

  // Association responsable existant
  const [linkOpen, setLinkOpen] = useState(false);
  const [guardianSearch, setGuardianSearch] = useState('');
  const [guardianResults, setGuardianResults] = useState<(GuardianRow & { guardianId: number })[]>([]);
  const [newGuardianOpen, setNewGuardianOpen] = useState(false);
  const [newGuardian, setNewGuardian] = useState({ lastName: '', firstNames: '', relationship: 'father', phoneMain: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: { student: StudentDetail; enrollments: EnrollmentRow[]; guardians: GuardianRow[] } }>(`/students/${id}`);
      setStudent(res.data.student);
      setEnrollments(res.data.enrollments);
      setGuardians(res.data.guardians);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (Number.isInteger(id) && id > 0) load();
  }, [id, load]);

  useEffect(() => {
    api
      .get<{ data: { id: number; name: string; levelName: string; schoolYearLabel: string; capacity: number | null; isActive: boolean }[] }>('/academics/classes')
      .then((r) => setClasses(r.data.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name, levelName: c.levelName, yearLabel: c.schoolYearLabel, capacity: c.capacity }))))
      .catch(() => undefined);
  }, []);

  const openEdit = () => {
    if (!student) return;
    setEditForm({
      lastName: student.last_name,
      firstNames: student.first_names,
      birthDate: student.birth_date ? student.birth_date.slice(0, 10) : '',
      sex: student.sex ?? '',
      address: student.address ?? '',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!student) return;
    setSaving(true);
    try {
      await api.patch(`/students/${student.id}`, {
        lastName: editForm.lastName.trim(),
        firstNames: editForm.firstNames.trim(),
        birthDate: editForm.birthDate || null,
        sex: editForm.sex || null,
        address: editForm.address.trim() || null,
      });
      setEditOpen(false);
      setSnack('Fiche modifiée. Les inscriptions et l’historique restent inchangés.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnroll = async () => {
    if (!student || !enrollForm.classId) return;
    setSaving(true);
    try {
      const res = await api.post<{ transferredFromClassId: number | null }>(`/students/${student.id}/enrollments`, {
        classId: Number(enrollForm.classId),
        enrollmentDate: enrollForm.enrollmentDate,
      });
      setEnrollOpen(false);
      setSnack(
        res.transferredFromClassId
          ? 'Changement de classe effectué. L’ancienne affectation est conservée dans l’historique.'
          : 'Inscription enregistrée.'
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors de l’inscription.');
      setEnrollOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const searchGuardians = async (term: string) => {
    setGuardianSearch(term);
    if (term.trim().length < 2) {
      setGuardianResults([]);
      return;
    }
    try {
      const res = await api.get<{ data: { id: number; last_name: string; first_names: string; relationship: string; phoneMain: string }[] }>(
        `/guardians?search=${encodeURIComponent(term)}&pageSize=10`
      );
      setGuardianResults(
        res.data.map((g) => ({
          guardianId: g.id,
          lastName: g.last_name,
          firstNames: g.first_names,
          relationship: g.relationship,
          phoneMain: g.phoneMain,
          phoneSecondary: null,
          email: null,
          isPrimaryContact: false,
          isLegalGuardian: false,
          contactAllowed: true,
        }))
      );
    } catch {
      setGuardianResults([]);
    }
  };

  const handleLinkGuardian = async (guardianId: number) => {
    if (!student) return;
    try {
      await api.post(`/students/${student.id}/guardians`, { guardianId, link: {} });
      setLinkOpen(false);
      setGuardianSearch('');
      setGuardianResults([]);
      setSnack('Responsable associé.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    }
  };

  const handleCreateAndLinkGuardian = async () => {
    if (!student) return;
    setSaving(true);
    try {
      await api.post(`/students/${student.id}/guardians`, {
        lastName: newGuardian.lastName.trim(),
        firstNames: newGuardian.firstNames.trim(),
        relationship: newGuardian.relationship,
        phoneMain: newGuardian.phoneMain.trim(),
      });
      setNewGuardianOpen(false);
      setNewGuardian({ lastName: '', firstNames: '', relationship: 'father', phoneMain: '' });
      setSnack('Responsable créé et associé.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (guardianId: number) => {
    if (!student) return;
    try {
      await api.patch(`/students/${student.id}/guardians/${guardianId}`, { isPrimaryContact: true });
      setSnack('Contact principal mis à jour.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleUnlink = async (guardianId: number) => {
    if (!student) return;
    setSaving(true);
    try {
      await api.delete(`/students/${student.id}/guardians/${guardianId}`);
      setSnack('Association retirée. Le responsable reste disponible pour ses autres enfants.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!student) return;
    try {
      await api.patch(`/students/${student.id}`, { status });
      setSnack('Statut administratif mis à jour.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography color="text.secondary" sx={{ mt: 2 }}>Chargement de la fiche…</Typography>
      </Box>
    );
  }

  if (!student) {
    return <Alert severity="error">{error ?? 'Élève introuvable.'}</Alert>;
  }

  const current = enrollments.find((e) => e.status === 'active') ?? null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={800}>
            {student.last_name.toUpperCase()} {student.first_names}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <Typography variant="body2" fontFamily="monospace" fontWeight={700} color="primary.main">
              {student.matricule}
            </Typography>
            <Chip
              label={student.status === 'active' ? 'Inscrit' : student.status === 'departed' ? 'Départ' : 'Archivé'}
              size="small"
              color={student.status === 'active' ? 'success' : 'default'}
            />
          </Stack>
        </Box>
        <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.open(`/students/${student.id}/print`, '_blank')}>
          Imprimer la fiche
        </Button>
        <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={openEdit}>
          Modifier
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Identité */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>Identité</Typography>
                <TextField
                  select size="small" label="Statut" value={student.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  sx={{ width: 140 }}
                >
                  <MenuItem value="active">Inscrit</MenuItem>
                  <MenuItem value="departed">Départ</MenuItem>
                  <MenuItem value="archived">Archivé</MenuItem>
                </TextField>
              </Stack>
              <Stack spacing={0.5}>
                <InfoRow label="Nom" value={student.last_name.toUpperCase()} />
                <InfoRow label="Prénom(s)" value={student.first_names} />
                <InfoRow label="Date de naissance" value={student.birth_date ? new Date(student.birth_date).toLocaleDateString('fr-MG') : 'Non renseignée'} />
                <InfoRow label="Sexe" value={student.sex === 'M' ? 'Masculin' : student.sex === 'F' ? 'Féminin' : 'Non renseigné'} />
                <InfoRow label="Adresse" value={student.address ?? '—'} />
                <InfoRow label="Date d’entrée" value={student.entry_date ? new Date(student.entry_date).toLocaleDateString('fr-MG') : '—'} />
                <InfoRow label="Créé par" value={student.createdByName ?? '—'} />
                <InfoRow label="Dernière modification" value={student.updatedByName ? `${student.updatedByName}, ${new Date(student.updated_at).toLocaleString('fr-MG')}` : '—'} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Inscription actuelle */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>Inscription actuelle</Typography>
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEnrollOpen(true)}>
                  {current ? 'Changer de classe' : 'Inscrire'}
                </Button>
              </Stack>
              {current ? (
                <Stack spacing={0.5}>
                  <InfoRow label="Classe" value={`${current.className} (${current.levelName})`} />
                  <InfoRow label="Année scolaire" value={current.schoolYearLabel} />
                  <InfoRow label="Depuis le" value={new Date(current.enrollmentDate).toLocaleDateString('fr-MG')} />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aucune inscription active. Utilisez « Inscrire » pour affecter cet élève à une classe de
                  l’année scolaire active.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Responsables légaux */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>Responsables légaux</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setLinkOpen(true)}>Associer existant</Button>
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setNewGuardianOpen(true)}>
                    Nouveau
                  </Button>
                </Stack>
              </Stack>
              {guardians.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Aucun responsable enregistré.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  {guardians.map((g) => (
                    <Box key={g.guardianId} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" fontWeight={700}>
                              {g.lastName} {g.firstNames}
                            </Typography>
                            {g.isPrimaryContact && <Chip label="Contact principal" size="small" color="primary" />}
                            {g.isLegalGuardian && <Chip label="Légal" size="small" variant="outlined" />}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {REL_LABELS[g.relationship] ?? g.relationship} — {g.phoneMain}
                            {g.contactAllowed ? '' : ' (contact non autorisé)'}
                          </Typography>
                        </Box>
                        <Stack direction="row">
                          {!g.isPrimaryContact && (
                            <IconButton size="small" title="Définir comme contact principal" onClick={() => handleSetPrimary(g.guardianId)}>
                              <StarBorderIcon fontSize="small" />
                            </IconButton>
                          )}
                          {g.isPrimaryContact && (
                            <IconButton size="small" disabled>
                              <StarIcon fontSize="small" color="primary" />
                            </IconButton>
                          )}
                          <IconButton size="small" title="Retirer l’association" onClick={() => handleUnlink(g.guardianId)} disabled={saving}>
                            <LinkOffIcon fontSize="small" color="error" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Historique des inscriptions */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
                Historique des inscriptions
              </Typography>
              {enrollments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Aucune inscription enregistrée.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Année</TableCell>
                        <TableCell>Classe</TableCell>
                        <TableCell>Statut</TableCell>
                        <TableCell>Fin</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {enrollments.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.schoolYearLabel}</TableCell>
                          <TableCell>{e.className}</TableCell>
                          <TableCell>
                            <Chip
                              label={ENROLL_STATUS[e.status] ?? e.status}
                              size="small"
                              color={e.status === 'active' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {e.exitDate ? new Date(e.exitDate).toLocaleDateString('fr-MG') : '—'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Communications avec les parents */}
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <StudentContactsSection
            studentId={id}
            guardians={guardians.map((g) => ({
              guardianId: g.guardianId,
              lastName: g.lastName,
              firstNames: g.firstNames,
              relationship: g.relationship,
            }))}
          />
        </CardContent>
      </Card>

      {/* Dialogue modification */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Modifier la fiche élève</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Nom" fullWidth value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Prénom(s)" fullWidth value={editForm.firstNames} onChange={(e) => setEditForm({ ...editForm, firstNames: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Date de naissance" type="date" fullWidth value={editForm.birthDate} onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select label="Sexe" fullWidth value={editForm.sex} onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}>
                <MenuItem value="">Non renseigné</MenuItem>
                <MenuItem value="M">Masculin</MenuItem>
                <MenuItem value="F">Féminin</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField label="Adresse" fullWidth value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2 }} variant="outlined">
            Les modifications n’affectent pas les inscriptions déjà enregistrées.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleEditSave} variant="contained" disabled={saving}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue inscription / changement de classe */}
      <Dialog open={enrollOpen} onClose={() => setEnrollOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{current ? 'Changement de classe' : 'Inscrire dans une classe'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {current && (
              <Alert severity="info" variant="outlined">
                Classe actuelle : <strong>{current.className}</strong> ({current.schoolYearLabel}). L’ancienne
                affectation sera clôturée et conservée dans l’historique.
              </Alert>
            )}
            <TextField
              select label="Nouvelle classe" fullWidth value={enrollForm.classId}
              onChange={(e) => setEnrollForm({ ...enrollForm, classId: e.target.value })}
            >
              {classes.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name} — {c.levelName} ({c.yearLabel})
                  {c.capacity ? ` — ${c.capacity} places max` : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Date d’inscription" type="date" fullWidth value={enrollForm.enrollmentDate}
              onChange={(e) => setEnrollForm({ ...enrollForm, enrollmentDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollOpen(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleEnroll} variant="contained" disabled={saving || !enrollForm.classId}>
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue association responsable existant */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Associer un responsable existant</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Rechercher (nom ou téléphone)" fullWidth value={guardianSearch}
              onChange={(e) => searchGuardians(e.target.value)}
              helperText="Saisissez au moins 2 caractères."
            />
            {guardianResults.map((g) => (
              <Box
                key={g.guardianId}
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={700}>{g.lastName} {g.firstNames}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {REL_LABELS[g.relationship] ?? g.relationship} — {g.phoneMain}
                  </Typography>
                </Box>
                <Button size="small" variant="outlined" onClick={() => handleLinkGuardian(g.guardianId)}>
                  Associer
                </Button>
              </Box>
            ))}
            {guardianSearch.trim().length >= 2 && guardianResults.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Aucun responsable trouvé. Utilisez « Nouveau » pour en créer un.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue création rapide responsable */}
      <Dialog open={newGuardianOpen} onClose={() => setNewGuardianOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau responsable légal</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Nom" fullWidth value={newGuardian.lastName} onChange={(e) => setNewGuardian({ ...newGuardian, lastName: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Prénom(s)" fullWidth value={newGuardian.firstNames} onChange={(e) => setNewGuardian({ ...newGuardian, firstNames: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Lien avec l’enfant" fullWidth value={newGuardian.relationship} onChange={(e) => setNewGuardian({ ...newGuardian, relationship: e.target.value })}>
                <MenuItem value="father">Père</MenuItem>
                <MenuItem value="mother">Mère</MenuItem>
                <MenuItem value="legal_guardian">Tuteur légal</MenuItem>
                <MenuItem value="other">Autre</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Téléphone principal" fullWidth placeholder="034 00 000 00" value={newGuardian.phoneMain} onChange={(e) => setNewGuardian({ ...newGuardian, phoneMain: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewGuardianOpen(false)} disabled={saving}>Annuler</Button>
          <Button
            onClick={handleCreateAndLinkGuardian}
            variant="contained"
            disabled={saving || !newGuardian.lastName.trim() || !newGuardian.firstNames.trim() || !newGuardian.phoneMain.trim()}
          >
            Créer et associer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 180, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Stack>
  );
}
