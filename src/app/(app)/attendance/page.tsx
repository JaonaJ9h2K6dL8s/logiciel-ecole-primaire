'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useAuthStore } from '@/stores/authStore';

interface MyClass {
  id: number;
  name: string;
  levelName: string;
  schoolYearLabel: string;
}

interface RosterStudent {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
}

interface SessionRecord {
  studentId: number;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  comment: string | null;
}

interface SessionDetail {
  session: {
    id: number;
    class_id: number;
    session_date: string;
    slot: number;
    status: 'draft' | 'submitted';
  };
  roster: RosterStudent[];
  records: SessionRecord[];
}

interface SessionRow {
  id: number;
  classId: number;
  className: string;
  sessionDate: string;
  slot: number;
  status: 'draft' | 'submitted';
  teacherName: string | null;
  recordCount: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
}

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

const STATUS_LABELS: Record<Status, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  LATE: 'En retard',
  EXCUSED: 'Abs. justifiée',
};

const todayStr = () => {
  // Valeur initiale du champ date uniquement (l'heure officielle reste celle du serveur).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AttendancePage() {
  const { user } = useAuthStore();
  const canCorrect = Boolean(user?.permissions.includes('attendance.correct'));
  const [tab, setTab] = useState(0);

  const [classes, setClasses] = useState<MyClass[]>([]);
  const [classId, setClassId] = useState<number | ''>('');
  const [date, setDate] = useState(todayStr());
  const [slot, setSlot] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [statuses, setStatuses] = useState<Record<number, Status>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [reopenTarget, setReopenTarget] = useState<SessionRow | null>(null);

  useEffect(() => {
    api
      .get<{ data: MyClass[] }>('/attendance/my-classes')
      .then((r) => {
        setClasses(r.data);
        if (r.data.length > 0) setClassId(r.data[0].id);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Erreur de chargement des classes.'));
  }, []);

  const loadSessions = useCallback(async () => {
    if (classId === '') return;
    try {
      const res = await api.get<{ data: SessionRow[] }>(
        `/attendance/sessions?classId=${classId}&pageSize=20`
      );
      setSessions(res.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur.');
    }
  }, [classId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const openSession = useCallback(async (id: number) => {
    setPageError(null);
    try {
      const res = await api.get<{ data: SessionDetail }>(`/attendance/sessions/${id}`);
      setSession(res.data);
      const st: Record<number, Status> = {};
      const cm: Record<number, string> = {};
      for (const r of res.data.records) {
        st[r.studentId] = r.status;
        if (r.comment) cm[r.studentId] = r.comment;
      }
      setStatuses(st);
      setComments(cm);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Erreur de chargement de la séance.');
    }
  }, []);

  const handleOpenOrCreate = async () => {
    if (classId === '' || !date) return;
    setBusy(true);
    setPageError(null);
    try {
      // Si la séance existe déjà pour (classe, date, séance), on l'ouvre ; sinon création.
      const existing = await api.get<{ data: SessionRow[] }>(
        `/attendance/sessions?classId=${classId}&date=${date}&pageSize=50`
      );
      const found = existing.data.find((s) => s.slot === slot);
      if (found) {
        await openSession(found.id);
        setTab(0);
        return;
      }
      const created = await api.post<{ data: { id: number } }>('/attendance/sessions', {
        classId,
        sessionDate: date,
        slot,
      });
      await openSession(created.data.id);
      await loadSessions();
      setTab(0);
      setSnack('Séance d’appel créée.');
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };

  const saveRecords = async (): Promise<boolean> => {
    if (!session) return false;
    const entries = Object.entries(statuses);
    if (entries.length === 0) {
      setPageError('Aucun statut saisi : marquez au moins un élève.');
      return false;
    }
    setBusy(true);
    setPageError(null);
    try {
      await api.put(`/attendance/sessions/${session.session.id}/records`, {
        records: entries.map(([studentId, status]) => ({
          studentId: Number(studentId),
          status,
          comment: comments[Number(studentId)] || undefined,
        })),
      });
      setSnack('Feuille d’appel enregistrée.');
      return true;
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Erreur d’enregistrement.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitSession = async () => {
    const ok = await saveRecords();
    if (!ok || !session) return;
    setBusy(true);
    try {
      await api.post(`/attendance/sessions/${session.session.id}/submit`);
      setSnack('Appel validé.');
      await openSession(session.session.id);
      await loadSessions();
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Erreur de validation.');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (row: SessionRow) => {
    setBusy(true);
    try {
      await api.post(`/attendance/sessions/${row.id}/reopen`);
      setSnack('Appel rouvert pour correction.');
      await openSession(row.id);
      await loadSessions();
      setTab(0);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };

  const isDraft = session?.session.status === 'draft';
  const excusedMissingJustification = Object.entries(statuses).some(
    ([sid, st]) => st === 'EXCUSED' && !(comments[Number(sid)] ?? '').trim()
  );

  return (
    <Box>
      <PageHeader
        title="Appel en classe"
        subtitle={
          classes.length > 0
            ? `Classes autorisées : ${classes.map((c) => c.name).join(', ')} — ${classes[0]?.schoolYearLabel ?? ''}`
            : 'Aucune classe vous est affectée pour l’année active'
        }
      />

      {(loadError || pageError) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => { setLoadError(null); setPageError(null); }}>
          {loadError ?? pageError}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 2, pt: 1 }}>
          <Tab label="Feuille d’appel" />
          <Tab label="Historique des appels" />
        </Tabs>
      </Card>

      {tab === 0 && (
        <Stack spacing={2}>
          <Card>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }} alignItems="flex-end">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Classe</InputLabel>
                <Select
                  value={classId === '' ? '' : String(classId)}
                  label="Classe"
                  onChange={(e) => setClassId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({c.levelName})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                type="date"
                label="Date de la séance"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 170 }}
              />
              <TextField
                size="small"
                select
                label="Séance"
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
                sx={{ minWidth: 110 }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <MenuItem key={s} value={s}>
                    Séance {s}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" onClick={handleOpenOrCreate} disabled={busy || classId === ''}>
                {busy ? <CircularProgress size={20} /> : 'Ouvrir l’appel'}
              </Button>
            </Stack>
          </Card>

          {session && (
            <Card>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ p: 2, pb: 1 }}
                alignItems="center"
              >
                <Typography variant="subtitle1" fontWeight={800} sx={{ flex: 1 }}>
                  {classes.find((c) => c.id === session.session.class_id)?.name ?? `Classe #${session.session.class_id}`}{' '}
                  — {session.session.session_date} — Séance {session.session.slot}
                  <Chip
                    size="small"
                    sx={{ ml: 1 }}
                    color={isDraft ? 'default' : 'success'}
                    icon={isDraft ? <LockOpenOutlinedIcon /> : <LockOutlinedIcon />}
                    label={isDraft ? 'Brouillon' : 'Validé'}
                  />
                </Typography>
                {isDraft && (
                  <>
                    <Button onClick={() => void saveRecords()} disabled={busy} variant="outlined">
                      Enregistrer
                    </Button>
                    <Button
                      onClick={() => setSubmitOpen(true)}
                      disabled={busy || Object.keys(statuses).length === 0 || excusedMissingJustification}
                      variant="contained"
                      startIcon={<CheckCircleOutlinedIcon />}
                    >
                      Valider l’appel
                    </Button>
                  </>
                )}
                {excusedMissingJustification && (
                  <Typography variant="caption" color="error">
                    Justification requise pour chaque absence justifiée.
                  </Typography>
                )}
              </Stack>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Matricule</TableCell>
                      <TableCell>Élève</TableCell>
                      <TableCell>Statut de la séance</TableCell>
                      <TableCell>Commentaire / justification</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {session.roster.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>
                            {s.matricule}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {s.last_name} {s.first_names}
                        </TableCell>
                        <TableCell>
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={statuses[s.id] ?? null}
                            onChange={(_e, v) => {
                              if (!isDraft || !v) return;
                              setStatuses((prev) => ({ ...prev, [s.id]: v }));
                            }}
                          >
                            {(Object.keys(STATUS_LABELS) as Status[]).map((st) => (
                              <ToggleButton key={st} value={st} disabled={!isDraft}>
                                {STATUS_LABELS[st]}
                              </ToggleButton>
                            ))}
                          </ToggleButtonGroup>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            value={comments[s.id] ?? ''}
                            onChange={(e) => setComments((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            disabled={!isDraft}
                            error={statuses[s.id] === 'EXCUSED' && !(comments[s.id] ?? '').trim()}
                            helperText={
                              statuses[s.id] === 'EXCUSED' && !(comments[s.id] ?? '').trim()
                                ? 'Justification obligatoire.'
                                : undefined
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {session.roster.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <EmptyState message="Aucun élève inscrit dans cette classe à la date de la séance." />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 1, display: 'block' }}>
                Aucun élève n’est présélectionné : chaque statut est saisi explicitement. Les élèves inscrits
                après la date de la séance n’apparaissent pas.
              </Typography>
            </Card>
          )}
        </Stack>
      )}

      {tab === 1 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Classe</TableCell>
                  <TableCell>Séance</TableCell>
                  <TableCell>Statuts</TableCell>
                  <TableCell>Professeur</TableCell>
                  <TableCell>État</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(sessions ?? []).map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>{s.sessionDate}</TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell>Séance {s.slot}</TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {s.presentCount} présents · {s.absentCount} absents · {s.lateCount} retards ·{' '}
                        {s.excusedCount} justifiées
                      </Typography>
                    </TableCell>
                    <TableCell>{s.teacherName ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={s.status === 'draft' ? 'Brouillon' : 'Validé'}
                        color={s.status === 'draft' ? 'default' : 'success'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => { openSession(s.id); setTab(0); }}>
                        Ouvrir
                      </Button>
                      {s.status === 'submitted' && canCorrect && (
                        <Button size="small" onClick={() => setReopenTarget(s)}>
                          Rouvrir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {sessions !== null && sessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState message="Aucun appel enregistré pour cette classe." />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <ConfirmDialog
        open={submitOpen}
        title="Valider l'appel"
        message="Après validation, la modification nécessite la permission de correction et est journalisée. Continuer ?"
        confirmLabel="Valider"
        loading={busy}
        onConfirm={() => {
          setSubmitOpen(false);
          void submitSession();
        }}
        onClose={() => setSubmitOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(reopenTarget)}
        title="Rouvrir l'appel"
        message={`Rouvrir l'appel du ${reopenTarget?.sessionDate} (séance ${reopenTarget?.slot}) pour correction ? L'opération est journalisée.`}
        confirmLabel="Rouvrir"
        loading={busy}
        onConfirm={() => {
          const target = reopenTarget;
          setReopenTarget(null);
          if (target) void reopen(target);
        }}
        onClose={() => setReopenTarget(null)}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
