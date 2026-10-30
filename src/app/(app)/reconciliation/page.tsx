'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  Chip,
  MenuItem,
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
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import { api } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';
import EmptyState from '@/components/admin/EmptyState';

interface AlertRow {
  type: string;
  certainty: 'elevee' | 'moyenne' | 'faible';
  reason: string;
  studentId: number;
  studentName: string;
  matricule: string;
  classId: number | null;
  className: string | null;
  sessionId: number | null;
  slot: number | null;
  details: Record<string, unknown>;
}

const TYPE_LABELS: Record<string, string> = {
  ARRIVAL_BUT_ABSENT: 'Arrivée mais absent en classe',
  PRESENT_WITHOUT_ARRIVAL: 'Présent sans pointage d’arrivée',
  ABSENT_NO_ARRIVAL: 'Absent sans aucun pointage',
  LATE_ARRIVAL_PRESENT: 'Arrivée tardive déclaré présent',
  EXIT_DURING_SESSION: 'Sortie pendant la séance',
};

const CERTAINTY: Record<string, { label: string; color: 'error' | 'warning' | 'default' }> = {
  elevee: { label: 'Élevée', color: 'error' },
  moyenne: { label: 'Moyenne', color: 'warning' },
  faible: { label: 'Faible', color: 'default' },
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ReconciliationPage() {
  const [rows, setRows] = useState<AlertRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [date, setDate] = useState(todayStr());
  const [classId, setClassId] = useState('');
  const [type, setType] = useState('');
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [meta, setMeta] = useState<{ slotTimesConfigured?: boolean; note?: string; sessionsCompared?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: { id: number; name: string }[] }>('/academics/classes')
      .then((r) => setClasses(r.data))
      .catch(() => setClasses([]));
  }, []);

  const load = useCallback(async () => {
    if (!date) return;
    setError(null);
    try {
      const params = new URLSearchParams({ date, page: String(page + 1), pageSize: String(pageSize) });
      if (classId) params.set('classId', classId);
      if (type) params.set('type', type);
      const res = await api.get<{
        data: AlertRow[];
        pagination: { total: number };
        meta: { slotTimesConfigured?: boolean; note?: string; sessionsCompared?: number };
      }>(`/attendance/reconciliation?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  }, [date, classId, type, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <PageHeader
        title="Rapprochement pointage / appel"
        subtitle="Alertes à examiner — aucune conclusion automatique, aucune modification des données"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {meta?.note && (
        <Alert severity="info" icon={<RuleOutlinedIcon />} sx={{ mb: 2 }}>
          {meta.note}
        </Alert>
      )}

      <Card>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }}>
          <TextField
            size="small"
            type="date"
            label="Date scolaire"
            value={date}
            onChange={(e) => {
              setPage(0);
              setDate(e.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 170 }}
          />
          <TextField
            size="small"
            select
            label="Classe"
            value={classId}
            onChange={(e) => {
              setPage(0);
              setClassId(e.target.value);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Toutes les classes</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            select
            label="Type d'incohérence"
            value={type}
            onChange={(e) => {
              setPage(0);
              setType(e.target.value);
            }}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="">Tous les types</MenuItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Incohérence</TableCell>
                <TableCell>Certitude</TableCell>
                <TableCell>Élève</TableCell>
                <TableCell>Classe</TableCell>
                <TableCell>Séance</TableCell>
                <TableCell>Explication</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows ?? []).map((a, i) => (
                <TableRow key={`${a.type}-${a.studentId}-${a.sessionId}-${i}`}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {TYPE_LABELS[a.type] ?? a.type}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={CERTAINTY[a.certainty]?.label ?? a.certainty} color={CERTAINTY[a.certainty]?.color ?? 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {a.studentName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.matricule}
                    </Typography>
                  </TableCell>
                  <TableCell>{a.className ?? '—'}</TableCell>
                  <TableCell>{a.slot ? `Séance ${a.slot}` : '—'}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{a.reason}</Typography>
                    {Object.keys(a.details).length > 0 && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {Object.entries(a.details)
                          .map(([k, v]) => `${k} : ${String(v)}`)
                          .join(' · ')}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      message={
                        total === 0 && page === 0
                          ? 'Aucune incohérence détectée pour ces critères (ou aucune séance validée à comparer).'
                          : 'Aucun résultat sur cette page.'
                      }
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
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Lignes par page"
        />
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 1.5, display: 'block' }}>
          Le rapprochement est en lecture seule : il ne modifie ni les pointages, ni les appels, et ne génère
          aucune sanction. Une alerte est un signal à vérifier, pas une preuve de faute.
        </Typography>
      </Card>
    </Box>
  );
}
