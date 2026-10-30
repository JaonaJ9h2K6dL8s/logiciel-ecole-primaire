import { z } from 'zod';

export const listQuerySchema = z.object({
  schoolYearId: z.coerce.number().int().positive(),
  gradingPeriodId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
});

export const generateSchema = z.object({
  classId: z.coerce.number().int().positive(),
  gradingPeriodId: z.coerce.number().int().positive(),
  studentId: z.coerce.number().int().positive().optional(),
});

export const generalCommentSchema = z.object({
  comment: z.string().trim().max(1000, '1000 caractères maximum.'),
});

export const subjectAppreciationSchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  comment: z.string().trim().max(500, '500 caractères maximum.'),
});

export const correctionSchema = z.object({
  reason: z.string().trim().min(5, 'Motif de correction obligatoire (5 caractères minimum).').max(500),
});

export const annualResultsQuerySchema = z.object({
  schoolYearId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  studentId: z.coerce.number().int().positive().optional(),
});

export const annualDecisionSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  schoolYearId: z.coerce.number().int().positive(),
  decision: z.enum(['promoted', 'repeats', 'other']).nullable(),
  otherLabel: z.string().trim().max(100).optional(),
  comment: z.string().trim().max(500).optional(),
});
