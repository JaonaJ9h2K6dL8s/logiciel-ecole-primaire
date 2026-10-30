import 'dotenv/config';
import path from 'path';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

// Fuseau horaire de référence : Indian/Antananarivo (UTC+3, sans heure d'été)
export const APP_TZ_OFFSET = '+03:00';

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 4000),
  db: {
    // Pilote de base de données : 'sqlite' (fichier local, défaut) ou 'mysql' (MariaDB).
    client: (process.env.DB_CLIENT ?? 'sqlite').toLowerCase(),
    // Fichier SQLite (utilisé quand client = 'sqlite').
    file: process.env.DB_FILE
      ? path.resolve(process.env.DB_FILE)
      : path.resolve(__dirname, '..', '..', 'data', 'scolaire.db'),
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(process.env.DB_PORT ?? 3306),
    database: required('DB_NAME', 'scolaire'),
    user: required('DB_USER', 'scolaire_app'),
    password: required('DB_PASSWORD', ''),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  },
  // Session
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  cookieName: 'sco_session',
  // En production derrière HTTPS, activer Secure via COOKIE_SECURE=true
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  // Sécurité connexion
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES ?? 15),
  timezone: process.env.TZ ?? 'Indian/Antananarivo',
  migrationsDir: process.env.DB_MIGRATIONS_DIR
    ? path.resolve(process.env.DB_MIGRATIONS_DIR)
    : path.resolve(__dirname, '..', '..', '..', 'database', 'migrations'),
  // Matricules élèves : ELV-000001 (préfixe et padding configurables)
  matriculePrefix: process.env.MATRICULE_PREFIX ?? 'ELV',
  matriculePad: Number(process.env.MATRICULE_PAD ?? 6),
  // Inscriptions : refuser le dépassement de capacité quand true (règle documentée)
  enforceClassCapacity: process.env.ENFORCE_CLASS_CAPACITY !== 'false',
};
