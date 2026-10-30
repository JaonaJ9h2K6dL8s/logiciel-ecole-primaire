'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Typography,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { api, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';
import FormDialog from '@/components/admin/FormDialog';

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
interface PeriodAvg {
  periodId: number;
  periodName: string;
  average: number | null;
}
interface ResultRow {
  studentId: number;
  matricule: string;
  studentName: string;
  periodAverages: PeriodAvg[];
  annualAverage: number | null;
  decision: 'promoted' | 'repeats' | 'other' | null;
  decisionLabel: string;
  decisionComment: string | null;
}

const DECISION_COLOR: Record<string, 'success' | 'warning' | 'default' | 'info'> = {
  promoted: 'success',
  repeats: 'warning',
  other: 'default',
  pending: 'info',
};

export default function AnnualResultsPage() {
  const { user } = useAuthStore();
  const canDecide = user?.permissions.includes('annual_decisions.manage') ?? false;

  const [years, setYears] = useState<SchoolYear[]>([]);
  const [yearId, setYearId] = useState<number | ''>('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<number | ''>('');
  const [periods, setPeriods] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [rule, setRule] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [decTarget, setDecTarget] = useState<ResultRow | null>(null);
  const [decForm, setDecForm] = useState({ decision: '' as '' | 'promoted' | 'repeats' | 'other', otherLabel: '', comment: '' });
  const [decError, setDecError] = useState<string | null>(null);
  const [decBusy, setDecBusy] = useState(false);

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

  const load = useCallback(async () => {
    if (yearId === '' || classId === '') {
      setRows(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: { periods: { id: number; name: string }[]; results: ResultRow[] }; meta: { rule: string } }>(
        `/report-cards/annual-results?schoolYearId=${yearId}&classId=${classId}`
      );
      setPeriods(res.data.periods);
      setRows(res.data.results);
      setRule(res.meta.rule);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [yearId, classId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDecision = (r: ResultRow) => {
    setDecTarget(r);
    setDecForm({ decision: r.decision ?? '', otherLabel: '', comment: r.decisionComment ?? '' });
    setDecError(null);
  };

  const saveDecision = async () => {
    if (!decTarget) return;
    if (decForm.decision === '' ) {
      setDecError('Choisissez une décision.');
      return;
    }
    if (decForm.decision === 'other' && decForm.otherLabel.trim().length < 2) {
      setDecError('Libellé requis pour une décision « autre ».');
      return;
    }
    setDecBusy(true);
    setDecError(null);
    try {
      await api.post('/report-cards/annual-decisions', {
        studentId: decTarget.studentId,
        classId,
        schoolYearId: yearId,
        decision: decForm.decision,
        otherLabel: decForm.otherLabel.trim() || undefined,
        comment: decForm.comment.trim() || undefined,
      });
      setSnack('Décision enregistrée.');
      setDecTarget(null);
      load();
    } catch (err) {
      setDecError(err instanceof ApiError ? err.message : 'Erreur.');
    } finally {
      setDecBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Résultats annuels"
        subtitle="Résultats des périodes, moyenne annuelle et décisions de passage"
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
          <Button
            variant="contained"
            startIcon={<SearchOutlinedIcon />}
            disabled={yearId === '' || classId === '' || loading}
            onClick={load}
          >
            Afficher
          </Button>
        </Stack>
        {rule && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Règle de calcul : {rule}
          </Typography>
        )}
      </Card>

      {rows !== null && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Matricule</TableCell>
                  <TableCell>Élève</TableCell>
                  {periods.map((p) => (
                    <TableCell key={p.id} align="center">
                      {p.name}
                    </TableCell>
                  ))}
                  <TableCell align="center">Moyenne annuelle</TableCell>
                  <TableCell>Décision</TableCell>
                  {canDecide && <TableCell align="right">Action</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.studentId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {r.matricule}
                      </Typography>
                    </TableCell>
                    <TableCell>{r.studentName}</TableCell>
                    {periods.map((p) => {
                      const pa = r.periodAverages.find((x) => x.periodId === p.id);
                      return (
                        <TableCell key={p.id} align="center">
                          {pa?.average !== null && pa?.average !== undefined ? pa.average.toFixed(2) : '—'}
                        </TableCell>
                      );
                    })}
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={700}>
                        {r.annualAverage !== null ? `${r.annualAverage.toFixed(2)} / 20` : 'Indisponible'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.decisionLabel}
                        color={DECISION_COLOR[r.decision ?? 'pending'] ?? 'info'}
                        variant="outlined"
                      />
                    </TableCell>
                    {canDecide && (
                      <TableCell align="right">
                        <Button size="small" startIcon={<GavelOutlinedIcon />} onClick={() => openDecision(r)}>
                          Décider
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={periods.length + 5}>
                      <EmptyState message="Aucun élève inscrit dans cette classe pour cette année." />
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
          <EmptyState message="Choisissez une année et une classe puis cliquez sur « Afficher »." />
        </Card>
      )}

      {canDecide && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Aucune règle de passage automatique n’est appliquée : la décision est administrative, prise par une personne autorisée et journalisée.
        </Alert>
      )}

      <FormDialog
        open={decTarget !== null}
        title={`Décision — ${decTarget?.studentName ?? ''}`}
        saving={decBusy}
        onClose={() => setDecTarget(null)}
        onSubmit={saveDecision}
        submitLabel="Enregistrer"
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            required
            label="Décision"
            value={decForm.decision}
            onChange={(e) => setDecForm({ ...decForm, decision: e.target.value as typeof decForm.decision })}
          >
            <MenuItem value="">—</MenuItem>
            <MenuItem value="promoted">Passage en classe supérieure</MenuItem>
            <MenuItem value="repeats">Redoublement</MenuItem>
            <MenuItem value="other">Autre décision</MenuItem>
          </TextField>
          {decForm.decision === 'other' && (
            <TextField
              required
              label="Libellé de la décision"
              value={decForm.otherLabel}
              onChange={(e) => setDecForm({ ...decForm, otherLabel: e.target.value })}
            />
          )}
          <TextField
            multiline
            minRows={2}
            label="Commentaire facultatif"
            value={decForm.comment}
            onChange={(e) => setDecForm({ ...decForm, comment: e.target.value })}
          />
          {decError && <Alert severity="error">{decError}</Alert>}
        </Stack>
      </FormDialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  );
}
