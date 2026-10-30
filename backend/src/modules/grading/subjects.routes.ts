import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  classSubjectCreateSchema,
  classSubjectUpdateSchema,
} from './grading.schemas';

export const subjectsRouter = Router();

subjectsRouter.use(requireAuth);

function isDupEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// ---------- Catalogue des matières ----------
subjectsRouter.get(
  '/',
  requirePermission('subjects.view'),
  asyncHandler(async (req, res) => {
    const includeInactive = req.user!.role_code === 'admin' && req.query.all === '1';
    const [rows] = await getPool().query(
      `SELECT id, code, name, description,
              default_coefficient AS defaultCoefficient, is_active AS isActive
       FROM subjects ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY name`
    );
    res.json({ data: rows });
  })
);

subjectsRouter.post(
  '/',
  requirePermission('subjects.manage'),
  asyncHandler(async (req, res) => {
    const parsed = subjectCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const s = parsed.data;

    const id = await withTransaction(async (conn) => {
      try {
        const [ins] = await conn.query(
          `INSERT INTO subjects (code, name, description, default_coefficient, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [s.code, s.name, s.description || null, s.defaultCoefficient ?? null, req.user!.id]
        );
        return (ins as { insertId: number }).insertId;
      } catch (err) {
        if (isDupEntry(err)) throw conflict('Ce code de matière existe déjà.');
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'subjects.create',
      entityType: 'subject',
      entityId: id,
      details: { code: s.code, name: s.name },
      ip: req.ip ?? null,
    });

    res.status(201).json({ data: { id }, message: 'Matière créée.' });
  })
);

subjectsRouter.patch(
  '/:id',
  requirePermission('subjects.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = subjectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const s = parsed.data;
    if (Object.keys(s).length === 0) throw badRequest('Aucune modification fournie.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, name, description, default_coefficient, is_active FROM subjects WHERE id = ? FOR UPDATE', [id]);
      const current = (rows as { id: number; name: string; description: string | null; default_coefficient: string | null; is_active: number }[])[0];
      if (!current) throw notFound('Matière introuvable.');

      const newName = s.name ?? current.name;
      const newDescription = s.description !== undefined ? s.description || null : current.description;
      const newCoefficient = s.defaultCoefficient !== undefined ? (s.defaultCoefficient ?? null) : current.default_coefficient;
      const newActive = s.isActive ?? Boolean(current.is_active);

      // Une matière ne peut pas être désactivée si des évaluations actives l'utilisent :
      // les résultats existants restent consultables, mais la désactivation évite
      // de nouvelles évaluations. Aucune suppression physique n'est proposée.
      if (current.is_active && !newActive) {
        const [used] = await conn.query(
          `SELECT COUNT(*) AS n FROM class_subjects WHERE subject_id = ? AND is_active = 1`,
          [id]
        );
        if ((used as { n: number }[])[0].n > 0) {
          throw conflict('Impossible de désactiver : cette matière est rattachée à au moins une classe. Détachez-la d’abord.');
        }
      }

      try {
        await conn.query(
          `UPDATE subjects SET name = ?, description = ?, default_coefficient = ?, is_active = ? WHERE id = ?`,
          [newName, newDescription, newCoefficient, newActive ? 1 : 0, id]
        );
      } catch (err) {
        if (isDupEntry(err)) throw conflict('Ce code de matière existe déjà.');
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'subjects.update',
      entityType: 'subject',
      entityId: id,
      details: { changes: s },
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Matière mise à jour.' });
  })
);

// ---------- Options de formulaire (classes, périmètre du rôle) ----------
subjectsRouter.get(
  '/form-options',
  requirePermission('subjects.view'),
  asyncHandler(async (req, res) => {
    const admin = req.user!.role_code === 'admin';
    const teacherId = req.user!.id;
    const [classes] = admin
      ? await getPool().query(
          `SELECT c.id, c.name, c.school_year_id AS schoolYearId, y.label AS yearLabel
           FROM classes c JOIN school_years y ON y.id = c.school_year_id
           WHERE c.is_active = 1 ORDER BY y.start_date DESC, c.name`
        )
      : await getPool().query(
          `SELECT DISTINCT c.id, c.name, c.school_year_id AS schoolYearId, y.label AS yearLabel
           FROM classes c
           JOIN school_years y ON y.id = c.school_year_id
           JOIN teacher_class_assignments tca ON tca.class_id = c.id AND tca.school_year_id = c.school_year_id
           WHERE c.is_active = 1 AND tca.teacher_id = ? AND tca.assigned_to IS NULL
           ORDER BY y.start_date DESC, c.name`,
          [teacherId]
        );
    res.json({ data: { classes } });
  })
);

// ---------- Matières rattachées à une classe ----------
const classSubjectListQuery = z.object({ classId: z.coerce.number().int().positive('Classe requise.') });

subjectsRouter.get(
  '/class-assignments',
  requirePermission('subjects.view'),
  asyncHandler(async (req, res) => {
    const parsed = classSubjectListQuery.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    // Un professeur ne consulte le référentiel matières/professeurs que pour
    // ses classes affectées ; l'admin a accès global.
    if (req.user!.role_code !== 'admin') {
      const [owned] = await getPool().query(
        `SELECT 1 FROM teacher_class_assignments
         WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL LIMIT 1`,
        [req.user!.id, parsed.data.classId]
      );
      if ((owned as unknown[]).length === 0) {
        throw forbidden('Vous n’êtes pas affecté à cette classe.');
      }
    }
    const [rows] = await getPool().query(
      `SELECT cs.id, cs.class_id AS classId, cs.subject_id AS subjectId,
              sb.code AS subjectCode, sb.name AS subjectName,
              cs.teacher_id AS teacherId, u.full_name AS teacherName,
              cs.coefficient, cs.is_active AS isActive,
              COALESCE(cs.coefficient, sb.default_coefficient) AS effectiveCoefficient
       FROM class_subjects cs
       JOIN subjects sb ON sb.id = cs.subject_id
       LEFT JOIN users u ON u.id = cs.teacher_id
       WHERE cs.class_id = ?
       ORDER BY sb.name`,
      [parsed.data.classId]
    );
    res.json({ data: rows });
  })
);

subjectsRouter.post(
  '/class-assignments',
  requirePermission('subjects.manage'),
  asyncHandler(async (req, res) => {
    const parsed = classSubjectCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const s = parsed.data;

    const id = await withTransaction(async (conn) => {
      const [cls] = await conn.query('SELECT id, school_year_id AS sy, is_active FROM classes WHERE id = ? LIMIT 1', [s.classId]);
      const clsRow = (cls as { id: number; sy: number; is_active: number }[])[0];
      if (!clsRow) throw notFound('Classe introuvable.');
      if (!clsRow.is_active) throw conflict('Cette classe est inactive.');

      const [sub] = await conn.query('SELECT id, is_active FROM subjects WHERE id = ? LIMIT 1', [s.subjectId]);
      const subRow = (sub as { id: number; is_active: number }[])[0];
      if (!subRow) throw notFound('Matière introuvable.');
      if (!subRow.is_active) throw conflict('Cette matière est désactivée.');

      if (s.teacherId !== undefined && s.teacherId !== null) {
        const [t] = await conn.query(
          `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
           WHERE u.id = ? AND u.is_active = 1 AND r.code = 'teacher' LIMIT 1`,
          [s.teacherId]
        );
        if ((t as unknown[]).length === 0) throw badRequest('Le professeur désigné doit être un compte professeur actif.');
      }

      try {
        const [ins] = await conn.query(
          `INSERT INTO class_subjects (class_id, subject_id, teacher_id, coefficient, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [s.classId, s.subjectId, s.teacherId ?? null, s.coefficient ?? null, req.user!.id]
        );
        return (ins as { insertId: number }).insertId;
      } catch (err) {
        if (isDupEntry(err)) throw conflict('Cette matière est déjà rattachée à cette classe.');
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'class_subjects.create',
      entityType: 'class_subject',
      entityId: id,
      details: { classId: s.classId, subjectId: s.subjectId },
      ip: req.ip ?? null,
    });

    res.status(201).json({ data: { id }, message: 'Matière rattachée à la classe.' });
  })
);

subjectsRouter.patch(
  '/class-assignments/:id',
  requirePermission('subjects.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = classSubjectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const s = parsed.data;
    if (Object.keys(s).length === 0) throw badRequest('Aucune modification fournie.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, teacher_id, coefficient, is_active FROM class_subjects WHERE id = ? FOR UPDATE', [id]);
      const current = (rows as { id: number; teacher_id: number | null; coefficient: string | null; is_active: number }[])[0];
      if (!current) throw notFound('Rattachement introuvable.');

      const newTeacher = s.teacherId !== undefined ? (s.teacherId ?? null) : current.teacher_id;
      const newCoeff = s.coefficient !== undefined ? (s.coefficient ?? null) : current.coefficient;
      const newActive = s.isActive ?? Boolean(current.is_active);

      if (newTeacher !== null) {
        const [t] = await conn.query(
          `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
           WHERE u.id = ? AND u.is_active = 1 AND r.code = 'teacher' LIMIT 1`,
          [newTeacher]
        );
        if ((t as unknown[]).length === 0) throw badRequest('Le professeur désigné doit être un compte professeur actif.');
      }

      await conn.query(
        'UPDATE class_subjects SET teacher_id = ?, coefficient = ?, is_active = ? WHERE id = ?',
        [newTeacher, newCoeff, newActive ? 1 : 0, id]
      );
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'class_subjects.update',
      entityType: 'class_subject',
      entityId: id,
      details: { changes: s },
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Rattachement mis à jour.' });
  })
);
