import { z } from 'zod';

export const punchEventTypeSchema = z.enum(['ARRIVAL', 'EXIT']);

export const createPunchSchema = z.object({
  studentId: z.coerce.number().int().positive('Élève requis.'),
  eventType: punchEventTypeSchema,
  // Clé d'idempotence produite par le client (double clic / retry réseau).
  // Une clé déjà utilisée renvoie l'événement d'origine au lieu d'un doublon.
  idempotencyKey: z.string().trim().min(8, 'Clé d’idempotence trop courte.').max(64),
  correlationId: z.string().trim().max(64).optional(),
  deviceLabel: z.string().trim().max(80).optional(),
});

export type CreatePunchInput = z.infer<typeof createPunchSchema>;

export const punchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  studentId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  eventType: punchEventTypeSchema.optional(),
  status: z.enum(['valid', 'corrected']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const correctionSchema = z
  .object({
    eventType: punchEventTypeSchema.optional(),
    // Heure officielle attestée par l'agent lors de la correction (jamais l'horloge
    // du navigateur pour les pointages normaux : ici, l'heure corrigée est une
    // donnée administrative motivée et auditée, refusée si dans le futur).
    occurredAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().trim().min(5, 'Motif de correction obligatoire (5 caractères minimum).').max(255),
  })
  .refine((v) => v.eventType !== undefined || v.occurredAt !== undefined, {
    message: 'Aucune correction fournie (type d’événement ou heure attendus).',
  });
