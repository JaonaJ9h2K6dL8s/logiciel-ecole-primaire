import { z } from 'zod';

export const CONTACT_DIRECTIONS = ['school_to_parent', 'parent_to_school', 'joint'] as const;
export const CONTACT_CHANNELS = ['call', 'visit', 'meeting', 'sms', 'whatsapp', 'other'] as const;
export const CONTACT_SUBJECTS = [
  'absence',
  'tardiness',
  'grades',
  'behavior',
  'discipline',
  'administrative',
  'meeting',
  'other',
] as const;
export const CONTACT_STATUSES = ['todo', 'ongoing', 'resolved', 'cancelled'] as const;

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Date invalide.' })
  .transform((v) => new Date(v));

const isoDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date invalide (AAAA-MM-JJ attendu).' });

export const contactListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    studentId: z.coerce.number().int().positive().optional(),
    guardianId: z.coerce.number().int().positive().optional(),
    subject: z.enum(CONTACT_SUBJECTS).optional(),
    channel: z.enum(CONTACT_CHANNELS).optional(),
    status: z.enum(CONTACT_STATUSES).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict();

export const contactCreateSchema = z
  .object({
    studentId: z.coerce.number().int().positive(),
    guardianId: z.coerce.number().int().positive(),
    occurredAt: isoDateTime,
    direction: z.enum(CONTACT_DIRECTIONS),
    channel: z.enum(CONTACT_CHANNELS),
    subject: z.enum(CONTACT_SUBJECTS),
    summary: z.string().trim().max(5000).nullable().optional(),
    actionDecided: z.string().trim().max(500).nullable().optional(),
    followupDueDate: isoDate.nullable().optional(),
    followupStatus: z.enum(CONTACT_STATUSES).default('todo'),
  })
  .strict();

export const contactUpdateSchema = z
  .object({
    occurredAt: isoDateTime.optional(),
    direction: z.enum(CONTACT_DIRECTIONS).optional(),
    channel: z.enum(CONTACT_CHANNELS).optional(),
    subject: z.enum(CONTACT_SUBJECTS).optional(),
    summary: z.string().trim().max(5000).nullable().optional(),
    actionDecided: z.string().trim().max(500).nullable().optional(),
    followupDueDate: isoDate.nullable().optional(),
    followupStatus: z.enum(CONTACT_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie.' });

export const followupsQuerySchema = z
  .object({
    bucket: z.enum(['overdue', 'today', 'upcoming', 'resolved']).default('overdue'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
