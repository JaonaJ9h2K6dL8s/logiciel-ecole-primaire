import { z } from 'zod';

// ---------- Matières ----------
export const subjectCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Code requis (2 caractères minimum).')
    .max(20, 'Code trop long (20 maximum).')
    .regex(/^[A-Za-z0-9_-]+$/, 'Code : lettres, chiffres, tirets uniquement.'),
  name: z.string().trim().min(2, 'Nom requis (2 caractères minimum).').max(120),
  description: z.string().trim().max(255).optional().or(z.literal('')),
  defaultCoefficient: z.coerce.number().positive('Coefficient invalide (positif requis).').max(99.99).optional(),
});

export const subjectUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(255).optional().or(z.literal('')),
  defaultCoefficient: z.coerce.number().positive().max(99.99).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ---------- Affectation matière / classe ----------
export const classSubjectCreateSchema = z.object({
  classId: z.coerce.number().int().positive('Classe requise.'),
  subjectId: z.coerce.number().int().positive('Matière requise.'),
  teacherId: z.coerce.number().int().positive().optional().nullable(),
  coefficient: z.coerce.number().positive('Coefficient invalide (positif requis).').max(99.99).optional().nullable(),
});

export const classSubjectUpdateSchema = z.object({
  teacherId: z.coerce.number().int().positive().optional().nullable(),
  coefficient: z.coerce.number().positive().max(99.99).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ---------- Périodes d'évaluation ----------
export const periodCreateSchema = z
  .object({
    schoolYearId: z.coerce.number().int().positive('Année scolaire requise.'),
    name: z.string().trim().min(2, 'Nom de la période requis.').max(80),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début invalide (AAAA-MM-JJ).'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de fin invalide (AAAA-MM-JJ).'),
    displayOrder: z.coerce.number().int().positive('Ordre d’affichage requis (entier positif).').max(99),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'La fin de la période doit être postérieure ou égale à son début.',
    path: ['endDate'],
  });

export const periodUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    displayOrder: z.coerce.number().int().positive().max(99).optional(),
  })
  .refine((v) => !(v.startDate && v.endDate) || v.endDate >= v.startDate, {
    message: 'La fin de la période doit être postérieure ou égale à son début.',
    path: ['endDate'],
  });

// ---------- Évaluations ----------
// Types : 'exam' (examen), 'composition' et 'ds' (devoir surveillé) sont les
// types d'épreuves organisées en classe (étape 12) ; les valeurs historiques
// restent acceptées. startTime/durationMinutes : créneau facultatif (028).
export const ASSESSMENT_TYPES = ['homework', 'quiz', 'exam', 'other', 'composition', 'ds'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

/** Créneau : HH:MM (00:00–23:59). */
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const assessmentCreateSchema = z.object({
  classId: z.coerce.number().int().positive('Classe requise.'),
  subjectId: z.coerce.number().int().positive('Matière requise.'),
  gradingPeriodId: z.coerce.number().int().positive('Période requise.'),
  title: z.string().trim().min(2, 'Titre requis (2 caractères minimum).').max(150),
  assessmentType: z.enum(ASSESSMENT_TYPES).default('homework'),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).'),
  startTime: z.string().regex(timeRegex, 'Heure invalide (HH:MM).').optional().nullable(),
  durationMinutes: z.coerce.number().int().positive('Durée invalide (entier positif requis).').max(480, 'Durée maximale : 480 minutes.').optional().nullable(),
  maxScore: z.coerce.number().positive('Barème invalide (positif requis).').max(999.99),
  coefficient: z.coerce.number().positive('Coefficient invalide (positif requis).').max(99.99).default(1),
  description: z.string().trim().max(255).optional().or(z.literal('')),
}).refine((v) => !(v.startTime && !v.durationMinutes) && !(v.durationMinutes && !v.startTime), {
  message: 'Le créneau nécessite l’heure de début ET la durée (ou aucun des deux).',
});

export const assessmentUpdateSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  assessmentType: z.enum(ASSESSMENT_TYPES).optional(),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(timeRegex, 'Heure invalide (HH:MM).').optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().max(480, 'Durée maximale : 480 minutes.').optional().nullable(),
  maxScore: z.coerce.number().positive().max(999.99).optional(),
  coefficient: z.coerce.number().positive().max(99.99).optional(),
  description: z.string().trim().max(255).optional().or(z.literal('')),
});

// ---------- Notes ----------
export const gradeEntrySchema = z.object({
  studentId: z.coerce.number().int().positive('Élève requis.'),
  gradeStatus: z.enum(['graded', 'not_graded', 'absent', 'absent_justified', 'excused']).default('not_graded'),
  // Note numérique uniquement pour 'graded' ; null pour les autres statuts
  // (jamais de zéro fabriqué, jamais de confusion entre zéro saisi et vide).
  score: z.coerce.number().finite('Note invalide.').min(0, 'Note négative refusée.').nullable().optional(),
  comment: z.string().trim().max(255).optional().or(z.literal('')),
});

export const gradesSaveSchema = z.object({
  grades: z.array(gradeEntrySchema).min(1, 'Aucune note fournie.').max(200, 'Trop de lignes (200 maximum).'),
});

export const gradeCorrectionSchema = z.object({
  studentId: z.coerce.number().int().positive('Élève requis.'),
  gradeStatus: z.enum(['graded', 'absent', 'absent_justified', 'excused']),
  score: z.coerce.number().finite().min(0).nullable().optional(),
  reason: z.string().trim().min(5, 'Motif de correction obligatoire (5 caractères minimum).').max(255),
});

export const assessmentsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  schoolYearId: z.coerce.number().int().positive().optional(),
  gradingPeriodId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'submitted', 'locked']).optional(),
  assessmentType: z.enum(ASSESSMENT_TYPES).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const averagesQuerySchema = z.object({
  classId: z.coerce.number().int().positive('Classe requise.'),
  subjectId: z.coerce.number().int().positive('Matière requise.'),
  gradingPeriodId: z.coerce.number().int().positive('Période requise.'),
  studentId: z.coerce.number().int().positive().optional(),
});
