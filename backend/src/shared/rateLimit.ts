import type { Request, Response, NextFunction } from 'express';
import { tooManyRequests } from './errors';

interface Attempt {
  count: number;
  lockedUntil: number;
}

const attempts = new Map<string, Attempt>();

// Limitation des tentatives de connexion (mémoire process-local).
// Suffisante pour le déploiement réseau local mono-serveur de l'établissement.
// Les paramètres maxAttempts/lockMinutes sont consommés par registerLoginFailure.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loginRateLimiter(maxAttempts: number, lockMinutes: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const username = String((req.body as { username?: string })?.username ?? '').toLowerCase();
    const ip = req.ip ?? 'unknown';
    const key = `${ip}|${username}`;
    const now = Date.now();

    const entry = attempts.get(key);
    if (entry && entry.lockedUntil > now) {
      const seconds = Math.ceil((entry.lockedUntil - now) / 1000);
      next(tooManyRequests(`Trop de tentatives. Réessayez dans ${seconds} secondes.`));
      return;
    }
    next();
  };
}

export function registerLoginFailure(username: string, ip: string, maxAttempts: number, lockMinutes: number): void {
  const key = `${ip}|${String(username).toLowerCase()}`;
  const now = Date.now();
  const entry = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil < now) entry.count = 0; // le verrou a expiré, on repart de zéro
  entry.count += 1;
  if (entry.count >= maxAttempts) {
    entry.lockedUntil = now + lockMinutes * 60 * 1000;
    entry.count = 0;
  }
  attempts.set(key, entry);
}

export function clearLoginFailures(username: string, ip: string): void {
  attempts.delete(`${ip}|${String(username).toLowerCase()}`);
}
