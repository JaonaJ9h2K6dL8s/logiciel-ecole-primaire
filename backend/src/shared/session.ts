import crypto from 'crypto';
import { getPool } from '../database/pool';
import { env } from '../config/env';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role_id: number;
  role_code: string;
  role_label: string;
  theme_preference: ThemePreference | null;
  permissions: string[];
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseDurationMs(hours: number): number {
  return hours * 3600 * 1000;
}

export async function createSession(
  userId: number,
  ip: string | null,
  userAgent: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + parseDurationMs(env.sessionTtlHours));
  await getPool().query(
    `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)`,
    [hashToken(token), userId, expiresAt, ip?.slice(0, 45) ?? null, userAgent?.slice(0, 255) ?? null]
  );
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await getPool().query(
    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL`,
    [hashToken(token)]
  );
}

export async function revokeAllUserSessions(userId: number): Promise<void> {
  await getPool().query(
    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

export async function purgeExpiredSessions(): Promise<void> {
  await getPool().query(`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at IS NOT NULL`);
}

export async function findValidSession(token: string): Promise<{ user_id: number } | null> {
  const [rows] = await getPool().query(
    `SELECT user_id FROM sessions
     WHERE id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [hashToken(token)]
  );
  const row = (rows as { user_id: number }[])[0];
  return row ?? null;
}

export async function loadSessionUser(userId: number): Promise<SessionUser | null> {
  const [rows] = await getPool().query(
    `SELECT u.id, u.username, u.full_name, u.email, u.theme_preference, r.id AS role_id, r.code AS role_code, r.label AS role_label
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.is_active = 1
     LIMIT 1`,
    [userId]
  );
  const user = (rows as { id: number; username: string; full_name: string; email: string | null; theme_preference: ThemePreference | null; role_id: number; role_code: string; role_label: string }[])[0];
  if (!user) return null;

  const [permRows] = await getPool().query(
    `SELECT DISTINCT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN users u2 ON u2.role_id = rp.role_id
     WHERE u2.id = ?`,
    [userId]
  );
  return { ...user, permissions: (permRows as { code: string }[]).map((p) => p.code) };
}
