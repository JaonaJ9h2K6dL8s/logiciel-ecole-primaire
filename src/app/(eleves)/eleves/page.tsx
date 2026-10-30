'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, CircularProgress, Paper } from '@mui/material';
import { studentZoneApi, type StudentIdentity } from '@/services/studentZone';
import { useStudentZoneStore } from '@/stores/studentZoneStore';

/**
 * Accès à la Zone Élèves : étape 1 = choix de la classe, étape 2 = choix du nom.
 * Grosses cibles tactiles, fond pastel, adapté au primaire.
 */
export default function ElevesAccessPage() {
  const router = useRouter();
  const { student, setStudent } = useStudentZoneStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: number; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentZoneApi
      .getClasses()
      .then((r) => setClasses(r.classes))
      .catch(() => setError('Impossible de charger les classes.'))
      .finally(() => setLoading(false));
  }, []);

  const chooseClass = async (classId: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await studentZoneApi.getStudents(classId);
      setStudents(r.students);
      setStep(2);
    } catch {
      setError('Impossible de charger les élèves.');
    } finally {
      setLoading(false);
    }
  };

  const chooseStudent = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const identity: StudentIdentity = await studentZoneApi.login(id);
      setStudent(identity);
      router.push('/eleves');
    } catch {
      setError('Connexion impossible. Réessaie.');
    } finally {
      setLoading(false);
    }
  };

  if (student) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          p: 3,
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#E23B3B', textAlign: 'center' }}>
          Bonjour {student.fullName} !
        </Typography>
        <Typography variant="h5" sx={{ color: '#3A3A3A' }}>
          Classe : {student.className ?? '—'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', mt: 2 }}>
          <BigTile color="#3BA7E0" label="Lire des livres" onClick={() => router.push('/eleves/lire')} />
          <BigTile color="#57B87B" label="Colorier" onClick={() => router.push('/eleves/colorier')} />
          <BigTile color="#F2B84B" label="Mes dessins" onClick={() => router.push('/eleves/mes-dessins')} />
          <BigTile color="#8B6FD0" label="Discuter" onClick={() => router.push('/eleves/discuter')} />
        </Box>
        <Button
          size="large"
          sx={{ mt: 4, borderRadius: 999, textTransform: 'none', fontSize: 18 }}
          onClick={async () => {
            try {
              await studentZoneApi.logout();
            } catch {
              // ignore
            }
            setStudent(null);
          }}
        >
          Ce n&apos;est pas moi — changer d&apos;élève
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 6,
        px: 2,
      }}
    >
      <Typography variant="h2" sx={{ fontWeight: 800, color: '#E23B3B', mb: 1, textAlign: 'center', fontSize: { xs: '2.6rem', md: '3.75rem' } }}>
        Zone Élèves
      </Typography>
      <Typography variant="h5" sx={{ color: '#3A3A3A', mb: 5 }}>
        {step === 1 ? 'Choisis ta classe' : 'Qui es-tu ?'}
      </Typography>

      {loading && <CircularProgress size={56} sx={{ color: '#3BA7E0' }} />}
      {error && (
        <Paper sx={{ p: 2, bgcolor: '#FFE4E4', color: '#B03A3A', fontWeight: 600 }}>{error}</Paper>
      )}

      {!loading && step === 1 && (
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
          {classes.map((c) => (
            <BigTile key={c.id} color="#3BA7E0" label={c.name} onClick={() => chooseClass(c.id)} />
          ))}
          {classes.length === 0 && !error && (
            <Typography>Aucune classe disponible pour le moment.</Typography>
          )}
        </Box>
      )}

      {!loading && step === 2 && (
        <>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 900 }}>
            {students.map((s) => (
              <BigTile key={s.id} color="#57B87B" label={s.fullName} onClick={() => chooseStudent(s.id)} />
            ))}
            {students.length === 0 && <Typography>Aucun élève dans cette classe.</Typography>}
          </Box>
          <Button
            size="large"
            sx={{ mt: 5, borderRadius: 999, textTransform: 'none', fontSize: 18 }}
            onClick={() => setStep(1)}
          >
            ← Retour aux classes
          </Button>
        </>
      )}
    </Box>
  );
}

function BigTile({ color, label, onClick }: { color: string; label: string; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      sx={{
        width: { xs: '100%', sm: 'auto' },
        minWidth: { xs: 0, sm: 220 },
        maxWidth: { xs: 420, sm: 'none' },
        minHeight: { xs: 96, sm: 140 },
        borderRadius: '32px',
        bgcolor: color,
        color: '#fff',
        fontSize: 26,
        fontWeight: 800,
        textTransform: 'none',
        boxShadow: '0 6px 0 rgba(0,0,0,0.15)',
        px: 4,
        '&:hover': { bgcolor: color, filter: 'brightness(1.08)', transform: 'translateY(-2px)' },
      }}
    >
      {label}
    </Button>
  );
}
