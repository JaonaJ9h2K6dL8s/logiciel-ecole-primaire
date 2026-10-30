import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { unauthorized } from '../../shared/errors';

/**
 * Session « Zone Élèves » : cookie httpOnly `student_zone` indépendant de la
 * session prof. Le payload est signé en HMAC-SHA256 (le secret dérive de la
 * configuration de session — SESSION_SECRET si fourni, sinon le nom du cookie
 * de session prof + le TTL) : aucun état en base, aucun impact sur la session
 * enseignant existante.
 */
export interface StudentZonePayload {
  kind: 'student';
  studentId: number;
  exp: number; // epoch ms
}

export const STUDENT_ZONE_COOKIE = 'student_zone';
export const STUDENT_ZONE_TTL_MS = 4 * 60 * 60 * 1000; // 4 h

const SECRET = crypto
  .createHash('sha256')
  .update(`student-zone:${process.env.SESSION_SECRET ?? env.cookieName}:${env.sessionTtlHours}`)
  .digest();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentZone?: StudentZonePayload;
    }
  }
}

function sign(value: string): string {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

export function serializeStudentZoneCookie(studentId: number): string {
  const payload: StudentZonePayload = {
    kind: 'student',
    studentId,
    exp: Date.now() + STUDENT_ZONE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function parseStudentZoneCookie(raw: string | undefined): StudentZonePayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StudentZonePayload;
    if (payload.kind !== 'student' || typeof payload.studentId !== 'number') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractStudentZoneToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === STUDENT_ZONE_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function cookieParts(value: string, expires?: string): string[] {
  const parts = [`${STUDENT_ZONE_COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (expires) parts.push(`Expires=${expires}`);
  if (env.cookieSecure) parts.push('Secure');
  return parts;
}

export function setStudentZoneCookie(res: Response, studentId: number): void {
  const exp = new Date(Date.now() + STUDENT_ZONE_TTL_MS);
  res.setHeader(
    'Set-Cookie',
    cookieParts(serializeStudentZoneCookie(studentId), exp.toUTCString()).join('; ')
  );
}

export function clearStudentZoneCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    cookieParts('', 'Thu, 01 Jan 1970 00:00:00 GMT').join('; ')
  );
}

/** 401 si le cookie `student_zone` est absent, falsifié ou expiré. */
export function requireStudentZone(req: Request, _res: Response, next: NextFunction): void {
  const payload = parseStudentZoneCookie(extractStudentZoneToken(req));
  if (!payload) {
    next(unauthorized('Session élève absente ou expirée.'));
    return;
  }
  req.studentZone = payload;
  next();
}
