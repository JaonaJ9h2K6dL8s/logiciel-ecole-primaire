'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
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
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { api, ApiError } from '@/services/api';

// Participants nominatifs d'un événement : liste manuelle, confirmation et présence constatée.
// La présence n'est jamais déduite de la classe : elle est saisie par un utilisateur.

interface ParticipantRow {
  studentId: number;
  confirmed: number | boolean;
  attendance: string;
  notes: string | null;
  student_last_name: string;
  student_first_names: string;
}

interface StudentOption {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
}

interface Props {
  eventId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function EventParticipantsDialog({ eventId, onClose, onSaved }: Props) {
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [confirmedMap, setConfirmedMap] = useState<Record<number, boolean>>({});
  const [attendanceMap, setAttendanceMap] = useState<Record<number, string>>({});
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});
  const [classes, setClasses] = useState<{ id: number; name: string; schoolYearId: number }[]>([]);
  const [schoolYearId, setSchoolYearId] = useState<number | null>(null);
  const [pickClass, setPickClass] = useState('');
  const [candidates, setCandidates] = useState<StudentOption[]>([]);
  const [added, setAdded] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'));
  const [snack, setSnack] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{
        event: { schoolYearId: number; status: string };
        classes: { id: number; name: string; schoolYearId: number }[];
        participants: ParticipantRow[];
      }>(`/school-events/${eventId}`);
      setSchoolYearId(res.event.schoolYearId);
      setClasses(res.classes);
      setParticipants(res.participants);
      const c: Record<number, boolean> = {};
      const a: Record<number, string> = {};
      const n: Record<number, string> = {};
      for (const p of res.participants) {
        c[p.studentId] = p.confirmed === 1 || p.confirmed === true;
        a[p.studentId] = p.attendance ?? 'unknown';
        n[p.studentId] = p.notes ?? '';
      }
      setConfirmedMap(c);
      setAttendanceMap(a);
      setNotesMap(n);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCandidates = useCallback(
    async (classId: string) => {
      setCandidates([]);
      setAdded([]);
      if (classId === '') return;
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '100', classId });
        if (schoolYearId) params.set('schoolYearId', String(schoolYearId));
        const res = await api.get<{ data: StudentOption[] }>(`/students?${params.toString()}`);
        setCandidates(res.data);
      } catch {
        setCandidates([]);
      }
    },
    [schoolYearId]
  );

  const addStudent = (student: StudentOption) => {
    if (participants.some((p) => p.studentId === student.id) || added.some((s) => s.id === student.id)) return;
    setAdded([...added, student]);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const students = [
        ...participants.map((p) => ({ studentId: p.studentId, confirmed: Boolean(confirmedMap[p.studentId]) })),
        ...added.map((s) => ({ studentId: s.id, confirmed: false })),
      ];
      await api.put(`/school-events/${eventId}/participants`, { students });
      const entries = [...participants.map((p) => p.studentId), ...added.map((s) => s.id)]
        .filter((id) => (attendanceMap[id] ?? 'unknown') !== 'unknown')
        .map((id) => ({
          studentId: id,
          attended: attendanceMap[id],
          notes: (notesMap[id] ?? '').trim() === '' ? null : (notesMap[id] ?? '').trim(),
        }));
      if (entries.length > 0) {
        await api.put(`/school-events/${eventId}/attendance`, { entries });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: number, fallback?: string) => {
    const p = participants.find((x) => x.studentId === id);
    if (p) return `${p.student_last_name} ${p.student_first_names}`;
    const a = added.find((x) => x.id === id);
    return a ? `${a.last_name} ${a.first_names}` : (fallback ?? `#${id}`);
  };

  const allIds = [...participants.map((p) => p.studentId), ...added.map((s) => s.id)];

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreenDialog}>
      <DialogTitle>Participants et présence</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Typography>Chargement…</Typography>
        ) : (
          <Stack spacing={2}>
            {classes.length > 0 && (
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                  select
                  size="small"
                  label="Ajouter depuis une classe"
                  sx={{ minWidth: 240 }}
                  value={pickClass}
                  onChange={(e) => {
                    setPickClass(e.target.value);
                    loadCandidates(e.target.value);
                  }}
                >
                  <MenuItem value="">—</MenuItem>
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            )}

            {candidates.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {candidates
                  .filter((s) => !allIds.includes(s.id))
                  .slice(0, 40)
                  .map((s) => (
                    <Button
                      key={s.id}
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => addStudent(s)}
                    >
                      {s.last_name} {s.first_names} ({s.matricule})
                    </Button>
                  ))}
              </Stack>
            )}

            {allIds.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucun participant. Ajoutez des élèves depuis leurs classes ci-dessus.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Élève</TableCell>
                    <TableCell>Confirmé</TableCell>
                    <TableCell>Présence constatée</TableCell>
                    <TableCell>Observation</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allIds.map((id) => (
                    <TableRow key={id}>
                      <TableCell>{nameOf(id)}</TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={confirmedMap[id] ? 'yes' : 'no'}
                          onChange={(e) => setConfirmedMap({ ...confirmedMap, [id]: e.target.value === 'yes' })}
                          sx={{ minWidth: 110 }}
                        >
                          <MenuItem value="no">Non</MenuItem>
                          <MenuItem value="yes">Oui</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={attendanceMap[id] ?? 'unknown'}
                          onChange={(e) => setAttendanceMap({ ...attendanceMap, [id]: e.target.value })}
                          sx={{ minWidth: 130 }}
                        >
                          <MenuItem value="unknown">Non renseignée</MenuItem>
                          <MenuItem value="present">Présent</MenuItem>
                          <MenuItem value="absent">Absent</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          value={notesMap[id] ?? ''}
                          onChange={(e) => setNotesMap({ ...notesMap, [id]: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fermer sans enregistrer</Button>
        <Button variant="contained" onClick={submit} disabled={saving || loading}>
          Enregistrer
        </Button>
      </DialogActions>
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Dialog>
  );
}
