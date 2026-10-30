import mysql from 'mysql2/promise';
import { env, APP_TZ_OFFSET } from '../config/env';
import { SqlitePool } from './sqlite';

let pool: mysql.Pool | null = null;
let sqlitePool: SqlitePool | null = null;

/** Pilote actif : SQLite (fichier local) par défaut, MariaDB si DB_CLIENT=mysql. */
export function isSqlite(): boolean {
  return env.db.client !== 'mysql';
}

export function getPool(): mysql.Pool {
  if (isSqlite()) {
    // L'adaptateur SQLite expose la même surface d'appel que mysql2 ; le cast
    // est centralisé ici afin que les modules restent inchangés.
    if (!sqlitePool) sqlitePool = new SqlitePool();
    return sqlitePool as unknown as mysql.Pool;
  }
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      namedPlaceholders: false,
      // Cohérence des horodatages avec Indian/Antananarivo (UTC+3)
      timezone: APP_TZ_OFFSET,
      charset: 'utf8mb4',
      multipleStatements: false,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (sqlitePool) {
    await sqlitePool.close();
    sqlitePool = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function checkDatabase(): Promise<boolean> {
  try {
    if (isSqlite() && sqlitePool) return await sqlitePool.check();
    const conn = await getPool().getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch {
    return false;
  }
}

export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  if (isSqlite()) {
    if (!sqlitePool) sqlitePool = new SqlitePool();
    return sqlitePool.withTransaction(fn as unknown as Parameters<typeof sqlitePool.withTransaction<T>>[0]);
  }
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // la connexion est déjà rompue
    }
    throw err;
  } finally {
    conn.release();
  }
}
