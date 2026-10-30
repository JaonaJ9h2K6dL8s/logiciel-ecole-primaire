'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Box, Button, Stack, Typography, CircularProgress } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { api } from '@/services/api';

interface PrintData {
  student: {
    matricule: string;
    last_name: string;
    first_names: string;
    birth_date: string | null;
    sex: string | null;
    address: string | null;
    entry_date: string | null;
  };
  school: {
    schoolName?: string;
    address?: string;
    phone?: string;
    documentHeader?: string;
  };
  currentEnrollment: {
    className: string;
    levelName: string;
    schoolYearLabel: string;
  } | null;
  guardians: { fullName: string; relationship: string; phoneMain: string }[];
  printedAt: string;
}

export default function StudentPrintPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<{ data: PrintData }>(`/students/${params.id}/print-data`)
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [params.id]);

  if (error) {
    return <Typography sx={{ p: 4 }}>Impossible de charger la fiche.</Typography>;
  }
  if (!data) {
    return (
      <Stack alignItems="center" sx={{ p: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }

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
          p: '18mm',
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
        <Box sx={{ textAlign: 'center', borderBottom: '2px solid #000', pb: 2, mb: 3 }}>
          {data.school.documentHeader && (
            <Typography variant="caption" sx={{ display: 'block', fontSize: 11 }}>
              {data.school.documentHeader}
            </Typography>
          )}
          <Typography variant="h5" fontWeight={900} sx={{ fontSize: 20 }}>
            {data.school.schoolName ?? 'Établissement Scolaire'}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', fontSize: 11 }}>
            {[data.school.address, data.school.phone].filter(Boolean).join(' — ')}
          </Typography>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mt: 1.5, textTransform: 'uppercase', fontSize: 15 }}>
            Fiche élève
          </Typography>
        </Box>

        {/* Identité */}
        <SectionTitle>Identité de l’élève</SectionTitle>
        <Table>
          <Row label="Matricule" value={data.student.matricule} bold />
          <Row
            label="Nom et prénom(s)"
            value={`${data.student.last_name.toUpperCase()} ${data.student.first_names}`}
            bold
          />
          <Row
            label="Date de naissance"
            value={data.student.birth_date ? new Date(data.student.birth_date).toLocaleDateString('fr-MG') : 'Non renseignée'}
          />
          <Row label="Sexe" value={data.student.sex === 'M' ? 'Masculin' : data.student.sex === 'F' ? 'Féminin' : 'Non renseigné'} />
          <Row label="Adresse" value={data.student.address ?? '—'} />
          <Row
            label="Date d’entrée"
            value={data.student.entry_date ? new Date(data.student.entry_date).toLocaleDateString('fr-MG') : '—'}
          />
        </Table>

        {/* Inscription actuelle */}
        <SectionTitle>Inscription actuelle</SectionTitle>
        {data.currentEnrollment ? (
          <Table>
            <Row label="Classe" value={data.currentEnrollment.className} bold />
            <Row label="Niveau" value={data.currentEnrollment.levelName} />
            <Row label="Année scolaire" value={data.currentEnrollment.schoolYearLabel} />
          </Table>
        ) : (
          <Typography sx={{ fontSize: 12 }}>Aucune inscription active.</Typography>
        )}

        {/* Responsables autorisés */}
        <SectionTitle>Responsables légaux</SectionTitle>
        {data.guardians.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Nom et prénom(s)</Th>
                <Th>Lien</Th>
                <Th>Téléphone</Th>
              </tr>
            </thead>
            <tbody>
              {data.guardians.map((g, i) => (
                <tr key={i}>
                  <Td>{g.fullName}</Td>
                  <Td>{g.relationship}</Td>
                  <Td>{g.phoneMain}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Typography sx={{ fontSize: 12 }}>Aucun responsable autorisé enregistré.</Typography>
        )}

        {/* Pied */}
        <Box sx={{ mt: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <Box>
            <Typography sx={{ fontSize: 11 }}>Fait à ______________________, le {new Date(data.printedAt).toLocaleDateString('fr-MG')}</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: 11, mb: 6 }}>Le Responsable de l’établissement</Typography>
            <Typography sx={{ fontSize: 10, borderTop: '1px solid #000', pt: 1, width: 180 }}>
              Nom et signature
            </Typography>
          </Box>
        </Box>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 12,
        fontWeight: 800,
        textTransform: 'uppercase',
        bgcolor: '#eee',
        px: 1,
        py: 0.5,
        mt: 2.5,
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td style={{ border: '1px solid #000', padding: '5px 8px', width: '38%', color: '#444' }}>{label}</td>
      <td style={{ border: '1px solid #000', padding: '5px 8px', fontWeight: bold ? 700 : 400 }}>{value}</td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'left', background: '#eee', fontSize: 12 }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ border: '1px solid #000', padding: '5px 8px', fontSize: 12 }}>{children}</td>;
}
