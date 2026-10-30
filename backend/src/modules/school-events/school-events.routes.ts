import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import {
  attendanceSetSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  eventCreateSchema,
  eventListQuerySchema,
  eventStatusSchema,
  eventUpdateSchema,
  participantsSetSchema,
} from './school-events.schemas';

export const schoolEventsRouter = Router();
export const schoolEventCategoriesRouter = Router();

schoolEventsRouter.use(requireAuth);
schoolEventCategoriesRouter.use(requireAuth);

async function loadEvent(id: number): Promise<RowDataPacket> {
  const [rows] = await getPool().query('SELECT * FROM school_events WHERE id = ?', [id]);
  const row = (rows as RowDataPacket[])[0];
  if (!row) throw notFound('Événement introuvable.');
  return row;
}
/** Les classes d'un événement doivent appartenir à l'année scolaire de l'événement. */
async function assertClassesInYear(schoolYearId: number, classIds: number[]): Promise<void> {
  if (classIds.length === 0) return;
  const [rows] = await getPool().query(
    `SELECT id FROM classes WHERE id IN (${classIds.map(() => '?').join(',')}) AND school_year_id = ?`,
    [...classIds, schoolYearId]
  );
  if ((rows as RowDataPacket[]).length !== classIds.length) {
    throw badRequest('Une ou plusieurs classes n’appartiennent pas à l’année scolaire de l’événement.');
  }
}

function publicEvent(row: RowDataPacket) {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location,
    schoolYearId: row.school_year_id,
    audience: row.audience,
    organizerId: row.organizer_id,
    logistics: row.logistics,
    budgetEstimated: row.budget_estimated,
    status: row.status,
    summary: row.summary,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- Catégories ----------

schoolEventCategoriesRouter.get(
  '/',
  requirePermission('school_events.view'),
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query(
      'SELECT id, name, color, sort_order AS sortOrder, is_active AS isActive FROM school_event_categories ORDER BY sort_order, name'
    );
    res.json({ data: rows });
  })
);

schoolEventCategoriesRouter.post(
  '/',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { name, color, sortOrder } = parsed.data;
    try {
      const [result] = await getPool().query(
        'INSERT INTO school_event_categories (name, color, sort_order) VALUES (?, ?, ?)',
        [name, color ?? null, sortOrder]
      );
      const id = (result as { insertId: number }).insertId;
      await writeAudit({
        actorId: req.user!.id,
        actorUsername: req.user!.username,
        action: 'event_category.create',
        entityType: 'school_event_categories',
        entityId: id,
        details: { name },
      });
      res.status(201).json({ data: { id, name, color, sortOrder, isActive: 1 } });
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw badRequest('Une catégorie porte déjà ce nom.');
      }
      throw err;
    }
  })
);

schoolEventCategoriesRouter.patch(
  '/:id(\\d+)',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const [rows] = await getPool().query('SELECT * FROM school_event_categories WHERE id = ?', [req.params.id]);
    const row = (rows as RowDataPacket[])[0];
    if (!row) throw notFound('Catégorie introuvable.');
    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    await getPool().query(
      'UPDATE school_event_categories SET name = ?, color = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [
        q.name ?? row.name,
        q.color !== undefined ? q.color : row.color,
        q.sortOrder ?? row.sort_order,
        q.isActive !== undefined ? (q.isActive ? 1 : 0) : row.is_active,
        row.id,
      ]
    );
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'event_category.update',
      entityType: 'school_event_categories',
      entityId: row.id as number,
      details: { fields: Object.keys(q) },
    });
    res.json({ data: { id: row.id } });
  })
);

// ---------- Événements : liste et à venir ----------

schoolEventsRouter.get(
  '/',
  requirePermission('school_events.view'),
  asyncHandler(async (req, res) => {
    const parsed = eventListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const scope = eventScopeSql(await teacherClassIds(req.user!));
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (q.status) {
      where.push('e.status = ?');
      params.push(q.status);
    }
    if (q.categoryId) {
      where.push('e.category_id = ?');
      params.push(q.categoryId);
    }
    if (q.organizerId) {
      where.push('e.organizer_id = ?');
      params.push(q.organizerId);
    }
    if (q.classId) {
      where.push('e.id IN (SELECT event_id FROM school_event_classes WHERE class_id = ?)');
      params.push(q.classId);
    }
    if (q.from) {
      where.push('e.end_at >= ?');
      params.push(`${q.from} 00:00:00`);
    }
    if (q.to) {
      where.push('e.start_at <= ?');
      params.push(`${q.to} 23:59:59`);
    }
    const whereSql = where.join(' AND ');
    // Le filtre de périmètre (scope.sql) est concaténé APRÈS la clause WHERE :
    // ses paramètres doivent donc venir après ceux des filtres.
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM school_events e WHERE ${whereSql}${scope.sql}`,
      [...params, ...scope.params]
    );
    const total = (countRows as RowDataPacket[])[0].total as number;
    const [rows] = await getPool().query(
      `SELECT e.*, c.name AS category_name, u.username AS organizer_username
       FROM school_events e
       JOIN school_event_categories c ON c.id = e.category_id
       LEFT JOIN users u ON u.id = e.organizer_id
       WHERE ${whereSql}${scope.sql}
       ORDER BY e.start_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [...params, ...scope.params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json({
      data: (rows as RowDataPacket[]).map((r) => ({
        ...publicEvent(r),
        category_name: r.category_name,
        organizer_username: r.organizer_username,
      })),
      pagination: { page: q.page, pageSize: q.pageSize, total },
    });
  })
);

// Route littérale avant /:id
schoolEventsRouter.get(
  '/upcoming',
  requirePermission('school_events.view'),
  asyncHandler(async (req, res) => {
    const scope = eventScopeSql(await teacherClassIds(req.user!));
    const [rows] = await getPool().query(
      `SELECT e.*, c.name AS category_name
       FROM school_events e
       JOIN school_event_categories c ON c.id = e.category_id
       WHERE e.status IN ('draft', 'planned') AND e.end_at >= NOW()${scope.sql}
       ORDER BY e.start_at ASC
       LIMIT 50`,
      scope.params
    );
    res.json({ data: (rows as RowDataPacket[]).map((r) => ({ ...publicEvent(r), category_name: r.category_name })) });
  })
);

// Référentiels pour les formulaires (années, classes, catégories actives)
schoolEventsRouter.get(
  '/context',
  requirePermission('school_events.view'),
  asyncHandler(async (req, res) => {
    const [years] = await getPool().query(
      'SELECT id, label, is_active AS isActive FROM school_years ORDER BY start_date DESC'
    );
    // Un professeur ne voit que ses classes affectées (cohérent avec la liste
    // et la création d'événements) ; l'admin voit tout le référentiel.
    const teacherClasses = await teacherClassIds(req.user!);
    let classesSql = `SELECT c.id, c.name, c.school_year_id AS schoolYearId, l.name AS levelName
       FROM classes c JOIN levels l ON l.id = c.level_id`;
    const classParams: unknown[] = [];
    if (req.user!.role_code !== 'admin') {
      if (teacherClasses.length === 0) {
        classesSql += ' WHERE 1=0';
      } else {
        classesSql += ` WHERE c.id IN (${teacherClasses.map(() => '?').join(',')})`;
        classParams.push(...teacherClasses);
      }
    }
    classesSql += ' ORDER BY l.order_index, c.name';
    const [classes] = await getPool().query(classesSql, classParams);
    const [categories] = await getPool().query(
      'SELECT id, name, color, sort_order AS sortOrder, is_active AS isActive FROM school_event_categories WHERE is_active = 1 ORDER BY sort_order, name'
    );
    let organizers: RowDataPacket[] = [];
    if (req.user && req.user.permissions.includes('school_events.manage')) {
      const [rows] = await getPool().query(
        `SELECT id, username, full_name FROM users WHERE is_active = 1 ORDER BY full_name, username LIMIT 500`
      );
      organizers = rows as RowDataPacket[];
    }
    res.json({
      data: {
        years: years as RowDataPacket[],
        classes: classes as RowDataPacket[],
        categories: categories as RowDataPacket[],
        organizers,
      },
    });
  })
);

// ---------- Création ----------

schoolEventsRouter.post(
  '/',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const parsed = eventCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    await assertClassesInYear(q.schoolYearId, q.classIds);
    await assertTeacherOwnsClasses(req.user!, q.classIds);
    if (q.organizerId) {
      const [org] = await getPool().query('SELECT 1 FROM users WHERE id = ?', [q.organizerId]);
      if ((org as unknown[]).length === 0) throw badRequest('Responsable inconnu.');
    }

    const id = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO school_events
           (title, category_id, description, start_at, end_at, location, school_year_id,
            audience, organizer_id, logistics, budget_estimated, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q.title,
          q.categoryId,
          q.description ?? null,
          q.startAt,
          q.endAt,
          q.location ?? null,
          q.schoolYearId,
          q.audience,
          q.organizerId ?? null,
          q.logistics ?? null,
          q.budgetEstimated ?? null,
          q.status,
          req.user!.id,
        ]
      );
      const eventId = (result as { insertId: number }).insertId;
      for (const classId of q.classIds) {
        await conn.query('INSERT INTO school_event_classes (event_id, class_id) VALUES (?, ?)', [eventId, classId]);
      }
      return eventId;
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.create',
      entityType: 'school_events',
      entityId: id,
      details: { title: q.title, classCount: q.classIds.length },
    });
    const row = await loadEvent(id);
    res.status(201).json({ data: publicEvent(row) });
  })
);

// ---------- Détail ----------

async function loadEventFull(id: number) {
  const row = await loadEvent(id);
  const [classes] = await getPool().query(
    `SELECT c.id, c.name FROM school_event_classes sec JOIN classes c ON c.id = sec.class_id WHERE sec.event_id = ? ORDER BY c.name`,
    [id]
  );
  const [participants] = await getPool().query(
    `SELECT sep.*, s.first_names AS student_first_names, s.last_name AS student_last_name
     FROM school_event_participants sep JOIN students s ON s.id = sep.student_id
     WHERE sep.event_id = ? ORDER BY s.last_name, s.first_names`,
    [id]
  );
  return {
    event: publicEvent(row),
    classes: classes as RowDataPacket[],
    participants: (participants as RowDataPacket[]).map((r) => ({
      studentId: Number(r.student_id),
      confirmed: Number(r.confirmed) === 1,
      attendance: r.attendance ?? 'unknown',
      notes: r.notes,
      recordedBy: r.recorded_by,
      student_last_name: r.student_last_name,
      student_first_names: r.student_first_names,
    })),
  };
}

/** Un professeur ne peut organiser un événement que pour ses classes affectées. */
async function assertTeacherOwnsClasses(
  user: { id: number; role_code: string },
  classIds: number[]
): Promise<void> {
  if (user.role_code === 'admin' || classIds.length === 0) return;
  const unique = Array.from(new Set(classIds));
  const [rows] = await getPool().query(
    `SELECT DISTINCT class_id FROM teacher_class_assignments
     WHERE teacher_id = ? AND class_id IN (${unique.map(() => '?').join(',')})`,
    [user.id, ...unique]
  );
  if ((rows as RowDataPacket[]).length !== unique.length) {
    throw forbidden('Événement hors de vos classes affectées.');
  }
}

/** Liste des classes affectées à un professeur (admin : toutes). */
async function teacherClassIds(user: { id: number; role_code: string }): Promise<number[]> {
  if (user.role_code === 'admin') return [];
  const [rows] = await getPool().query(
    'SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL',
    [user.id]
  );
  return (rows as RowDataPacket[]).map((r) => Number(r.class_id));
}

/** Condition SQL limitant un événement aux classes du professeur. */
function eventScopeSql(classIds: number[]): { sql: string; params: number[] } {
  if (classIds.length === 0) return { sql: '', params: [] };
  return {
    sql: ` AND EXISTS (SELECT 1 FROM school_event_classes sec
            WHERE sec.event_id = e.id AND sec.class_id IN (${classIds.map(() => '?').join(',')}))`,
    params: classIds,
  };
}

/**
 * Un professeur ne peut agir que sur un événement rattaché à ses classes
 * affectées (toutes les classes de l'événement, pas une partie). Un événement
 * sans classe rattachée reste réservé à l'administrateur.
 */
async function assertTeacherOwnsEvent(
  user: { id: number; role_code: string },
  eventId: number
): Promise<void> {
  if (user.role_code === 'admin') return;
  const [all] = await getPool().query(
    'SELECT COUNT(*) AS n FROM school_event_classes WHERE event_id = ?',
    [eventId]
  );
  const total = Number((all as RowDataPacket[])[0].n);
  if (total === 0) {
    throw forbidden('Événement hors de vos classes affectées.');
  }
  const [rows] = await getPool().query(
    `SELECT COUNT(DISTINCT sec.class_id) AS owned
     FROM school_event_classes sec
     JOIN teacher_class_assignments tca
       ON tca.class_id = sec.class_id AND tca.teacher_id = ? AND tca.assigned_to IS NULL
     WHERE sec.event_id = ?`,
    [user.id, eventId]
  );
  const owned = Number((rows as RowDataPacket[])[0].owned);
  if (owned !== total) {
    throw forbidden('Événement hors de vos classes affectées.');
  }
}

schoolEventsRouter.get(
  '/:id(\\d+)',
  requirePermission('school_events.view'),
  asyncHandler(async (req, res) => {
    const full = await loadEventFull(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, Number(full.event.id));
    res.json(full);
  })
);

// ---------- Modification ----------

schoolEventsRouter.patch(
  '/:id(\\d+)',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadEvent(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, row.id as number);
    if (row.status === 'archived') throw badRequest('Un événement archivé ne peut plus être modifié.');
    const parsed = eventUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const startAt = q.startAt ?? new Date(row.start_at as string);
    const endAt = q.endAt ?? new Date(row.end_at as string);
    if (endAt.getTime() <= startAt.getTime()) {
      throw badRequest('La fin doit être postérieure au début.');
    }
    const schoolYearId = q.schoolYearId ?? Number(row.school_year_id);
    const classIds = q.classIds;
    if (classIds) {
      await assertClassesInYear(schoolYearId, classIds);
      await assertTeacherOwnsClasses(req.user!, classIds);
    }

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE school_events SET
           title = ?, category_id = ?, description = ?, start_at = ?, end_at = ?, location = ?,
           school_year_id = ?, audience = ?, organizer_id = ?, logistics = ?, budget_estimated = ?,
           summary = ?, updated_by = ?
         WHERE id = ?`,
        [
          q.title ?? row.title,
          q.categoryId ?? row.category_id,
          q.description !== undefined ? q.description : row.description,
          startAt,
          endAt,
          q.location !== undefined ? q.location : row.location,
          schoolYearId,
          q.audience ?? row.audience,
          q.organizerId !== undefined ? q.organizerId : row.organizer_id,
          q.logistics !== undefined ? q.logistics : row.logistics,
          q.budgetEstimated !== undefined ? q.budgetEstimated : row.budget_estimated,
          q.summary !== undefined ? q.summary : row.summary,
          req.user!.id,
          row.id,
        ]
      );
      if (classIds) {
        await conn.query('DELETE FROM school_event_classes WHERE event_id = ?', [row.id]);
        for (const classId of classIds) {
          await conn.query('INSERT INTO school_event_classes (event_id, class_id) VALUES (?, ?)', [row.id, classId]);
        }
      }
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.update',
      entityType: 'school_events',
      entityId: row.id as number,
      details: { fields: Object.keys(q) },
    });
    const full = await loadEventFull(row.id as number);
    res.json(full);
  })
);

// ---------- Transitions de statut ----------

schoolEventsRouter.post(
  '/:id(\\d+)/cancel',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadEvent(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, row.id as number);
    if (row.status === 'archived') throw badRequest('Un événement archivé ne peut plus être annulé.');
    if (row.status === 'cancelled' || row.status === 'completed') {
      throw badRequest('Transition de statut non autorisée.');
    }
    const parsed = eventStatusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    await getPool().query('UPDATE school_events SET status = ?, updated_by = ? WHERE id = ?', [
      'cancelled',
      req.user!.id,
      row.id,
    ]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.cancel',
      entityType: 'school_events',
      entityId: row.id as number,
      details: { reason: parsed.data.reason ?? null },
    });
    const full = await loadEventFull(row.id as number);
    res.json(full);
  })
);

schoolEventsRouter.post(
  '/:id(\\d+)/complete',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadEvent(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, row.id as number);
    if (row.status !== 'planned' && row.status !== 'draft') {
      throw badRequest('Seuls un événement planifié ou un brouillon peuvent être marqués terminés.');
    }
    await getPool().query('UPDATE school_events SET status = ?, updated_by = ? WHERE id = ?', [
      'completed',
      req.user!.id,
      row.id,
    ]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.complete',
      entityType: 'school_events',
      entityId: row.id as number,
    });
    const full = await loadEventFull(row.id as number);
    res.json(full);
  })
);

schoolEventsRouter.post(
  '/:id(\\d+)/archive',
  requirePermission('school_events.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadEvent(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, row.id as number);
    if (row.status !== 'completed' && row.status !== 'cancelled') {
      throw badRequest('Seuls un événement terminé ou annulé peuvent être archivés.');
    }
    await getPool().query('UPDATE school_events SET status = ?, updated_by = ? WHERE id = ?', [
      'archived',
      req.user!.id,
      row.id,
    ]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.archive',
      entityType: 'school_events',
      entityId: row.id as number,
    });
    const full = await loadEventFull(row.id as number);
    res.json(full);
  })
);

// ---------- Participants ----------

schoolEventsRouter.put(
  '/:id(\\d+)/participants',
  requirePermission('school_events.manage_participants'),
  asyncHandler(async (req, res) => {
    const row = await loadEvent(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, row.id as number);
    if (row.status === 'archived' || row.status === 'cancelled') {
      throw badRequest('Les participants ne peuvent être modifiés que sur un événement actif.');
    }
    const parsed = participantsSetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const students = parsed.data.students;
    const ids = students.map((s) => s.studentId);
    if (new Set(ids).size !== ids.length) {
      throw badRequest('Doublon dans la liste des élèves.');
    }
    if (ids.length > 0) {
      const [rows] = await getPool().query(
        `SELECT id FROM students WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      if ((rows as RowDataPacket[]).length !== ids.length) {
        throw badRequest('Un ou plusieurs élèves sont inconnus.');
      }
    }
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM school_event_participants WHERE event_id = ?', [row.id]);
      for (const s of students) {
        await conn.query(
          'INSERT INTO school_event_participants (event_id, student_id, confirmed) VALUES (?, ?, ?)',
          [row.id, s.studentId, s.confirmed ? 1 : 0]
        );
      }
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.participants_set',
      entityType: 'school_events',
      entityId: row.id as number,
      details: { count: ids.length },
    });
    const full = await loadEventFull(row.id as number);
    res.json(full);
  })
);

// Présence constatée : saisie manuelle uniquement, jamais déduite de la classe.
schoolEventsRouter.put(
  '/:id(\\d+)/attendance',
  requirePermission('school_events.manage_participants'),
  asyncHandler(async (req, res) => {
    const row = await loadEvent(Number(req.params.id));
    await assertTeacherOwnsEvent(req.user!, row.id as number);
    if (row.status === 'archived') throw badRequest('Événement archivé.');
    const parsed = attendanceSetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    for (const entry of parsed.data.entries) {
      const [rows] = await getPool().query(
        'SELECT id FROM school_event_participants WHERE event_id = ? AND student_id = ?',
        [row.id, entry.studentId]
      );
      if ((rows as RowDataPacket[]).length === 0) {
        throw badRequest(`L’élève ${entry.studentId} n’est pas dans la liste des participants.`);
      }
    }
    await withTransaction(async (conn) => {
      for (const entry of parsed.data.entries) {
        await conn.query(
          'UPDATE school_event_participants SET attendance = ?, notes = ?, recorded_by = ? WHERE event_id = ? AND student_id = ?',
          [entry.attended, entry.notes ?? null, req.user!.id, row.id, entry.studentId]
        );
      }
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'school_event.attendance',
      entityType: 'school_events',
      entityId: row.id as number,
      details: { count: parsed.data.entries.length },
    });
    const full = await loadEventFull(row.id as number);
    res.json(full);
  })
);
