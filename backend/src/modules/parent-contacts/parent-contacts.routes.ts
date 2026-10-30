import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import type { SessionUser } from '../../shared/session';
import {
  contactCreateSchema,
  contactListQuerySchema,
  contactUpdateSchema,
  followupsQuerySchema,
} from './parent-contacts.schemas';

export const parentContactsRouter = Router();

parentContactsRouter.use(requireAuth);

/**
 * Confidentialité : un professeur n'accède qu'aux communications des élèves
 * ayant (actuellement ou par le passé) une inscription dans une de ses classes
 * affectées encore actives. L'administration voit tout selon ses permissions.
 */
async function canAccessStudent(user: SessionUser, studentId: number): Promise<boolean> {
  if (user.role_code === 'admin') return true;
  if (user.role_code !== 'teacher') return false;
  const [rows] = await getPool().query(
    `SELECT 1
     FROM enrollments e
     JOIN teacher_class_assignments tca
       ON tca.class_id = e.class_id AND tca.teacher_id = ? AND tca.assigned_to IS NULL
     WHERE e.student_id = ?
     LIMIT 1`,
    [user.id, studentId]
  );
  return (rows as unknown[]).length > 0;
}

/** Filtre SQL supplémentaire pour restreindre une liste au périmètre professeur. */
async function teacherScopeSql(user: SessionUser): Promise<{ sql: string; params: unknown[] } | null> {
  if (user.role_code === 'admin') return null;
  const [rows] = await getPool().query(
    `SELECT DISTINCT tca.class_id
     FROM teacher_class_assignments tca
     WHERE tca.teacher_id = ? AND tca.assigned_to IS NULL`,
    [user.id]
  );
  const classIds = (rows as RowDataPacket[]).map((r) => Number(r.class_id));
  if (classIds.length === 0) return { sql: '1=0', params: [] };
  return {
    sql: `student_id IN (SELECT student_id FROM enrollments WHERE class_id IN (${classIds.map(() => '?').join(',')}))`,
    params: classIds,
  };
}

async function loadContact(id: number): Promise<RowDataPacket> {
  const [rows] = await getPool().query('SELECT * FROM parent_contact_logs WHERE id = ?', [id]);
  const row = (rows as RowDataPacket[])[0];
  if (!row) throw notFound('Contact introuvable.');
  return row;
}

async function activeSchoolYearId(): Promise<number> {
  const [rows] = await getPool().query('SELECT id FROM school_years WHERE is_active = 1 LIMIT 1');
  const row = (rows as RowDataPacket[])[0];
  if (!row) throw badRequest('Aucune année scolaire active.');
  return Number(row.id);
}

function publicContact(row: RowDataPacket) {
  return {
    id: row.id,
    studentId: row.student_id,
    guardianId: row.guardian_id,
    schoolYearId: row.school_year_id,
    occurredAt: row.occurred_at,
    direction: row.direction,
    channel: row.channel,
    subject: row.subject,
    summary: row.summary,
    actionDecided: row.action_decided,
    followupDueDate: row.followup_due_date,
    followupStatus: row.followup_status,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- Suivis (route littérale, avant /:id) ----------

parentContactsRouter.get(
  '/followups',
  requirePermission('parent_contacts.view'),
  asyncHandler(async (req, res) => {
    const parsed = followupsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const { bucket, page, pageSize } = parsed.data;
    const scope = await teacherScopeSql(req.user!);
    if (scope && scope.sql === '1=0') {
      return res.json({ data: [], pagination: { page, pageSize, total: 0 } });
    }
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (bucket === 'overdue') {
      where.push('followup_status IN (?, ?) AND followup_due_date < CURDATE()');
      params.push('todo', 'ongoing');
    } else if (bucket === 'today') {
      where.push('followup_status IN (?, ?) AND followup_due_date = CURDATE()');
      params.push('todo', 'ongoing');
    } else if (bucket === 'upcoming') {
      where.push('followup_status IN (?, ?) AND followup_due_date > CURDATE()');
      params.push('todo', 'ongoing');
    } else {
      where.push('followup_status = ?');
      params.push('resolved');
    }
    if (scope) {
      where.push(scope.sql);
      params.push(...scope.params);
    }
    const whereSql = where.join(' AND ');
    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM parent_contact_logs WHERE ${whereSql}`, params);
    const total = (countRows as RowDataPacket[])[0].total as number;
    const [rows] = await getPool().query(
      `SELECT pcl.*, s.first_names AS student_first_names, s.last_name AS student_last_name,
              g.last_name AS guardian_last_name, g.first_names AS guardian_first_names
       FROM parent_contact_logs pcl
       JOIN students s ON s.id = pcl.student_id
       JOIN guardians g ON g.id = pcl.guardian_id
       WHERE ${whereSql}
       ORDER BY pcl.followup_due_date ASC, pcl.occurred_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({
      data: (rows as RowDataPacket[]).map((r) => ({
        ...publicContact(r),
        student_last_name: r.student_last_name,
        student_first_names: r.student_first_names,
        guardian_last_name: r.guardian_last_name,
        guardian_first_names: r.guardian_first_names,
      })),
      pagination: { page, pageSize, total },
    });
  })
);

// ---------- Liste filtrée ----------

parentContactsRouter.get(
  '/',
  requirePermission('parent_contacts.view'),
  asyncHandler(async (req, res) => {
    const parsed = contactListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const scope = await teacherScopeSql(req.user!);
    if (scope && scope.sql === '1=0') {
      return res.json({ data: [], pagination: { page: q.page, pageSize: q.pageSize, total: 0 } });
    }
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (q.studentId) {
      where.push('student_id = ?');
      params.push(q.studentId);
    }
    if (q.guardianId) {
      where.push('guardian_id = ?');
      params.push(q.guardianId);
    }
    if (q.subject) {
      where.push('subject = ?');
      params.push(q.subject);
    }
    if (q.channel) {
      where.push('channel = ?');
      params.push(q.channel);
    }
    if (q.status) {
      where.push('followup_status = ?');
      params.push(q.status);
    }
    if (q.from) {
      where.push('occurred_at >= ?');
      params.push(`${q.from} 00:00:00`);
    }
    if (q.to) {
      where.push('occurred_at <= ?');
      params.push(`${q.to} 23:59:59`);
    }
    if (scope) {
      where.push(scope.sql);
      params.push(...scope.params);
    }
    const whereSql = where.join(' AND ');
    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM parent_contact_logs WHERE ${whereSql}`, params);
    const total = (countRows as RowDataPacket[])[0].total as number;
    const [rows] = await getPool().query(
      `SELECT pcl.*, s.first_names AS student_first_names, s.last_name AS student_last_name,
              g.last_name AS guardian_last_name, g.first_names AS guardian_first_names
       FROM parent_contact_logs pcl
       JOIN students s ON s.id = pcl.student_id
       JOIN guardians g ON g.id = pcl.guardian_id
       WHERE ${whereSql}
       ORDER BY pcl.occurred_at DESC, pcl.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json({
      data: (rows as RowDataPacket[]).map((r) => ({
        ...publicContact(r),
        student_last_name: r.student_last_name,
        student_first_names: r.student_first_names,
        guardian_last_name: r.guardian_last_name,
        guardian_first_names: r.guardian_first_names,
      })),
      pagination: { page: q.page, pageSize: q.pageSize, total },
    });
  })
);

// ---------- Création ----------

parentContactsRouter.post(
  '/',
  requirePermission('parent_contacts.manage'),
  asyncHandler(async (req, res) => {
    const parsed = contactCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    if (!(await canAccessStudent(req.user!, q.studentId))) {
      throw forbidden('Élève hors de votre périmètre.');
    }
    const [assoc] = await getPool().query('SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?', [
      q.studentId,
      q.guardianId,
    ]);
    if ((assoc as unknown[]).length === 0) {
      throw badRequest('Ce responsable légal n’est pas associé à cet élève.');
    }
    if (q.occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw badRequest('La date du contact ne peut pas être dans le futur.');
    }

    const yearId = await activeSchoolYearId();
    const [result] = await getPool().query(
      `INSERT INTO parent_contact_logs
         (student_id, guardian_id, school_year_id, occurred_at, direction, channel, subject,
          summary, action_decided, followup_due_date, followup_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        q.studentId,
        q.guardianId,
        yearId,
        q.occurredAt,
        q.direction,
        q.channel,
        q.subject,
        q.summary ?? null,
        q.actionDecided ?? null,
        q.followupDueDate ?? null,
        q.followupStatus,
        req.user!.id,
      ]
    );
    const id = (result as { insertId: number }).insertId;
    await getPool().query(
      `INSERT INTO parent_contact_followups (contact_id, followup_status, followup_due_date, changed_by)
       VALUES (?, ?, ?, ?)`,
      [id, q.followupStatus, q.followupDueDate ?? null, req.user!.id]
    );
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'parent_contact.create',
      entityType: 'parent_contact_logs',
      entityId: id,
      details: { studentId: q.studentId, subject: q.subject, channel: q.channel },
    });
    const row = await loadContact(id);
    res.status(201).json({ data: publicContact(row) });
  })
);

// ---------- Détail ----------

parentContactsRouter.get(
  '/:id(\\d+)',
  requirePermission('parent_contacts.view'),
  asyncHandler(async (req, res) => {
    const row = await loadContact(Number(req.params.id));
    if (!(await canAccessStudent(req.user!, Number(row.student_id)))) {
      throw forbidden('Contact hors de votre périmètre.');
    }
    const [history] = await getPool().query(
      `SELECT f.*, u.username AS changed_by_username
       FROM parent_contact_followups f JOIN users u ON u.id = f.changed_by
       WHERE f.contact_id = ? ORDER BY f.created_at DESC, f.id DESC`,
      [row.id]
    );
    res.json({ data: publicContact(row), followupHistory: history });
  })
);

// ---------- Modification (statut / suivi historisés) ----------

parentContactsRouter.patch(
  '/:id(\\d+)',
  requirePermission('parent_contacts.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadContact(Number(req.params.id));
    if (!(await canAccessStudent(req.user!, Number(row.student_id)))) {
      throw forbidden('Contact hors de votre périmètre.');
    }
    const parsed = contactUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    if (q.occurredAt && q.occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw badRequest('La date du contact ne peut pas être dans le futur.');
    }

    const newStatus = q.followupStatus ?? (row.followup_status as string);
    const newDue =
      q.followupDueDate !== undefined ? q.followupDueDate : (row.followup_due_date as string | null);
    if ((newStatus === 'resolved' || newStatus === 'cancelled') && newDue === null && q.followupDueDate === undefined) {
      // autorisé : résolution sans nouvelle date
    }

    await getPool().query(
      `UPDATE parent_contact_logs SET
         occurred_at = ?, direction = ?, channel = ?, subject = ?, summary = ?,
         action_decided = ?, followup_due_date = ?, followup_status = ?, updated_by = ?
       WHERE id = ?`,
      [
        q.occurredAt ?? row.occurred_at,
        q.direction ?? row.direction,
        q.channel ?? row.channel,
        q.subject ?? row.subject,
        q.summary !== undefined ? q.summary : row.summary,
        q.actionDecided !== undefined ? q.actionDecided : row.action_decided,
        newDue,
        newStatus,
        req.user!.id,
        row.id,
      ]
    );

    const statusChanged = newStatus !== row.followup_status;
    const dueChanged = String(newDue ?? '') !== String(row.followup_due_date ?? '');
    if (statusChanged || dueChanged) {
      await getPool().query(
        `INSERT INTO parent_contact_followups (contact_id, followup_status, followup_due_date, changed_by)
         VALUES (?, ?, ?, ?)`,
        [row.id, newStatus, newDue, req.user!.id]
      );
      await writeAudit({
        actorId: req.user!.id,
        actorUsername: req.user!.username,
        action: 'parent_contact.followup_change',
        entityType: 'parent_contact_logs',
        entityId: row.id as number,
        details: { previousStatus: row.followup_status, newStatus, previousDue: row.followup_due_date, newDue },
      });
    } else {
      await writeAudit({
        actorId: req.user!.id,
        actorUsername: req.user!.username,
        action: 'parent_contact.edit',
        entityType: 'parent_contact_logs',
        entityId: row.id as number,
        details: { fields: Object.keys(q) },
      });
    }
    const updated = await loadContact(row.id as number);
    res.json({ data: publicContact(updated) });
  })
);

// ---------- Historique d'un élève ----------

parentContactsRouter.get(
  '/students/:studentId(\\d+)',
  requirePermission('parent_contacts.view'),
  asyncHandler(async (req, res) => {
    const studentId = Number(req.params.studentId);
    if (!(await canAccessStudent(req.user!, studentId))) {
      throw forbidden('Élève hors de votre périmètre.');
    }
    const parsed = contactListQuerySchema.safeParse({ ...req.query, studentId: undefined });
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const where: string[] = ['pcl.student_id = ?'];
    const params: unknown[] = [studentId];
    if (q.guardianId) {
      where.push('pcl.guardian_id = ?');
      params.push(q.guardianId);
    }
    if (q.subject) {
      where.push('pcl.subject = ?');
      params.push(q.subject);
    }
    if (q.status) {
      where.push('pcl.followup_status = ?');
      params.push(q.status);
    }
    if (q.from) {
      where.push('pcl.occurred_at >= ?');
      params.push(`${q.from} 00:00:00`);
    }
    if (q.to) {
      where.push('pcl.occurred_at <= ?');
      params.push(`${q.to} 23:59:59`);
    }
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM parent_contact_logs pcl WHERE ${where.join(' AND ')}`,
      params
    );
    const total = (countRows as RowDataPacket[])[0].total as number;
    const [rows] = await getPool().query(
      `SELECT pcl.*, u.username AS created_by_username,
              g.last_name AS guardian_last_name, g.first_names AS guardian_first_names
       FROM parent_contact_logs pcl
       JOIN guardians g ON g.id = pcl.guardian_id
       JOIN users u ON u.id = pcl.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY pcl.occurred_at DESC, pcl.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json({
      data: (rows as RowDataPacket[]).map((r) => ({
        ...publicContact(r),
        student_last_name: r.student_last_name,
        student_first_names: r.student_first_names,
        guardian_last_name: r.guardian_last_name,
        guardian_first_names: r.guardian_first_names,
      })),
      pagination: { page: q.page, pageSize: q.pageSize, total },
    });
  })
);
