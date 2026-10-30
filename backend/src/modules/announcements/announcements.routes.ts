import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import {
  announcementCreateSchema,
  announcementListQuerySchema,
  announcementUpdateSchema,
} from './announcements.schemas';

export const announcementsRouter = Router();

announcementsRouter.use(requireAuth);

interface Target {
  roleId: number | null;
  classId: number | null;
}

async function loadAnnouncement(id: number): Promise<RowDataPacket> {
  const [rows] = await getPool().query('SELECT * FROM school_announcements WHERE id = ?', [id]);
  const row = (rows as RowDataPacket[])[0];
  if (!row) throw notFound('Annonce introuvable.');
  return row;
}

async function loadTargets(announcementId: number): Promise<Target[]> {
  const [rows] = await getPool().query(
    'SELECT role_id, class_id FROM school_announcement_targets WHERE announcement_id = ?',
    [announcementId]
  );
  return (rows as RowDataPacket[]).map((r) => ({ roleId: r.role_id === null ? null : Number(r.role_id), classId: r.class_id === null ? null : Number(r.class_id) }));
}

async function validateTargets(targets: Target[]): Promise<void> {
  const roleIds = targets.map((t) => t.roleId).filter((r): r is number => r != null);
  const classIds = targets.map((t) => t.classId).filter((c): c is number => c != null);
  if (roleIds.length > 0) {
    const [rows] = await getPool().query(`SELECT id FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`, roleIds);
    if ((rows as RowDataPacket[]).length !== roleIds.length) throw badRequest('Rôle destinataire inconnu.');
  }
  if (classIds.length > 0) {
    const [rows] = await getPool().query(`SELECT id FROM classes WHERE id IN (${classIds.map(() => '?').join(',')})`, classIds);
    if ((rows as RowDataPacket[]).length !== classIds.length) throw badRequest('Classe destinataire inconnue.');
  }
}

/** Un professeur ne voit que les annonces ciblant son rôle ou ses classes affectées. */
async function teacherClassIds(userId: number): Promise<number[]> {
  const [rows] = await getPool().query(
    'SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL',
    [userId]
  );
  return (rows as RowDataPacket[]).map((r) => Number(r.class_id));
}

function isExpired(row: RowDataPacket): boolean {
  return row.expires_at !== null && new Date(row.expires_at as string).getTime() <= Date.now();
}

function publicAnnouncement(row: RowDataPacket, expired = false) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    authorId: row.author_id,
    expiresAt: row.expires_at,
    status: row.status,
    expired,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- Liste (visibilité côté serveur) ----------

announcementsRouter.get(
  '/',
  requirePermission('school_announcements.view'),
  asyncHandler(async (req, res) => {
    const parsed = announcementListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const isAdmin = req.user!.role_code === 'admin';
    const page = q.page;
    const pageSize = q.pageSize;
    const params: unknown[] = [];
    const where: string[] = [];

    if (isAdmin) {
      const status = q.status ?? 'all';
      if (status === 'expired') {
        where.push("a.status = 'published' AND a.expires_at IS NOT NULL AND a.expires_at <= NOW()");
      } else if (status !== 'all' && status) {
        where.push('a.status = ?');
        params.push(status);
      }
    } else {
      // Visibilité : publiée, non expirée, ciblée sur mon rôle ou mes classes.
      where.push(
        `a.status = 'published' AND a.published_at <= NOW()
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
         AND EXISTS (
           SELECT 1 FROM school_announcement_targets t
           WHERE t.announcement_id = a.id
             AND (t.role_id = ? OR t.class_id IN (
               SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL
             ))
         )`
      );
      params.push(req.user!.role_id, req.user!.id);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM school_announcements a ${whereSql}`, params);
    const total = (countRows as RowDataPacket[])[0].total as number;
    const [rows] = await getPool().query(
      `SELECT a.*, u.username AS author_username
       FROM school_announcements a JOIN users u ON u.id = a.author_id
       ${whereSql}
       ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({
      data: (rows as RowDataPacket[]).map((r) => ({ ...publicAnnouncement(r, isExpired(r)), author_username: r.author_username })),
      pagination: { page, pageSize, total },
    });
  })
);

// ---------- Création (brouillon) ----------

announcementsRouter.post(
  '/',
  requirePermission('school_announcements.manage'),
  asyncHandler(async (req, res) => {
    const parsed = announcementCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const targets: Target[] = q.targets.map((t) => ({ roleId: t.roleId ?? null, classId: t.classId ?? null }));
    await validateTargets(targets);

    const id = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO school_announcements (title, content, author_id, expires_at, status, created_by)
         VALUES (?, ?, ?, ?, 'draft', ?)`,
        [q.title, q.content, req.user!.id, q.expiresAt ?? null, req.user!.id]
      );
      const announcementId = (result as { insertId: number }).insertId;
      for (const t of targets) {
        await conn.query('INSERT INTO school_announcement_targets (announcement_id, role_id, class_id) VALUES (?, ?, ?)', [
          announcementId,
          t.roleId,
          t.classId,
        ]);
      }
      return announcementId;
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'announcement.create',
      entityType: 'school_announcements',
      entityId: id,
      details: { title: q.title, targetCount: targets.length },
    });
    const row = await loadAnnouncement(id);
    res.status(201).json({ data: publicAnnouncement(row) });
  })
);

// Référentiels pour le ciblage des annonces (réservé à la gestion)
announcementsRouter.get(
  '/context',
  requirePermission('school_announcements.manage'),
  asyncHandler(async (_req, res) => {
    const [roles] = await getPool().query('SELECT id, code, label FROM roles ORDER BY id');
    const [classes] = await getPool().query(
      `SELECT c.id, c.name, c.school_year_id AS schoolYearId, sy.label AS schoolYearLabel
       FROM classes c JOIN school_years sy ON sy.id = c.school_year_id
       ORDER BY sy.start_date DESC, c.name`
    );
    res.json({ data: { roles: roles as RowDataPacket[], classes: classes as RowDataPacket[] } });
  })
);

// ---------- Détail (respecte la visibilité) ----------

announcementsRouter.get(
  '/:id(\\d+)',
  requirePermission('school_announcements.view'),
  asyncHandler(async (req, res) => {
    const row = await loadAnnouncement(Number(req.params.id));
    const isAdmin = req.user!.role_code === 'admin';
    const isAuthor = Number(row.author_id) === req.user!.id;
    const expired = isExpired(row);
    if (!isAdmin && !isAuthor) {
      if (row.status !== 'published' || expired) throw forbidden('Annonce non accessible.');
      const myClassIds = await teacherClassIds(req.user!.id);
      const targets = await loadTargets(row.id as number);
      const allowed = targets.some(
        (t) => t.roleId === req.user!.role_id || (t.classId !== null && myClassIds.includes(t.classId))
      );
      if (!allowed) throw forbidden('Annonce non destinée à votre profil.');
    }
    const targets = await loadTargets(row.id as number);
    res.json({ data: publicAnnouncement(row, expired), targets });
  })
);

// ---------- Modification (brouillon libre, publiée limitée) ----------

announcementsRouter.patch(
  '/:id(\\d+)',
  requirePermission('school_announcements.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadAnnouncement(Number(req.params.id));
    if (row.status === 'archived') throw badRequest('Annonce archivée non modifiable.');
    const parsed = announcementUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    if (row.status === 'published' && (q.title !== undefined || q.content !== undefined || q.targets !== undefined)) {
      throw badRequest('Une annonce publiée ne peut être modifiée que sur sa date d’expiration.');
    }
    const targets: Target[] | null = q.targets ? q.targets.map((t) => ({ roleId: t.roleId ?? null, classId: t.classId ?? null })) : null;
    if (targets) await validateTargets(targets);

    await withTransaction(async (conn) => {
      await conn.query(
        'UPDATE school_announcements SET title = ?, content = ?, expires_at = ?, updated_by = ? WHERE id = ?',
        [q.title ?? row.title, q.content ?? row.content, q.expiresAt !== undefined ? q.expiresAt : row.expires_at, req.user!.id, row.id]
      );
      if (targets) {
        await conn.query('DELETE FROM school_announcement_targets WHERE announcement_id = ?', [row.id]);
        for (const t of targets) {
          await conn.query('INSERT INTO school_announcement_targets (announcement_id, role_id, class_id) VALUES (?, ?, ?)', [
            row.id,
            t.roleId,
            t.classId,
          ]);
        }
      }
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'announcement.update',
      entityType: 'school_announcements',
      entityId: row.id as number,
      details: { fields: Object.keys(q) },
    });
    const updated = await loadAnnouncement(row.id as number);
    res.json({ data: publicAnnouncement(updated, isExpired(updated)) });
  })
);

// ---------- Publication ----------

announcementsRouter.post(
  '/:id(\\d+)/publish',
  requirePermission('school_announcements.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadAnnouncement(Number(req.params.id));
    if (row.status !== 'draft') throw badRequest('Seul un brouillon peut être publié.');
    const targets = await loadTargets(row.id as number);
    if (targets.length === 0) throw badRequest('Définissez au moins un destinataire avant de publier.');
    await getPool().query(
      "UPDATE school_announcements SET status = 'published', published_at = NOW(), updated_by = ? WHERE id = ?",
      [req.user!.id, row.id]
    );
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'announcement.publish',
      entityType: 'school_announcements',
      entityId: row.id as number,
    });
    const updated = await loadAnnouncement(row.id as number);
    res.json({ data: publicAnnouncement(updated) });
  })
);

// ---------- Archivage ----------

announcementsRouter.post(
  '/:id(\\d+)/archive',
  requirePermission('school_announcements.manage'),
  asyncHandler(async (req, res) => {
    const row = await loadAnnouncement(Number(req.params.id));
    if (row.status === 'archived') throw badRequest('Annonce déjà archivée.');
    await getPool().query("UPDATE school_announcements SET status = 'archived', updated_by = ? WHERE id = ?", [
      req.user!.id,
      row.id,
    ]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'announcement.archive',
      entityType: 'school_announcements',
      entityId: row.id as number,
    });
    const updated = await loadAnnouncement(row.id as number);
    res.json({ data: publicAnnouncement(updated) });
  })
);
