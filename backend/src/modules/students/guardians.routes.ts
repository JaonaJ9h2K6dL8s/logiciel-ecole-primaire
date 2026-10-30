import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { createGuardianSchema, updateGuardianSchema } from './students.schemas';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const guardiansRouter = Router();

guardiansRouter.use(requireAuth, requirePermission('students.manage'));

// Liste paginée des responsables (recherche par nom ou téléphone)
guardiansRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];
    if (q.search) {
      where.push('(g.last_name LIKE ? OR g.first_names LIKE ? OR g.phone_main LIKE ?)');
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM guardians g WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const [rows] = await getPool().query(
      `SELECT g.id, g.last_name, g.first_names, g.relationship, g.phone_main AS phoneMain,
              g.phone_secondary AS phoneSecondary, g.email, g.address, g.status, g.created_at AS createdAt,
              (SELECT COUNT(*) FROM student_guardians sg WHERE sg.guardian_id = g.id) AS studentCount
       FROM guardians g
       WHERE ${whereSql}
       ORDER BY g.last_name ASC, g.first_names ASC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

guardiansRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createGuardianSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const v = parsed.data;

    const id = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO guardians (last_name, first_names, relationship, phone_main, phone_secondary, email, address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          v.lastName,
          v.firstNames,
          v.relationship,
          v.phoneMain,
          v.phoneSecondary ?? null,
          v.email ?? null,
          v.address ?? null,
        ]
      );
      return (r as { insertId: number }).insertId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'guardians.create',
      entityType: 'guardian',
      entityId: id,
      details: { lastName: v.lastName, relationship: v.relationship },
      ip: req.ip ?? null,
    });

    res.status(201).json({ id });
  })
);

guardiansRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = updateGuardianSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const v = parsed.data;

    const [rows] = await getPool().query('SELECT id FROM guardians WHERE id = ?', [id]);
    if ((rows as unknown[]).length === 0) throw notFound('Responsable introuvable.');

    const sets: string[] = [];
    const params: unknown[] = [];
    if (v.lastName !== undefined) {
      sets.push('last_name = ?');
      params.push(v.lastName);
    }
    if (v.firstNames !== undefined) {
      sets.push('first_names = ?');
      params.push(v.firstNames);
    }
    if (v.relationship !== undefined) {
      sets.push('relationship = ?');
      params.push(v.relationship);
    }
    if (v.phoneMain !== undefined) {
      sets.push('phone_main = ?');
      params.push(v.phoneMain);
    }
    if (v.phoneSecondary !== undefined) {
      sets.push('phone_secondary = ?');
      params.push(v.phoneSecondary);
    }
    if (v.email !== undefined) {
      sets.push('email = ?');
      params.push(v.email);
    }
    if (v.address !== undefined) {
      sets.push('address = ?');
      params.push(v.address);
    }
    if (v.status !== undefined) {
      sets.push('status = ?');
      params.push(v.status);
    }

    if (sets.length > 0) {
      params.push(id);
      await withTransaction(async (conn) => {
        await conn.query(`UPDATE guardians SET ${sets.join(', ')} WHERE id = ?`, params);
      });
    }

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'guardians.update',
      entityType: 'guardian',
      entityId: id,
      details: { fields: Object.keys(v) },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);
