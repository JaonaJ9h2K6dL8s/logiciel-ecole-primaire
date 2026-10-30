import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { periodCreateSchema, periodUpdateSchema } from './grading.schemas';

export const periodsRouter = Router();

periodsRouter.use(requireAuth);

function isDupEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

const listQuery = z.object({ schoolYearId: z.coerce.number().int().positive().optional() });

const DATE_SQL = 'DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate';

// ---------- Options de formulaire (années + classes, périmètre du rôle) ----------
// Remplace /school-years et /academics/classes (réservés à la gestion admin)
// pour les pages de notes, bulletins et résultats annuels. Un professeur ne
// voit que les années/classes qui lui sont affectées.
periodsRouter.get(
  '/form-options',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const admin = req.user!.role_code === 'admin';
    const teacherId = req.user!.id;
    const [years] = admin
      ? await getPool().query(
          `SELECT id, label, is_active AS isActive FROM school_years ORDER BY start_date DESC`
        )
      : await getPool().query(
          `SELECT DISTINCT y.id, y.label, y.is_active AS isActive
           FROM school_years y
           JOIN teacher_class_assignments tca ON tca.school_year_id = y.id
           WHERE tca.teacher_id = ? AND tca.assigned_to IS NULL
           ORDER BY y.start_date DESC`,
          [teacherId]
        );
    let classes: unknown = [];
    const schoolYearId = Number(new URLSearchParams(req.url.split('?')[1] ?? '').get('schoolYearId'));
    if (Number.isInteger(schoolYearId) && schoolYearId > 0) {
      const result = admin
        ? await getPool().query(
            `SELECT c.id, c.name, c.level_id AS levelId, c.school_year_id AS schoolYearId, l.name AS levelName
             FROM classes c JOIN levels l ON l.id = c.level_id
             WHERE c.school_year_id = ? AND c.is_active = 1 ORDER BY c.name`,
            [schoolYearId]
          )
        : await getPool().query(
            `SELECT DISTINCT c.id, c.name, c.level_id AS levelId, c.school_year_id AS schoolYearId, l.name AS levelName
             FROM classes c
             JOIN levels l ON l.id = c.level_id
             JOIN teacher_class_assignments tca ON tca.class_id = c.id AND tca.school_year_id = c.school_year_id
             WHERE c.school_year_id = ? AND c.is_active = 1 AND tca.teacher_id = ? AND tca.assigned_to IS NULL
             ORDER BY c.name`,
            [schoolYearId, teacherId]
          );
      classes = result[0];
    }
    res.json({ data: { years, classes } });
  })
);

// ---------- Périodes d'évaluation (découpage entièrement configurable) ----------
periodsRouter.get(
  '/',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const where = q.schoolYearId ? 'WHERE school_year_id = ?' : '';
    const params = q.schoolYearId ? [q.schoolYearId] : [];
    const [rows] = await getPool().query(
      `SELECT id, school_year_id AS schoolYearId, name, ${DATE_SQL},
              display_order AS displayOrder, is_locked AS isLocked
       FROM grading_periods ${where}
       ORDER BY school_year_id, display_order`,
      params
    );
    res.json({ data: rows });
  })
);

/**
 * Sérialisation anti-chevauchement : MariaDB n'a pas de contrainte d'exclusion
 * de plages. Le verrou FOR UPDATE sur la ligne de l'année scolaire sérialise
 * les créations/modifications concurrentes de périodes de la même année, puis
 * le chevauchement est vérifié applicativement.
 */
async function assertNoOverlap(
  conn: import('mysql2/promise').PoolConnection,
  schoolYearId: number,
  startDate: string,
  endDate: string,
  excludePeriodId?: number
): Promise<void> {
  await conn.query('SELECT id FROM school_years WHERE id = ? FOR UPDATE', [schoolYearId]);
  const [rows] = await conn.query(
    `SELECT id, name, DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate
     FROM grading_periods WHERE school_year_id = ?`,
    [schoolYearId]
  );
  for (const row of rows as { id: number; name: string; startDate: string; endDate: string }[]) {
    if (excludePeriodId && row.id === excludePeriodId) continue;
    if (startDate <= row.endDate && endDate >= row.startDate) {
      throw conflict(`Chevauchement avec la période « ${row.name} » (${row.startDate} → ${row.endDate}).`);
    }
  }
}

periodsRouter.post(
  '/',
  requirePermission('periods.manage'),
  asyncHandler(async (req, res) => {
    const parsed = periodCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const p = parsed.data;

    const id = await withTransaction(async (conn) => {
      const [years] = await conn.query(
        'SELECT id, DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate FROM school_years WHERE id = ? LIMIT 1',
        [p.schoolYearId]
      );
      const year = (years as { id: number; startDate: string; endDate: string }[])[0];
      if (!year) throw notFound('Année scolaire introuvable.');
      if (p.startDate < year.startDate || p.endDate > year.endDate) {
        throw badRequest(`La période doit être incluse dans l’année scolaire (${year.startDate} → ${year.endDate}).`);
      }

      await assertNoOverlap(conn, p.schoolYearId, p.startDate, p.endDate);

      try {
        const [ins] = await conn.query(
          `INSERT INTO grading_periods (school_year_id, name, start_date, end_date, display_order, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [p.schoolYearId, p.name, p.startDate, p.endDate, p.displayOrder, req.user!.id]
        );
        return (ins as { insertId: number }).insertId;
      } catch (err) {
        if (isDupEntry(err)) throw conflict('Ce nom de période (ou cet ordre d’affichage) existe déjà pour cette année.');
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'grading_periods.create',
      entityType: 'grading_period',
      entityId: id,
      details: { name: p.name, schoolYearId: p.schoolYearId },
      ip: req.ip ?? null,
    });

    res.status(201).json({ data: { id }, message: 'Période créée.' });
  })
);

periodsRouter.patch(
  '/:id',
  requirePermission('periods.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = periodUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const p = parsed.data;
    if (Object.keys(p).length === 0) throw badRequest('Aucune modification fournie.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT id, school_year_id, name, DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate,
                DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate, display_order, is_locked
         FROM grading_periods WHERE id = ? FOR UPDATE`,
        [id]
      );
      const cur = (rows as { id: number; school_year_id: number; name: string; startDate: string; endDate: string; display_order: number; is_locked: number }[])[0];
      if (!cur) throw notFound('Période introuvable.');

      // Une période verrouillée protège les résultats existants : seuls le
      // verrou lui-même peut être modifié (via /lock et /unlock).
      if (cur.is_locked && (p.name !== undefined || p.startDate !== undefined || p.endDate !== undefined || p.displayOrder !== undefined)) {
        throw conflict('Période verrouillée : déverrouillez-la avant de modifier ses paramètres.');
      }

      const newName = p.name ?? cur.name;
      const newStart = p.startDate ?? cur.startDate;
      const newEnd = p.endDate ?? cur.endDate;
      const newOrder = p.displayOrder ?? cur.display_order;
      if (newEnd < newStart) throw badRequest('La fin de la période doit suivre son début.');

      // Les dates doivent rester dans l'année scolaire.
      const [years] = await conn.query(
        'SELECT DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate FROM school_years WHERE id = ? LIMIT 1',
        [cur.school_year_id]
      );
      const year = (years as { startDate: string; endDate: string }[])[0];
      if (newStart < year.startDate || newEnd > year.endDate) {
        throw badRequest(`La période doit rester incluse dans l’année scolaire (${year.startDate} → ${year.endDate}).`);
      }

      await assertNoOverlap(conn, cur.school_year_id, newStart, newEnd, id);

      try {
        await conn.query(
          'UPDATE grading_periods SET name = ?, start_date = ?, end_date = ?, display_order = ? WHERE id = ?',
          [newName, newStart, newEnd, newOrder, id]
        );
      } catch (err) {
        if (isDupEntry(err)) throw conflict('Ce nom (ou cet ordre d’affichage) est déjà pris pour cette année.');
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'grading_periods.update',
      entityType: 'grading_period',
      entityId: id,
      details: { changes: p },
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Période mise à jour.' });
  })
);

periodsRouter.post(
  '/:id/lock',
  requirePermission('periods.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, is_locked FROM grading_periods WHERE id = ? FOR UPDATE', [id]);
      const cur = (rows as { id: number; is_locked: number }[])[0];
      if (!cur) throw notFound('Période introuvable.');
      if (cur.is_locked) throw conflict('Période déjà verrouillée.');
      await conn.query('UPDATE grading_periods SET is_locked = 1 WHERE id = ?', [id]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'grading_periods.lock',
      entityType: 'grading_period',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Période verrouillée : les saisies y sont interdites (résultats conservés).' });
  })
);

periodsRouter.post(
  '/:id/unlock',
  requirePermission('periods.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, is_locked FROM grading_periods WHERE id = ? FOR UPDATE', [id]);
      const cur = (rows as { id: number; is_locked: number }[])[0];
      if (!cur) throw notFound('Période introuvable.');
      if (!cur.is_locked) throw conflict('Période déjà déverrouillée.');
      await conn.query('UPDATE grading_periods SET is_locked = 0 WHERE id = ?', [id]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'grading_periods.unlock',
      entityType: 'grading_period',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Période déverrouillée.' });
  })
);
