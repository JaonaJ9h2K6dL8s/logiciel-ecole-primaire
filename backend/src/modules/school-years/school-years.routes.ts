import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';

const createSchema = z.object({
  label: z
    .string()
    .trim()
    .min(4, 'Le libellé doit contenir au moins 4 caractères (ex. 2025-2026).')
    .max(20)
    .regex(/^\d{4}[-/]\d{4}$/, 'Format attendu : 2025-2026.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début invalide (AAAA-MM-JJ).'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de fin invalide (AAAA-MM-JJ).'),
});

export const schoolYearsRouter = Router();

schoolYearsRouter.use(requireAuth, requirePermission('school_years.manage'));

schoolYearsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT id, label, start_date AS startDate, end_date AS endDate, is_active AS isActive, created_at AS createdAt
       FROM school_years ORDER BY start_date DESC`
    );
    res.json({ data: rows });
  })
);

schoolYearsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { label, startDate, endDate } = parsed.data;
    if (new Date(endDate) <= new Date(startDate)) {
      throw badRequest('La date de fin doit être postérieure à la date de début.');
    }

    const [dup] = await getPool().query('SELECT id FROM school_years WHERE label = ?', [label]);
    if ((dup as unknown[]).length > 0) {
      throw conflict('Une année scolaire portant ce libellé existe déjà.');
    }

    const result = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO school_years (label, start_date, end_date) VALUES (?, ?, ?)',
        [label, startDate, endDate]
      );
      return (r as { insertId: number }).insertId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_years.create',
      entityType: 'school_year',
      entityId: result,
      details: { label, startDate, endDate },
      ip: req.ip ?? null,
    });

    res.status(201).json({ id: result });
  })
);

// Activation : transaction — désactive les autres puis active l'année demandée.
// L'activation ne modifie aucune donnée historique : elle ne touche que is_active.
schoolYearsRouter.post(
  '/:id/activate',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, label, is_active FROM school_years WHERE id = ? FOR UPDATE', [id]);
      const year = (rows as { id: number; label: string; is_active: number }[])[0];
      if (!year) throw notFound('Année scolaire introuvable.');
      if (year.is_active === 1) {
        res.json({ ok: true, alreadyActive: true });
        return;
      }
      await conn.query('UPDATE school_years SET is_active = 0 WHERE is_active = 1');
      await conn.query('UPDATE school_years SET is_active = 1 WHERE id = ?', [id]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_years.activate',
      entityType: 'school_year',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);

// Suppression uniquement si l'année n'est pas active (protection des données historiques)
schoolYearsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const [rows] = await getPool().query('SELECT id, label, is_active FROM school_years WHERE id = ?', [id]);
    const year = (rows as { id: number; label: string; is_active: number }[])[0];
    if (!year) throw notFound('Année scolaire introuvable.');
    if (year.is_active === 1) {
      throw conflict('Impossible de supprimer l’année scolaire active.');
    }

    await withTransaction(async (conn) => {
      // Garde-fou : les modules futurs (inscriptions, résultats) devront enrichir ce contrôle.
      await conn.query('DELETE FROM school_years WHERE id = ?', [id]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_years.delete',
      entityType: 'school_year',
      entityId: id,
      details: { label: year.label },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);
