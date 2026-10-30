import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest, unauthorized } from '../../shared/errors';
import { verifyPassword } from '../../shared/password';
import { createSession, revokeSession, parseDurationMs } from '../../shared/session';
import { setSessionCookie, clearSessionCookie, requireAuth } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { loginRateLimiter, registerLoginFailure, clearLoginFailures } from '../../shared/rateLimit';
import { env } from '../../config/env';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Identifiant requis.').max(50),
  password: z.string().min(1, 'Mot de passe requis.').max(128),
});

export const authRouter = Router();

authRouter.post(
  '/login',
  loginRateLimiter(env.loginMaxAttempts, env.loginLockMinutes),
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Identifiant et mot de passe requis.', parsed.error.flatten().fieldErrors);
    }
    const { username, password } = parsed.data;
    const ip = req.ip ?? null;

    const [rows] = await getPool().query(
      `SELECT u.id, u.username, u.password_hash, u.is_active, u.full_name, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.username = ? LIMIT 1`,
      [username]
    );
    const user = (rows as { id: number; username: string; password_hash: string; is_active: number; full_name: string; role_code: string }[])[0];

    const invalidCredentials = async () => {
      registerLoginFailure(username, ip ?? 'unknown', env.loginMaxAttempts, env.loginLockMinutes);
      await writeAudit({
        actorUsername: username,
        action: 'auth.login',
        result: 'failure',
        details: { reason: 'identifiants invalides' },
        ip,
      });
      throw unauthorized('Identifiant ou mot de passe incorrect.');
    };

    if (!user) {
      await invalidCredentials();
      return;
    }

    const passwordOk = await verifyPassword(user.password_hash, password);
    if (!passwordOk) {
      await invalidCredentials();
      return;
    }

    if (!user.is_active) {
      await writeAudit({
        actorUsername: username,
        action: 'auth.login',
        result: 'failure',
        details: { reason: 'compte désactivé' },
        ip,
      });
      throw unauthorized('Ce compte est désactivé. Contactez l’administrateur.');
    }

    const { token, expiresAt } = await createSession(user.id, ip, req.headers['user-agent'] ?? null);
    await getPool().query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    clearLoginFailures(username, ip ?? 'unknown');

    await writeAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip,
    });

    setSessionCookie(res, token, expiresAt);
    res.json({
      user: { id: user.id, username: user.username, fullName: user.full_name, roleCode: user.role_code },
      sessionDurationMs: parseDurationMs(env.sessionTtlHours),
    });
  })
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.sessionToken) {
      await revokeSession(req.sessionToken);
    }
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'auth.logout',
      entityType: 'user',
      entityId: req.user!.id,
      ip: req.ip ?? null,
    });
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

// Préférence de thème personnelle : chaque utilisateur ne modifie QUE la
// sienne — l'identifiant vient de la session authentifiée, jamais du corps
// de la requête (aucun userId accepté ici).
const themeSchema = z.object({
  preference: z.enum(['light', 'dark', 'system']),
});

authRouter.patch(
  '/me/theme',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = themeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Préférence de thème invalide (light, dark ou system).', parsed.error.flatten().fieldErrors);
    }
    await getPool().query('UPDATE users SET theme_preference = ? WHERE id = ?', [parsed.data.preference, req.user!.id]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'auth.theme_update',
      entityType: 'user',
      entityId: req.user!.id,
      details: { preference: parsed.data.preference },
    });
    const updated = await getPool().query('SELECT theme_preference FROM users WHERE id = ?', [req.user!.id]);
    const preference = (updated[0] as { theme_preference: 'light' | 'dark' | 'system' | null }[])[0].theme_preference;
    res.json({ themePreference: preference });
  })
);
