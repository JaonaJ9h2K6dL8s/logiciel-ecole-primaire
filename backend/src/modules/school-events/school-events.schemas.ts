import { z } from 'zod';

export const EVENT_AUDIENCES = ['all_students', 'selected_classes', 'parents', 'staff'] as const;
export const EVENT_STATUSES = ['draft', 'planned', 'completed', 'cancelled', 'archived'] as const;

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Date invalide.' })
  .transform((v) => new Date(v));

export const eventListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(EVENT_STATUSES).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    classId: z.coerce.number().int().positive().optional(),
    organizerId: z.coerce.number().int().positive().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    categoryId: z.coerce.number().int().positive(),
    description: z.string().trim().max(5000).nullable().optional(),
    startAt: isoDateTime,
    endAt: isoDateTime,
    location: z.string().trim().max(150).nullable().optional(),
    schoolYearId: z.coerce.number().int().positive(),
    audience: z.enum(EVENT_AUDIENCES).default('selected_classes'),
    classIds: z.array(z.coerce.number().int().positive()).max(50).default([]),
    organizerId: z.coerce.number().int().positive().nullable().optional(),
    logistics: z.string().trim().max(5000).nullable().optional(),
    budgetEstimated: z.coerce.number().min(0).max(999999999).nullable().optional(),
    status: z.enum(EVENT_STATUSES).default('draft'),
  })
  .strict()
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), {
    message: 'La fin doit être postérieure au début.',
    path: ['endAt'],
  })
  .refine((v) => v.audience !== 'selected_classes' || v.classIds.length > 0, {
    message: 'Au moins une classe est requise quand le public est limité aux classes sélectionnées.',
    path: ['classIds'],
  });

export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(150).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    startAt: isoDateTime.optional(),
    endAt: isoDateTime.optional(),
    location: z.string().trim().max(150).nullable().optional(),
    schoolYearId: z.coerce.number().int().positive().optional(),
    audience: z.enum(EVENT_AUDIENCES).optional(),
    classIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
    organizerId: z.coerce.number().int().positive().nullable().optional(),
    logistics: z.string().trim().max(5000).nullable().optional(),
    budgetEstimated: z.coerce.number().min(0).max(999999999).nullable().optional(),
    summary: z.string().trim().max(5000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie.' });

export const eventStatusSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const participantsSetSchema = z
  .object({
    students: z
      .array(
        z
          .object({
            studentId: z.coerce.number().int().positive(),
            confirmed: z.boolean().default(false),
          })
          .strict()
      )
      .max(2000),
  })
  .strict();

export const attendanceSetSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            studentId: z.coerce.number().int().positive(),
            attended: z.enum(['unknown', 'present', 'absent']),
            notes: z.string().trim().max(255).nullable().optional(),
          })
          .strict()
      )
      .min(1)
      .max(2000),
  })
  .strict();

export const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    color: z.string().trim().max(20).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    color: z.string().trim().max(20).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie.' });
