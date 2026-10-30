'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { api, ApiError } from '@/services/api';
import PageHeader from '@/components/admin/PageHeader';

const phoneRegex = /^[+0-9][0-9 ()\.\-]{6,25}$/;

interface GuardianForm {
  lastName: string;
  firstNames: string;
  relationship: string;
  phoneMain: string;
  phoneSecondary: string;
  email: string;
  address: string;
  isPrimaryContact: boolean;
  isLegalGuardian: boolean;
}

const EMPTY_GUARDIAN: GuardianForm = {
  lastName: '',
  firstNames: '',
  relationship: 'father',
  phoneMain: '',
  phoneSecondary: '',
  email: '',
  address: '',
  isPrimaryContact: true,
  isLegalGuardian: true,
};

const STEPS = ['Informations personnelles', 'Coordonnées', 'Responsable(s) légal(aux)', 'Inscription scolaire', 'Vérification'];

export default function NewStudentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    lastName: '',
    firstNames: '',
    birthDate: '',
    sex: '',
    address: '',
    entryDate: new Date().toISOString().slice(0, 10),
  });
  const [guardian, setGuardian] = useState<GuardianForm>(EMPTY_GUARDIAN);
  const [enrollment, setEnrollment] = useState({ classId: '', enrollmentDate: new Date().toISOString().slice(0, 10) });
  const [classes, setClasses] = useState<{ id: number; name: string; levelName: string; yearLabel: string; capacity: number | null }[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdMatricule, setCreatedMatricule] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: { id: number; name: string; levelName: string; schoolYearLabel: string; capacity: number | null; isActive: boolean }[] }>('/academics/classes')
      .then((r) => setClasses(r.data.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name, levelName: c.levelName, yearLabel: c.schoolYearLabel, capacity: c.capacity }))))
      .catch(() => undefined);
  }, []);

  const validateStep = (s: number): boolean => {
    const errors: Record<string, string> = {};
    if (s === 0) {
      if (!form.lastName.trim()) errors.lastName = 'Le nom est obligatoire.';
      if (!form.firstNames.trim()) errors.firstNames = 'Le(s) prénom(s) est/sont obligatoire(s).';
      if (form.birthDate) {
        const d = new Date(form.birthDate);
        if (Number.isNaN(d.getTime()) || d > new Date()) errors.birthDate = 'Date de naissance invalide.';
      }
    }
    if (s === 2) {
      // Responsable optionnel à la création, mais validé s'il est entamé
      const started = guardian.lastName.trim() || guardian.firstNames.trim() || guardian.phoneMain.trim();
      if (started) {
        if (!guardian.lastName.trim()) errors['g.lastName'] = 'Nom du responsable obligatoire.';
        if (!guardian.firstNames.trim()) errors['g.firstNames'] = 'Prénom(s) obligatoire(s).';
        if (!phoneRegex.test(guardian.phoneMain.trim())) errors['g.phoneMain'] = 'Téléphone invalide (ex. 034 00 000 00).';
      }
    }
    if (s === 3 && enrollment.classId) {
      // la date est facultative côté UI (défaut : aujourd'hui)
      if (!enrollment.enrollmentDate) errors.enrollmentDate = 'Date d’inscription requise.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    for (let s = 0; s <= 3; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const guardianStarted = guardian.lastName.trim() && guardian.firstNames.trim() && guardian.phoneMain.trim();
      const payload: Record<string, unknown> = {
        student: {
          lastName: form.lastName.trim(),
          firstNames: form.firstNames.trim(),
          birthDate: form.birthDate || null,
          sex: form.sex || null,
          address: form.address.trim() || null,
          entryDate: form.entryDate || null,
        },
      };
      if (guardianStarted) {
        payload.guardians = [
          {
            fields: {
              lastName: guardian.lastName.trim(),
              firstNames: guardian.firstNames.trim(),
              relationship: guardian.relationship,
              phoneMain: guardian.phoneMain.trim(),
              phoneSecondary: guardian.phoneSecondary.trim() || null,
              email: guardian.email.trim() || null,
              address: guardian.address.trim() || null,
            },
            link: {
              isPrimaryContact: true,
              isLegalGuardian: guardian.isLegalGuardian,
            },
          },
        ];
      }
      if (enrollment.classId) {
        payload.enrollment = {
          classId: Number(enrollment.classId),
          enrollmentDate: enrollment.enrollmentDate,
        };
      }
      const res = await api.post<{ matricule: string; studentId: number }>('/students', payload);
      setCreatedMatricule(res.matricule);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) fe[k] = v[0];
        setFieldErrors(fe);
        setError('Veuillez corriger les champs signalés.');
        setStep(0);
      } else {
        setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (createdMatricule) {
    return (
      <Box>
        <PageHeader title="Élève créé" />
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              Dossier élève créé avec succès
            </Typography>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              Matricule attribué :
            </Typography>
            <Typography variant="h4" fontFamily="monospace" fontWeight={900} color="primary.main" gutterBottom>
              {createdMatricule}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Ce matricule est unique et restera attaché à l’élève durant toute sa scolarité.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button
                variant="contained"
                onClick={() => {
                  setCreatedMatricule(null);
                  setForm({ lastName: '', firstNames: '', birthDate: '', sex: '', address: '', entryDate: new Date().toISOString().slice(0, 10) });
                  setGuardian(EMPTY_GUARDIAN);
                  setEnrollment({ classId: '', enrollmentDate: new Date().toISOString().slice(0, 10) });
                  setStep(0);
                }}
              >
                Créer un autre élève
              </Button>
              <Button variant="outlined" onClick={() => router.push('/students')}>
                Retour à la liste
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const selectedClass = classes.find((c) => String(c.id) === enrollment.classId);

  return (
    <Box maxWidth={900}>
      <PageHeader title="Nouvel élève" subtitle="Création d’un dossier complet : identité, responsable légal et inscription" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>
                  <Typography variant="caption">{label}</Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          <Divider sx={{ mb: 3 }} />

          {step === 0 && (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>1. Informations personnelles</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Nom" required fullWidth value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    error={Boolean(fieldErrors.lastName)} helperText={fieldErrors.lastName}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Prénom(s)" required fullWidth value={form.firstNames}
                    onChange={(e) => setForm({ ...form, firstNames: e.target.value })}
                    error={Boolean(fieldErrors.firstNames)} helperText={fieldErrors.firstNames}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Date de naissance" type="date" fullWidth value={form.birthDate}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                    error={Boolean(fieldErrors.birthDate)} helperText={fieldErrors.birthDate ?? 'Facultative si non disponible'}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    select label="Sexe" fullWidth value={form.sex}
                    onChange={(e) => setForm({ ...form, sex: e.target.value })}
                    helperText="Facultatif"
                  >
                    <MenuItem value="">Non renseigné</MenuItem>
                    <MenuItem value="M">Masculin</MenuItem>
                    <MenuItem value="F">Féminin</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Date d’entrée" type="date" fullWidth value={form.entryDate}
                    onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Adresse (facultative)" fullWidth value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Stack>
          )}

          {step === 1 && (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>2. Coordonnées de l’élève</Typography>
              <Alert severity="info" variant="outlined">
                Les coordonnées de contact sont celles du responsable légal (étape suivante). Cette section
                concerne uniquement l’adresse du domicile de l’élève, déjà saisie à l’étape 1.
              </Alert>
              <TextField
                label="Adresse du domicile" fullWidth value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                multiline rows={2}
              />
            </Stack>
          )}

          {step === 2 && (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>3. Responsable légal principal</Typography>
              <Alert severity="info" variant="outlined">
                Facultatif à la création : vous pourrez ajouter ou corriger les responsables depuis la fiche
                de l’élève. Aucune adresse électronique n’est exigée.
              </Alert>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Nom" fullWidth value={guardian.lastName}
                    onChange={(e) => setGuardian({ ...guardian, lastName: e.target.value })}
                    error={Boolean(fieldErrors['g.lastName'])} helperText={fieldErrors['g.lastName']}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Prénom(s)" fullWidth value={guardian.firstNames}
                    onChange={(e) => setGuardian({ ...guardian, firstNames: e.target.value })}
                    error={Boolean(fieldErrors['g.firstNames'])} helperText={fieldErrors['g.firstNames']}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    select label="Lien avec l’enfant" fullWidth value={guardian.relationship}
                    onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })}
                  >
                    <MenuItem value="father">Père</MenuItem>
                    <MenuItem value="mother">Mère</MenuItem>
                    <MenuItem value="legal_guardian">Tuteur légal</MenuItem>
                    <MenuItem value="other">Autre</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Téléphone principal" required fullWidth value={guardian.phoneMain}
                    placeholder="034 00 000 00"
                    onChange={(e) => setGuardian({ ...guardian, phoneMain: e.target.value })}
                    error={Boolean(fieldErrors['g.phoneMain'])} helperText={fieldErrors['g.phoneMain']}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Téléphone secondaire (facultatif)" fullWidth value={guardian.phoneSecondary}
                    onChange={(e) => setGuardian({ ...guardian, phoneSecondary: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Adresse (facultative)" fullWidth value={guardian.address}
                    onChange={(e) => setGuardian({ ...guardian, address: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Stack>
          )}

          {step === 3 && (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>4. Inscription scolaire</Typography>
              <Alert severity="info" variant="outlined">
                Seules les classes actives de l’année scolaire active sont proposées. L’inscription peut
                aussi être faite plus tard depuis la fiche de l’élève.
              </Alert>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 7 }}>
                  <TextField
                    select label="Classe" fullWidth value={enrollment.classId}
                    onChange={(e) => setEnrollment({ ...enrollment, classId: e.target.value })}
                    helperText={
                      selectedClass
                        ? `${selectedClass.levelName} — ${selectedClass.yearLabel}` +
                          (selectedClass.capacity ? ` (capacité : ${selectedClass.capacity})` : '')
                        : 'Facultative à la création'
                    }
                  >
                    <MenuItem value="">Ne pas inscrire maintenant</MenuItem>
                    {classes.map((c) => (
                      <MenuItem key={c.id} value={String(c.id)}>
                        {c.name} — {c.levelName} ({c.yearLabel})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 5 }}>
                  <TextField
                    label="Date d’inscription" type="date" fullWidth value={enrollment.enrollmentDate}
                    onChange={(e) => setEnrollment({ ...enrollment, enrollmentDate: e.target.value })}
                    disabled={!enrollment.classId}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </Stack>
          )}

          {step === 4 && (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>5. Vérification et confirmation</Typography>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2">
                    <strong>Élève :</strong> {form.lastName.toUpperCase()} {form.firstNames}
                    {form.birthDate ? ` — né(e) le ${new Date(form.birthDate).toLocaleDateString('fr-MG')}` : ''}
                    {form.sex ? ` — ${form.sex === 'M' ? 'Masculin' : 'Féminin'}` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <strong>Responsable :</strong>{' '}
                    {guardian.lastName.trim()
                      ? `${guardian.lastName} ${guardian.firstNames} (${guardian.relationship === 'father' ? 'Père' : guardian.relationship === 'mother' ? 'Mère' : guardian.relationship === 'legal_guardian' ? 'Tuteur légal' : 'Autre'}) — ${guardian.phoneMain}`
                      : 'Non renseigné à la création'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <strong>Inscription :</strong>{' '}
                    {selectedClass
                      ? `${selectedClass.name} (${selectedClass.levelName} — ${selectedClass.yearLabel}) le ${new Date(enrollment.enrollmentDate).toLocaleDateString('fr-MG')}`
                      : 'Aucune inscription à la création'}
                  </Typography>
                  <Chip size="small" label="Le matricule sera attribué automatiquement" sx={{ mt: 2 }} />
                </CardContent>
              </Card>
            </Stack>
          )}

          <Divider sx={{ my: 3 }} />

          <Stack direction="row" justifyContent="space-between">
            <Button startIcon={<ArrowBackIcon />} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Retour
            </Button>
            <Stack direction="row" spacing={2}>
              <Button variant="text" onClick={() => router.push('/students')}>
                Annuler
              </Button>
              {step < STEPS.length - 1 ? (
                <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={handleNext}>
                  Continuer
                </Button>
              ) : (
                <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={handleSubmit} disabled={saving}>
                  Confirmer la création
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
