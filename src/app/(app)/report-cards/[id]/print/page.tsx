'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Box, Button, Stack, Typography, CircularProgress } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { api } from '@/services/api';

interface PrintData {
  school: {
    schoolName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    documentHeader: string | null;
    documentFooter: string | null;
  };
  logo: string | null;
  student: Record<string, string | null>;
  card: {
    status: string;
    revision: number;
    generalAverage: number | null;
    totalCoefficient: number | null;
    subjectsGraded: number;
    subjectsTotal: number;
    generalComment: string | null;
  };
  lines: {
    subject_name: string;
    coefficient: number;
    average: number | null;
    grading_count: number;
    appreciation: string | null;
  }[];
  attendance: { present: number; absent: number; excused: number; late: number; incomplete: number };
  printedAt: string;
}

const STATUS_FR: Record<string, string> = {
  draft: 'Brouillon',
  ready: 'Prêt (non validé)',
  validated: 'Validé',
  locked: 'Verrouillé — document définitif',
  cancelled: 'Annulé',
};

export default function ReportCardPrintPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: PrintData }>(`/report-cards/${params.id}/print-data`)
      .then((r) => setData(r.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de chargement.'));
  }, [params.id]);

  if (error) {
    return <Typography sx={{ p: 4 }}>{error}</Typography>;
  }
  if (!data) {
    return (
      <Stack alignItems="center" sx={{ p: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }

  const missingInfo =
    !data.school.schoolName || (!data.school.address && !data.school.phone)
      ? 'Renseignez les informations de l’établissement dans les paramètres.'
      : null;

  return (
    <>
      <Box className="print-actions" sx={{ position: 'fixed', top: 16, right: 16, zIndex: 10 }}>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Imprimer
        </Button>
      </Box>

      <Box
        sx={{
          maxWidth: '210mm',
          minHeight: '297mm',
          mx: 'auto',
          my: 4,
          p: '15mm',
          bgcolor: '#fff',
          boxShadow: 3,
          color: '#000',
          '@media print': {
            boxShadow: 'none',
            my: 0,
            width: '100%',
            maxWidth: 'none',
          },
        }}
      >
        {/* En-tête établissement */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '2px solid #000', pb: 2, mb: 2.5 }}>
          {data.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logo} alt="Logo" style={{ maxHeight: 70, maxWidth: 90, objectFit: 'contain' }} />
          )}
          <Box sx={{ textAlign: 'center', flexGrow: 1 }}>
            {data.school.documentHeader && (
              <Typography sx={{ fontSize: 11, display: 'block' }}>{data.school.documentHeader}</Typography>
            )}
            <Typography sx={{ fontSize: 20, fontWeight: 900 }}>
              {data.school.schoolName ?? 'Établissement non configuré'}
            </Typography>
            <Typography sx={{ fontSize: 11, display: 'block' }}>
              {[data.school.address, data.school.phone, data.school.email].filter(Boolean).join(' — ') || ''}
            </Typography>
          </Box>
        </Box>

        <Typography sx={{ textAlign: 'center', fontSize: 16, fontWeight: 800, textTransform: 'uppercase', mb: 1.5 }}>
          Bulletin scolaire
        </Typography>

        {missingInfo && (
          <Typography sx={{ fontSize: 10, color: '#a00', mb: 1.5 }}>{missingInfo}</Typography>
        )}

        {/* Identification */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={td(0, '30%')}>Matricule</td>
              <td style={td(0)}>{data.student.matricule}</td>
              <td style={td(0, '25%')}>Classe</td>
              <td style={td(0)}>{`${data.student.className} (${data.student.levelName})`}</td>
            </tr>
            <tr>
              <td style={td(0)}>Nom et prénom(s)</td>
              <td style={td(0)}>{`${String(data.student.last_name).toUpperCase()} ${data.student.first_names}`}</td>
              <td style={td(0)}>Année scolaire</td>
              <td style={td(0)}>{data.student.yearLabel}</td>
            </tr>
            <tr>
              <td style={td(0)}>Période</td>
              <td style={td(0)}>{data.student.periodName}</td>
              <td style={td(0)}>Date d’édition</td>
              <td style={td(0)}>{new Date(data.printedAt).toLocaleDateString('fr-MG')}</td>
            </tr>
          </tbody>
        </table>

        {/* Tableau des matières */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={th('34%')}>Matière</th>
              <th style={th('10%')}>Coef.</th>
              <th style={th('14%')}>Moyenne / 20</th>
              <th style={th('42%')}>Appréciation du professeur</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td style={td(1)}>{l.subject_name}</td>
                <td style={{ ...td(1), textAlign: 'center' }}>{l.coefficient}</td>
                <td style={{ ...td(1), textAlign: 'center', fontWeight: l.average !== null ? 700 : 400 }}>
                  {l.average !== null ? l.average.toFixed(2) : 'Non évaluée'}
                </td>
                <td style={{ ...td(1), fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {l.appreciation ?? ''}
                </td>
              </tr>
            ))}
            {data.lines.length === 0 && (
              <tr>
                <td style={td(1)} colSpan={4}>
                  Aucune matière rattachée à cette classe.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Synthèse */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={td(0, '34%')}>Moyenne générale pondérée</td>
              <td style={{ ...td(0), fontWeight: 800, fontSize: 13 }}>
                {data.card.generalAverage !== null ? `${data.card.generalAverage.toFixed(2)} / 20` : 'Moyenne indisponible'}
              </td>
            </tr>
            <tr>
              <td style={td(0)}>Somme des coefficients pris en compte</td>
              <td style={td(0)}>{data.card.totalCoefficient ?? '—'}</td>
            </tr>
            <tr>
              <td style={td(0)}>Matières prises en compte</td>
              <td style={td(0)}>
                {data.card.subjectsGraded} / {data.card.subjectsTotal}
                {data.card.subjectsGraded < data.card.subjectsTotal
                  ? ' (les matières non évaluées ne comptent pas dans la moyenne)'
                  : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <Typography sx={{ fontSize: 11.5, fontWeight: 800, mt: 0.5, mb: 0.5 }}>Appréciation générale</Typography>
        <Box
          sx={{
            border: '1px solid #000',
            minHeight: 48,
            p: 1,
            fontSize: 11.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            mb: 2,
          }}
        >
          {data.card.generalComment || ''}
        </Box>

        {/* Présences */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={td(0)}>Présences</td>
              <td style={{ ...td(0), textAlign: 'center' }}>{data.attendance.present}</td>
              <td style={td(0)}>Absences non justifiées</td>
              <td style={{ ...td(0), textAlign: 'center' }}>{data.attendance.absent}</td>
              <td style={td(0)}>Absences justifiées</td>
              <td style={{ ...td(0), textAlign: 'center' }}>{data.attendance.excused}</td>
              <td style={td(0)}>Retards</td>
              <td style={{ ...td(0), textAlign: 'center' }}>{data.attendance.late}</td>
            </tr>
          </tbody>
        </table>
        <Typography sx={{ fontSize: 9.5, color: '#444', mb: 3 }}>
          Présences relevées lors des appels en classe (distinctes du pointage d’entrée). État du document :{' '}
          {STATUS_FR[data.card.status] ?? data.card.status} — Révision {data.card.revision}.
        </Typography>

        {/* Signatures */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 11, mb: 8 }}>Le Professeur titulaire</Typography>
            <Typography sx={{ fontSize: 10, borderTop: '1px solid #000', pt: 1, mx: 'auto', width: 190 }}>
              Nom et signature
            </Typography>
          </Box>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 11, mb: 8 }}>Le Responsable de l’établissement</Typography>
            <Typography sx={{ fontSize: 10, borderTop: '1px solid #000', pt: 1, mx: 'auto', width: 190 }}>
              Nom et signature
            </Typography>
          </Box>
        </Box>

        {data.school.documentFooter && (
          <Typography sx={{ fontSize: 9.5, textAlign: 'center', mt: 2, color: '#444' }}>
            {data.school.documentFooter}
          </Typography>
        )}
      </Box>

      <style jsx global>{`
        @media print {
          .print-actions,
          nav,
          aside,
          header {
            display: none !important;
          }
          body {
            background: #fff !important;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}

function td(border: 0 | 1, width?: string): React.CSSProperties {
  return {
    border: border ? '1px solid #000' : '1px solid #000',
    padding: '4px 8px',
    width,
    verticalAlign: 'top',
  };
}

function th(width: string): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '5px 8px',
    background: '#eee',
    textAlign: 'left',
    width,
    fontSize: 11.5,
  };
}
