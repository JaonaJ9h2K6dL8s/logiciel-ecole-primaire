import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';

const slotStartTimesSchema = z
  .record(
    z.string().regex(/^\d{1,2}$/, 'Numéro de séance invalide.'),
    z.string().regex(/^\d{1,2}:[0-5]\d$/, 'Heure invalide (HH:MM).')
  )
  .refine((v) => Object.keys(v).length <= 12, 'Trop de séances.');

const settingsSchema = z.object({
  schoolName: z.string().trim().min(2, 'Nom de l’établissement requis.').max(150),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().max(150).email('Adresse électronique invalide.').optional().or(z.literal('')),
  logo: z
    .string()
    .max(550_000, 'Logo trop volumineux (max ~400 Ko).')
    .refine(
      (v) => v === '' || v.startsWith('data:image/') || /^https?:\/\//.test(v),
      'Le logo doit être une image (dataURL) ou une URL.'
    )
    .optional(),
  timezone: z.string().trim().min(3).max(60),
  documentHeader: z.string().trim().max(255).optional().or(z.literal('')),
  documentFooter: z.string().trim().max(255).optional().or(z.literal('')),
  // Horaires de référence des séances de la journée (étape 3, rapprochement).
  // Facultatif : sans configuration, les comparaisons horaires sont signalées
  // comme impossibles plutôt que devinées.
  slotStartTimes: slotStartTimesSchema.optional(),
});

export const settingsRouter = Router();

// Lecture : tout utilisateur authentifié (le nom de l'établissement est utile à tous)
settingsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT school_name AS schoolName, address, phone, email, logo, timezone,
              document_header AS documentHeader, document_footer AS documentFooter,
              slot_start_times AS slotStartTimes, updated_at AS updatedAt
       FROM school_settings WHERE id = 1`
    );
    res.json({ data: (rows as unknown[])[0] ?? null });
  })
);

settingsRouter.put(
  '/',
  requireAuth,
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const s = parsed.data;

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE school_settings SET
           school_name = ?, address = ?, phone = ?, email = ?, logo = ?,
           timezone = ?, document_header = ?, document_footer = ?, slot_start_times = ?
         WHERE id = 1`,
        [
          s.schoolName,
          s.address === '' ? null : s.address ?? null,
          s.phone === '' ? null : s.phone ?? null,
          s.email === '' ? null : s.email ?? null,
          s.logo === '' ? null : s.logo ?? null,
          s.timezone,
          s.documentHeader === '' ? null : s.documentHeader ?? null,
          s.documentFooter === '' ? null : s.documentFooter ?? null,
          s.slotStartTimes ? JSON.stringify(s.slotStartTimes) : null,
        ]
      );
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'settings.update',
      entityType: 'school_settings',
      entityId: 1,
      details: { schoolName: s.schoolName, timezone: s.timezone, logoChanged: Boolean(s.logo) },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);
