import { z } from 'zod';

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Date invalide.' })
  .transform((v) => new Date(v));

export const announcementListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    // Filtre réservé à l'administration : voir les brouillons/archivées/expirées.
    status: z.enum(['draft', 'published', 'archived', 'expired', 'all']).optional(),
    includeExpired: z.coerce.boolean().optional(),
  })
  .strict();

export const announcementCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    content: z.string().trim().min(1).max(20000),
    expiresAt: isoDateTime.nullable().optional(),
    targets: z
      .array(
        z
          .object({
            roleId: z.coerce.number().int().positive().nullable().optional(),
            classId: z.coerce.number().int().positive().nullable().optional(),
          })
          .strict()
          .refine((t) => (t.roleId == null) !== (t.classId == null), {
            message: 'Chaque destinataire désigne soit un rôle, soit une classe.',
          })
      )
      .min(1)
      .max(100),
  })
  .strict();

export const announcementUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(150).optional(),
    content: z.string().trim().min(1).max(20000).optional(),
    expiresAt: isoDateTime.nullable().optional(),
    targets: z
      .array(
        z
          .object({
            roleId: z.coerce.number().int().positive().nullable().optional(),
            classId: z.coerce.number().int().positive().nullable().optional(),
          })
          .strict()
          .refine((t) => (t.roleId == null) !== (t.classId == null), {
            message: 'Chaque destinataire désigne soit un rôle, soit une classe.',
          })
      )
      .max(100)
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie.' });
