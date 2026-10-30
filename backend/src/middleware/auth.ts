import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { unauthorized, forbidden } from '../shared/errors';
import { findValidSession, loadSessionUser, SessionUser } from '../shared/session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === env.cookieName) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/** Vérifie le cookie de session et charge l'utilisateur actif + ses permissions. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      next(unauthorized('Session absente ou expirée.'));
      return;
    }
    const session = await findValidSession(token);
    if (!session) {
      next(unauthorized('Session invalide ou expirée.'));
      return;
    }
    const user = await loadSessionUser(session.user_id);
    if (!user) {
      next(unauthorized('Compte inexistant ou désactivé.'));
      return;
    }
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Contrôle serveur des permissions sur chaque route protégée. */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!req.user.permissions.includes(permission)) {
      next(forbidden('Vous n’avez pas la permission d’effectuer cette action.'));
      return;
    }
    next();
  };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const parts = [
    `${env.cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  const parts = [
    `${env.cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (env.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
