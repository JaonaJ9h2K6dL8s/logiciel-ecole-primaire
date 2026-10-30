import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { todayInAppTz } from '../../shared/time';
import { assignmentCreateSchema } from './attendance.schemas';

export const teacherAssignmentsRouter = Router();

teacherAssignmentsRouter.use(requireAuth);

const listQuerySchema = z.object({
  schoolYearId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  activeOnly: z.enum(['0', '1']).optional(),
});

// ---------- Liste des affectations (gestion réservée à l'administrateur) ----------
teacherAssignmentsRouter.get(
  '/',
  requirePermission('academics.manage'),
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (q.schoolYearId) {
      where.push('a.school_year_id = ?');
      params.push(q.schoolYearId);
    }
    if (q.teacherId) {
      where.push('a.teacher_id = ?');
      params.push(q.teacherId);
    }
    if (q.classId) {
      where.push('a.class_id = ?');
      params.push(q.classId);
    }
    if (q.activeOnly === '1') {
      where.push('a.assigned_to IS NULL');
    }
    const whereSql = where.join(' AND ');

    const [rows] = await getPool().query(
      `SELECT a.id, a.teacher_id AS teacherId, u.full_name AS teacherName,
              a.class_id AS classId, c.name AS className, l.name AS levelName,
              a.school_year_id AS schoolYearId, sy.label AS schoolYearLabel,
              a.subject, a.assigned_from AS assignedFrom, a.assigned_to AS assignedTo
       FROM teacher_class_assignments a
       JOIN users u ON u.id = a.teacher_id
       JOIN classes c ON c.id = a.class_id
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = a.school_year_id
       WHERE ${whereSql}
       ORDER BY a.assigned_to IS NOT NULL, u.full_name, c.name
       LIMIT 500`,
      params
    );

    res.json({ data: rows });
  })
);

// ---------- Création d'une affectation ----------
teacherAssignmentsRouter.post(
  '/',
  requirePermission('academics.manage'),
  asyncHandler(async (req, res) => {
    const parsed = assignmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const assignmentId = await withTransaction(async (conn) => {
      const [userRows] = await conn.query(
        `SELECT u.id, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.is_active = 1 LIMIT 1`,
        [body.teacherId]
      );
      const user = (userRows as { id: number; role_code: string }[])[0];
      if (!user) throw notFound('Utilisateur introuvable ou désactivé.');
      if (user.role_code !== 'teacher') {
        throw badRequest('L’affectation doit cibler un compte de rôle « Professeur ».');
      }

      const [classRows] = await conn.query(
        'SELECT id, school_year_id AS schoolYearId, is_active FROM classes WHERE id = ? LIMIT 1',
        [body.classId]
      );
      const cls = (classRows as { id: number; schoolYearId: number; is_active: number }[])[0];
      if (!cls) throw notFound('Classe introuvable.');
      if (!cls.is_active) throw conflict('Cette classe est inactive.');

      const [dup] = await conn.query(
        `SELECT id FROM teacher_class_assignments
         WHERE teacher_id = ? AND class_id = ? AND school_year_id = ? AND assigned_to IS NULL`,
        [body.teacherId, body.classId, cls.schoolYearId]
      );
      if ((dup as unknown[]).length > 0) {
        throw conflict('Ce professeur est déjà affecté à cette classe pour cette année scolaire.');
      }

      const [ins] = await conn.query(
        `INSERT INTO teacher_class_assignments (teacher_id, class_id, school_year_id, subject, assigned_from, assigned_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [body.teacherId, body.classId, cls.schoolYearId, body.subject ?? null, todayInAppTz(), req.user!.id]
      );
      return (ins as { insertId: number }).insertId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'teacher_assignments.create',
      entityType: 'teacher_class_assignment',
      entityId: assignmentId,
      details: { teacherId: body.teacherId, classId: body.classId },
      ip: req.ip ?? null,
    });

    res.status(201).json({ data: { id: assignmentId }, message: 'Affectation créée.' });
  })
);

// ---------- Clôture d'une affectation (historique conservé, jamais supprimé) ----------
teacherAssignmentsRouter.delete(
  '/:id',
  requirePermission('academics.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT id, assigned_to FROM teacher_class_assignments WHERE id = ? FOR UPDATE',
        [id]
      );
      const row = (rows as { id: number; assigned_to: string | null }[])[0];
      if (!row) throw notFound('Affectation introuvable.');
      if (row.assigned_to) throw conflict('Affectation déjà clôturée.');
      await conn.query('UPDATE teacher_class_assignments SET assigned_to = ? WHERE id = ?', [
        todayInAppTz(),
        id,
      ]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'teacher_assignments.close',
      entityType: 'teacher_class_assignment',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Affectation clôturée (historique conservé).' });
  })
);
