'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
  Tooltip,
  Typography,
} from '@mui/material';
import CachedOutlinedIcon from '@mui/icons-material/CachedOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}
interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  schoolYearId: number;
}
interface GradingPeriod {
  id: number;
  schoolYearId: number;
  name: string;
}
interface StudentRow {
  studentId: number;
  matricule: string;
  studentName: string;
  reportCardId: number | null;
  status: 'draft' | 'ready' | 'validated' | 'locked' | 'cancelled' | null;
  generalAverage: number | null;
  revision: number | null;
  subjectsGraded: number | null;
  subjectsTotal: number | null;
}

const STATUS: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  draft: { label: 'Brouillon', color: 'info' },
  ready: { label: 'Prêt', color: 'warning' },
  validated: { label: 'Validé', color: 'success' },
  locked: { label: 'Verrouillé', color: 'default' },
  cancelled: { label: 'Annulé', color: 'error' },
};

export default function ReportCardsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManage = user?.permissions.includes('report_cards.manage') ?? false;

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [yearId, setYearId] = useState<number | ''>('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<number | ''>('');
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | ''>('');

  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [periodLabel, setPeriodLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generateConfirm, setGenerateConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Options de formulaire dans le périmètre du rôle (années + classes).
        const res = await api.get<{ data: { years: SchoolYear[] } }>('/grading-periods/form-options');
        setYears(res.data.years);
        const active = res.data.years.find((y) => y.isActive);
        setYearId(active ? active.id : res.data.years.length > 0 ? res.data.years[0].id : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des années.');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (yearId === '') {
        setClasses([]);
        return;
      }
      try {
        const res = await api.get<{ data: { classes: ClassRow[] } }>(`/grading-periods/form-options?schoolYearId=${yearId}`);
        setClasses(res.data.classes);
      } catch {
        setClasses([]);
      }
    })();
  }, [yearId]);

  useEffect(() => {
    (async () => {
      if (yearId === '') {
        setPeriods([]);
        return;
      }
      try {
        const res = await api.get<{ data: GradingPeriod[] }>(`/grading-periods?schoolYearId=${yearId}`);
        setPeriods(res.data);
      } catch {
        setPeriods([]);
      }
    })();
  }, [yearId]);

  const load = useCallback(async () => {
    if (classId === '' || periodId === '') {
      setRows(null);
      return;
    }
    setError(null);
    try {
      const res = await api.get<{
        data: { period: { name: string }; students: StudentRow[] };
      }>(`/report-cards?schoolYearId=${yearId}&gradingPeriodId=${periodId}&classId=${classId}`);
      setRows(res.data.students);
      setPeriodLabel(res.data.period.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    }
  }, [yearId, classId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  const generateAll = async () => {
    if (classId === '' || periodId === '') return;
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>('/report-cards/generate', {
        classId,
        gradingPeriodId: periodId,
      });
      setSnack(res.message ?? 'Bulletins générés.');
      setGenerateConfirm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Bulletins scolaires"
        subtitle="Préparation, validation, verrouillage et impression par période"
        action={
          canManage && classId !== '' && periodId !== '' ? (
            <Button variant="contained" startIcon={<CachedOutlinedIcon />} disabled={busy} onClick={() => setGenerateConfirm(true)}>
              Générer / rafraîchir la classe
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Année scolaire"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value === '' ? '' : Number(e.target.value));
              setClassId('');
              setPeriodId('');
              setRows(null);
            }}
            sx={{ minWidth: 180 }}
          >
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
                {y.isActive ? ' (active)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Classe"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value === '' ? '' : Number(e.target.value));
              setRows(null);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">—</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} ({c.levelName})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Période"
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value === '' ? '' : Number(e.target.value));
              setRows(null);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">—</MenuItem>
            {periods.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Card>

      {rows !== null && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Matricule</TableCell>
                  <TableCell>Élève</TableCell>
                  <TableCell>Matières évaluées</TableCell>
                  <TableCell align="center">Moyenne générale</TableCell>
                  <TableCell>État</TableCell>
                  <TableCell>Révision</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const incomplete = r.subjectsTotal !== null && r.subjectsGraded !== null && r.subjectsGraded < r.subjectsTotal;
                  return (
                    <TableRow key={r.studentId} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {r.matricule}
                        </Typography>
                      </TableCell>
                      <TableCell>{r.studentName}</TableCell>
                      <TableCell>
                        {r.subjectsTotal !== null ? `${r.subjectsGraded}/${r.subjectsTotal}` : '—'}
                        {incomplete && (
                          <Tooltip title="Des matières ne sont pas évaluées : validation bloquée jusqu'à correction.">
                            <WarningAmberOutlinedIcon color="warning" sx={{ fontSize: 16, ml: 1, verticalAlign: 'middle' }} />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {r.generalAverage !== null ? `${r.generalAverage.toFixed(2)} / 20` : 'Indisponible'}
                      </TableCell>
                      <TableCell>
                        {r.status ? (
                          <Chip size="small" label={STATUS[r.status].label} color={STATUS[r.status].color} variant="outlined" />
                        ) : (
                          <Chip size="small" label="Non généré" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>{r.revision ?? '—'}</TableCell>
                      <TableCell align="right">
                        {r.reportCardId ? (
                          <Button
                            size="small"
                            startIcon={<VisibilityOutlinedIcon />}
                            onClick={() => router.push(`/report-cards/${r.reportCardId}`)}
                          >
                            Ouvrir
                          </Button>
                        ) : (
                          canManage && (
                            <Button
                              size="small"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await api.post('/report-cards/generate', {
                                    classId,
                                    gradingPeriodId: periodId,
                                    studentId: r.studentId,
                                  });
                                  setSnack('Bulletin généré.');
                                  load();
                                } catch (err) {
                                  setError(err instanceof ApiError ? err.message : 'Erreur.');
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Générer
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState message={`Aucun élève inscrit pour ${periodLabel || 'cette période'}.`} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {rows === null && (
        <Card sx={{ p: 2 }}>
          <EmptyState message="Choisissez une classe et une période pour afficher les bulletins." />
        </Card>
      )}

      <ConfirmDialog
        open={generateConfirm}
        title="Générer / rafraîchir les bulletins"
        message="Les bulletins en brouillon ou prêts seront recalculés depuis les notes. Les bulletins déjà validés ou verrouillés ne sont jamais modifiés. La génération ne valide rien automatiquement."
        confirmLabel="Générer"
        loading={busy}
        onConfirm={generateAll}
        onClose={() => setGenerateConfirm(false)}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
