import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export const createSessionSchema = z.object({
  classId: z.coerce.number().int().positive('Classe requise.'),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de séance invalide (AAAA-MM-JJ).'),
  slot: z.coerce.number().int().min(1, 'Numéro de séance requis.').max(12, 'Numéro de séance invalide (1-12).'),
});

export const sessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  classId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'submitted']).optional(),
});

export const recordInputSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  status: attendanceStatusSchema,
  // Justification obligatoire pour EXCUSED (absence justifiée), facultative sinon.
  comment: z.string().trim().max(255).optional(),
});

export const putRecordsSchema = z.object({
  records: z.array(recordInputSchema).min(1, 'Aucun statut fourni.').max(200),
});

export const reconciliationQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date requise (AAAA-MM-JJ).'),
  classId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  type: z.enum([
    'ARRIVAL_BUT_ABSENT',
    'PRESENT_WITHOUT_ARRIVAL',
    'ABSENT_NO_ARRIVAL',
    'LATE_ARRIVAL_PRESENT',
    'EXIT_DURING_SESSION',
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const assignmentCreateSchema = z.object({
  teacherId: z.coerce.number().int().positive('Professeur requis.'),
  classId: z.coerce.number().int().positive('Classe requise.'),
  subject: z.string().trim().max(80).optional(),
});
