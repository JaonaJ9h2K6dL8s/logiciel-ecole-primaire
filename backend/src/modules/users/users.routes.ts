import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound, forbidden } from '../../shared/errors';
import { hashPassword, validatePasswordStrength } from '../../shared/password';
import { revokeAllUserSessions } from '../../shared/session';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.string().trim().max(50).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'L’identifiant doit contenir au moins 3 caractères.')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Identifiant : lettres, chiffres, point, tiret et underscore uniquement.'),
  fullName: z.string().trim().min(2, 'Nom complet requis.').max(120),
  email: z.string().trim().max(150).email('Adresse électronique invalide.').optional().or(z.literal('')),
  roleCode: z.string().trim().min(1, 'Rôle requis.').max(50),
  password: z.string().min(1, 'Mot de passe requis.').max(128),
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().max(150).email('Adresse électronique invalide.').optional().or(z.literal('')),
  roleCode: z.string().trim().min(1).max(50).optional(),
});

const passwordResetSchema = z.object({
  newPassword: z.string().min(1, 'Nouveau mot de passe requis.').max(128),
});

function validateNewPassword(password: string): void {
  const weakness = validatePasswordStrength(password);
  if (weakness) {
    throw badRequest(weakness);
  }
}

async function getRoleByCode(conn: import('mysql2/promise').PoolConnection | import('mysql2/promise').Pool, code: string) {
  const [rows] = await conn.query('SELECT id, code, label FROM roles WHERE code = ? LIMIT 1', [code]);
  return (rows as { id: number; code: string; label: string }[])[0] ?? null;
}

export const usersRouter = Router();

usersRouter.use(requireAuth, requirePermission('users.manage'));

// Liste paginée + recherche + filtres
usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (q.search) {
      where.push('(u.username LIKE ? OR u.full_name LIKE ?)');
      const like = `%${q.search}%`;
      params.push(like, like);
    }
    if (q.role) {
      where.push('r.code = ?');
      params.push(q.role);
    }
    if (q.status) {
      where.push('u.is_active = ?');
      params.push(q.status === 'active' ? 1 : 0);
    }

    const whereSql = where.join(' AND ');
    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const offset = (q.page - 1) * q.pageSize;
    const [rows] = await getPool().query(
      `SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.last_login_at, u.created_at,
              r.code AS role_code, r.label AS role_label
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE ${whereSql}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

// Liste des rôles disponibles
usersRouter.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query('SELECT code, label FROM roles ORDER BY id');
    res.json({ data: rows });
  })
);

// Création d'un compte (mot de passe provisoire fourni par l'administrateur, jamais journalisé)
usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { username, fullName, email, roleCode, password } = parsed.data;
    validateNewPassword(password);

    const role = await getRoleByCode(getPool(), roleCode);
    if (!role) {
      throw badRequest('Rôle inconnu.');
    }

    const passwordHash = await hashPassword(password);
    const result = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO users (username, full_name, email, role_id, password_hash) VALUES (?, ?, ?, ?, ?)`,
        [username, fullName, email === '' ? null : email ?? null, role.id, passwordHash]
      );
      return (r as { insertId: number }).insertId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'users.create',
      entityType: 'user',
      entityId: result,
      details: { username, roleCode },
      ip: req.ip ?? null,
    });

    res.status(201).json({ id: result });
  })
);

// Modification (nom, e-mail, rôle)
usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Identifiant invalide.');

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { fullName, email, roleCode } = parsed.data;
    if (!fullName && !email && !roleCode) {
      throw badRequest('Aucune modification fournie.');
    }

    const [existing] = await getPool().query('SELECT id, username, role_id FROM users WHERE id = ? LIMIT 1', [userId]);
    const target = (existing as { id: number; username: string; role_id: number }[])[0];
    if (!target) throw notFound('Utilisateur introuvable.');

    let newRoleId: number | null = null;
    if (roleCode) {
      const role = await getRoleByCode(getPool(), roleCode);
      if (!role) throw badRequest('Rôle inconnu.');
      newRoleId = role.id;
    }

    // Un utilisateur ne peut pas modifier son propre rôle (pas d'auto-promotion)
    if (newRoleId !== null && target.id === req.user!.id && newRoleId !== target.role_id) {
      throw forbidden('Vous ne pouvez pas modifier votre propre rôle.');
    }

    await withTransaction(async (conn) => {
      if (fullName !== undefined) {
        await conn.query('UPDATE users SET full_name = ? WHERE id = ?', [fullName, userId]);
      }
      if (email !== undefined) {
        await conn.query('UPDATE users SET email = ? WHERE id = ?', [email === '' ? null : email, userId]);
      }
      if (newRoleId !== null) {
        await conn.query('UPDATE users SET role_id = ? WHERE id = ?', [newRoleId, userId]);
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'users.update',
      entityType: 'user',
      entityId: userId,
      details: {
        fullName: fullName ?? undefined,
        email: email === '' ? '(vide)' : email ?? undefined,
        roleCode: roleCode ?? undefined,
      },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);

// Activation / désactivation
usersRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const { active } = req.body as { active?: boolean };
    if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Identifiant invalide.');
    if (typeof active !== 'boolean') throw badRequest('Statut requis (actif true/false).');

    if (!active && userId === req.user!.id) {
      throw badRequest('Vous ne pouvez pas désactiver votre propre compte.');
    }

    const [rows] = await getPool().query(
      `SELECT u.id, u.username, u.is_active, u.role_id, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1`,
      [userId]
    );
    const target = (rows as { id: number; username: string; is_active: number; role_id: number; role_code: string }[])[0];
    if (!target) throw notFound('Utilisateur introuvable.');

    if (!active && target.role_code === 'admin') {
      // Protection du dernier administrateur actif
      const [admins] = await getPool().query(
        `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.code = 'admin' AND u.is_active = 1 AND u.id <> ?`,
        [userId]
      );
      const remaining = (admins as { n: number }[])[0].n;
      if (remaining === 0) {
        throw conflict('Impossible de désactiver le dernier administrateur actif.');
      }
    }

    await withTransaction(async (conn) => {
      await conn.query('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, userId]);
      if (!active) {
        // Révocation immédiate des sessions existantes
        await conn.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL', [userId]);
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: active ? 'users.activate' : 'users.deactivate',
      entityType: 'user',
      entityId: userId,
      details: { username: target.username },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);

// Réinitialisation d'accès : nouveau mot de passe + révocation des sessions
usersRouter.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Identifiant invalide.');

    const parsed = passwordResetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    validateNewPassword(parsed.data.newPassword);

    const [rows] = await getPool().query('SELECT id, username FROM users WHERE id = ? LIMIT 1', [userId]);
    const target = (rows as { id: number; username: string }[])[0];
    if (!target) throw notFound('Utilisateur introuvable.');

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await withTransaction(async (conn) => {
      await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
      await revokeAllUserSessions(userId);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'users.reset_password',
      entityType: 'user',
      entityId: userId,
      details: { username: target.username, sessionsRevoked: true },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);
