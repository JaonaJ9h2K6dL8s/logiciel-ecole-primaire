import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';

// ---------- Niveaux ----------

const levelSchema = z.object({
  name: z.string().trim().min(1, 'Libellé du niveau requis.').max(80),
  orderIndex: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const levelUpdateSchema = levelSchema.partial();

export const academicsRouter = Router();

academicsRouter.use(requireAuth, requirePermission('academics.manage'));

academicsRouter.get(
  '/levels',
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT id, name, order_index AS orderIndex, is_active AS isActive, created_at AS createdAt
       FROM levels ORDER BY order_index, name`
    );
    res.json({ data: rows });
  })
);

academicsRouter.post(
  '/levels',
  asyncHandler(async (req, res) => {
    const parsed = levelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { name, orderIndex = 0, isActive = true } = parsed.data;

    const [dup] = await getPool().query('SELECT id FROM levels WHERE name = ?', [name]);
    if ((dup as unknown[]).length > 0) {
      throw conflict('Un niveau portant ce libellé existe déjà.');
    }

    const [r] = await getPool().query('INSERT INTO levels (name, order_index, is_active) VALUES (?, ?, ?)', [
      name,
      orderIndex,
      isActive ? 1 : 0,
    ]);
    const id = (r as { insertId: number }).insertId;

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'levels.create',
      entityType: 'level',
      entityId: id,
      details: { name },
      ip: req.ip ?? null,
    });
    res.status(201).json({ id });
  })
);

academicsRouter.patch(
  '/levels/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = levelUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const [rows] = await getPool().query('SELECT id FROM levels WHERE id = ?', [id]);
    if ((rows as unknown[]).length === 0) throw notFound('Niveau introuvable.');

    const { name, orderIndex, isActive } = parsed.data;
    if (name === undefined && orderIndex === undefined && isActive === undefined) {
      throw badRequest('Aucune modification fournie.');
    }
    if (name !== undefined) {
      const [dup] = await getPool().query('SELECT id FROM levels WHERE name = ? AND id <> ?', [name, id]);
      if ((dup as unknown[]).length > 0) throw conflict('Un niveau portant ce libellé existe déjà.');
      await getPool().query('UPDATE levels SET name = ? WHERE id = ?', [name, id]);
    }
    if (orderIndex !== undefined) {
      await getPool().query('UPDATE levels SET order_index = ? WHERE id = ?', [orderIndex, id]);
    }
    if (isActive !== undefined) {
      await getPool().query('UPDATE levels SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    }

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'levels.update',
      entityType: 'level',
      entityId: id,
      details: { name, orderIndex, isActive },
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
  })
);

// ---------- Classes ----------

const classSchema = z.object({
  name: z.string().trim().min(1, 'Nom de la classe requis.').max(80),
  levelId: z.coerce.number().int().positive('Niveau requis.'),
  schoolYearId: z.coerce.number().int().positive('Année scolaire requise.'),
  capacity: z.coerce.number().int().min(1).max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

const classUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  capacity: z.coerce.number().int().min(1).max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

academicsRouter.get(
  '/classes',
  asyncHandler(async (req, res) => {
    const schoolYearId = req.query.schoolYearId ? Number(req.query.schoolYearId) : null;
    const params: unknown[] = [];
    let yearFilter = '';
    if (schoolYearId && Number.isInteger(schoolYearId)) {
      yearFilter = 'AND c.school_year_id = ?';
      params.push(schoolYearId);
    }
    const [rows] = await getPool().query(
      `SELECT c.id, c.name, c.level_id AS levelId, l.name AS levelName,
              c.school_year_id AS schoolYearId, sy.label AS schoolYearLabel,
              c.capacity, c.is_active AS isActive, c.created_at AS createdAt
       FROM classes c
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = c.school_year_id
       WHERE 1 = 1 ${yearFilter}
       ORDER BY l.order_index, c.name`,
      params
    );
    res.json({ data: rows });
  })
);

academicsRouter.post(
  '/classes',
  asyncHandler(async (req, res) => {
    const parsed = classSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { name, levelId, schoolYearId } = parsed.data;
    const capacity = parsed.data.capacity ?? null;
    const isActive = parsed.data.isActive ?? true;

    const [levelRows] = await getPool().query('SELECT id FROM levels WHERE id = ?', [levelId]);
    if ((levelRows as unknown[]).length === 0) throw badRequest('Niveau inconnu.');
    const [yearRows] = await getPool().query('SELECT id, is_active FROM school_years WHERE id = ?', [schoolYearId]);
    const year = (yearRows as { id: number; is_active: number }[])[0];
    if (!year) throw badRequest('Année scolaire inconnue.');
    // Une classe se crée normalement dans l'année active (protection des années archivées)
    if (year.is_active !== 1) {
      throw conflict('Les classes ne peuvent être créées que dans l’année scolaire active.');
    }

    const [dup] = await getPool().query(
      'SELECT id FROM classes WHERE name = ? AND school_year_id = ? AND level_id = ?',
      [name, schoolYearId, levelId]
    );
    if ((dup as unknown[]).length > 0) {
      throw conflict('Une classe de ce nom existe déjà pour ce niveau et cette année.');
    }

    const id = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO classes (name, level_id, school_year_id, capacity, is_active) VALUES (?, ?, ?, ?, ?)',
        [name, levelId, schoolYearId, capacity, isActive ? 1 : 0]
      );
      return (r as { insertId: number }).insertId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'classes.create',
      entityType: 'class',
      entityId: id,
      details: { name, levelId, schoolYearId },
      ip: req.ip ?? null,
    });
    res.status(201).json({ id });
  })
);

academicsRouter.patch(
  '/classes/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = classUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { name, capacity, isActive } = parsed.data;
    if (name === undefined && capacity === undefined && isActive === undefined) {
      throw badRequest('Aucune modification fournie.');
    }

    const [rows] = await getPool().query('SELECT id FROM classes WHERE id = ?', [id]);
    if ((rows as unknown[]).length === 0) throw notFound('Classe introuvable.');

    await withTransaction(async (conn) => {
      if (name !== undefined) {
        await conn.query('UPDATE classes SET name = ? WHERE id = ?', [name, id]);
      }
      if (capacity !== undefined) {
        await conn.query('UPDATE classes SET capacity = ? WHERE id = ?', [capacity, id]);
      }
      if (isActive !== undefined) {
        await conn.query('UPDATE classes SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'classes.update',
      entityType: 'class',
      entityId: id,
      details: { name, capacity, isActive },
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
  })
);

// Suppression protégée : refusée si des données historiques existent
// (les inscriptions/résultats des modules futurs devront s'enregistrer ici).
academicsRouter.delete(
  '/classes/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const [rows] = await getPool().query('SELECT id, name FROM classes WHERE id = ?', [id]);
    const target = (rows as { id: number; name: string }[])[0];
    if (!target) throw notFound('Classe introuvable.');

    // Suppression refusée si des inscriptions existent (protection des données historiques)
    const [enrollRows] = await getPool().query(
      'SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ?',
      [id]
    );
    const historicalRefs = (enrollRows as { n: number }[])[0].n;
    if (historicalRefs > 0) {
      throw conflict('Classe liée à des inscriptions : suppression impossible (désactivez-la plutôt).');
    }

    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM classes WHERE id = ?', [id]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'classes.delete',
      entityType: 'class',
      entityId: id,
      details: { name: target.name },
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
  })
);
