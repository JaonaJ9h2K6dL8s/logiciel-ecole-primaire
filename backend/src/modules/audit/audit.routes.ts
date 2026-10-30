import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../database/pool';
import { asyncHandler } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(80).optional(),
  result: z.enum(['success', 'failure']).optional(),
  search: z.string().trim().max(100).optional(),
});

// Lecture seule : aucune route d'écriture n'est exposée.
export const auditRouter = Router();

auditRouter.use(requireAuth, requirePermission('audit.view'));

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = querySchema.parse(req.query);
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (q.action) {
      where.push('a.action = ?');
      params.push(q.action);
    }
    if (q.result) {
      where.push('a.result = ?');
      params.push(q.result);
    }
    if (q.search) {
      where.push('(a.actor_username LIKE ? OR a.action LIKE ? OR a.entity_id LIKE ?)');
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${whereSql}`, params);
    const total = (countRows as { total: number }[])[0].total;

    const [rows] = await getPool().query(
      `SELECT a.id, a.actor_id AS actorId, a.actor_username AS actorUsername, a.action,
              a.entity_type AS entityType, a.entity_id AS entityId, a.result,
              a.details, a.ip, a.created_at AS createdAt
       FROM audit_logs a
       WHERE ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

auditRouter.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
    res.json({ data: rows });
  })
);
