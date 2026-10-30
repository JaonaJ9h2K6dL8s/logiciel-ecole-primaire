import { z } from 'zod';

export const DIAGNOSTIC_QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'open',
] as const;

export const DIAGNOSTIC_LEVELS = ['debutant', 'intermediaire', 'avance'] as const;

const hhmmssDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).');

const questionSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    competencyCode: z.string().trim().min(1).max(30).nullable().optional(),
    displayOrder: z.coerce.number().int().min(1).max(999).default(1),
    questionType: z.enum(DIAGNOSTIC_QUESTION_TYPES),
    statement: z.string().trim().min(3, 'Énoncé requis (3 caractères minimum).').max(5000),
    points: z.coerce.number().min(0).max(100),
    options: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
    expected: z.unknown().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.questionType === 'single_choice' || q.questionType === 'multiple_choice') {
      if (!q.options || q.options.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'Au moins deux options sont requises.' });
      }
      const idx = q.expected;
      if (q.questionType === 'single_choice') {
        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || (q.options ? idx >= q.options.length : true)) {
          ctx.addIssue({ code: 'custom', message: 'Indice de bonne réponse invalide.' });
        }
      } else if (!Array.isArray(idx) || idx.length === 0 || !idx.every((i) => typeof i === 'number' && Number.isInteger(i) && q.options && i >= 0 && i < q.options.length)) {
        ctx.addIssue({ code: 'custom', message: 'Indices des bonnes réponses invalides.' });
      }
    }
    if (q.questionType === 'true_false' && typeof q.expected !== 'boolean') {
      ctx.addIssue({ code: 'custom', message: 'Réponse attendue vrai/faux requise.' });
    }
    if (q.questionType === 'short_answer') {
      const v = q.expected;
      const variants = Array.isArray(v) ? v : v !== undefined && v !== null ? [v] : [];
      if (variants.length === 0 || !variants.every((x) => typeof x === 'string' && x.trim().length > 0)) {
        ctx.addIssue({ code: 'custom', message: 'Au moins une réponse acceptée est requise.' });
      }
    }
  });

const diagnosticBaseSchema = z.object({
  title: z.string().trim().min(3, 'Titre requis (3 caractères minimum).').max(200),
  description: z.string().trim().max(5000).optional(),
  schoolYearId: z.coerce.number().int().positive(),
  levelId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  durationMinutes: z.coerce.number().int().min(1).max(480).nullable().optional(),
  opensAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'Format attendu AAAA-MM-JJ HH:MM').nullable().optional(),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'Format attendu AAAA-MM-JJ HH:MM').nullable().optional(),
  thresholdIntermediateMin: z.coerce.number().int().min(0).max(100).default(40),
  thresholdAdvancedMin: z.coerce.number().int().min(0).max(100).default(70),
  minAnsweredPct: z.coerce.number().int().min(0).max(100).default(50),
  competencies: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(30),
        name: z.string().trim().min(2).max(200),
      })
    )
    .min(1, 'Au moins une compétence est requise.')
    .max(30),
  questions: z.array(questionSchema).min(1, 'Au moins une question est requise.').max(100),
});

export const diagnosticCreateSchema = diagnosticBaseSchema.superRefine((d, ctx) => {
  if (d.thresholdAdvancedMin < d.thresholdIntermediateMin) {
    ctx.addIssue({ code: 'custom', message: 'Le seuil « avancé » doit être supérieur ou égal au seuil « intermédiaire ».', path: ['thresholdAdvancedMin'] });
  }
  if (d.opensAt && d.closesAt && d.closesAt < d.opensAt) {
    ctx.addIssue({ code: 'custom', message: 'La date de fermeture doit suivre la date d’ouverture.', path: ['closesAt'] });
  }
  const codes = new Set(d.competencies.map((c) => c.code));
  for (const q of d.questions) {
    if (q.competencyCode && !codes.has(q.competencyCode)) {
      ctx.addIssue({ code: 'custom', message: `Compétence inconnue : ${q.competencyCode}.`, path: ['questions'] });
      break;
    }
  }
});

export const diagnosticUpdateSchema = diagnosticBaseSchema
  .partial()
  .extend({
    status: z.enum(['draft', 'published', 'closed', 'archived']).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.thresholdAdvancedMin !== undefined && d.thresholdIntermediateMin !== undefined && d.thresholdAdvancedMin < d.thresholdIntermediateMin) {
      ctx.addIssue({ code: 'custom', message: 'Le seuil « avancé » doit être supérieur ou égal au seuil « intermédiaire ».', path: ['thresholdAdvancedMin'] });
    }
    if (d.opensAt && d.closesAt && d.closesAt < d.opensAt) {
      ctx.addIssue({ code: 'custom', message: 'La date de fermeture doit suivre la date d’ouverture.', path: ['closesAt'] });
    }
    if (d.competencies && d.questions) {
      const codes = new Set(d.competencies.map((c) => c.code));
      for (const q of d.questions) {
        if (q.competencyCode && !codes.has(q.competencyCode)) {
          ctx.addIssue({ code: 'custom', message: `Compétence inconnue : ${q.competencyCode}.`, path: ['questions'] });
          break;
        }
      }
    }
  });

export const diagnosticsListQuerySchema = z.object({
  schoolYearId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'published', 'closed', 'archived']).optional(),
});

export const attemptStartSchema = z.object({
  studentId: z.coerce.number().int().positive('Élève requis.'),
});

export const answersSaveSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number().int().positive(),
        value: z.unknown().nullable().optional(),
      })
    )
    .max(200),
});

export const gradeOpenSchema = z.object({
  grades: z
    .array(
      z.object({
        answerId: z.coerce.number().int().positive(),
        pointsEarned: z.coerce.number().min(0),
        isCorrect: z.boolean(),
      })
    )
    .min(1),
});

export const resultsQuerySchema = z.object({
  date: hhmmssDate.optional(),
});
