import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { getPool, isSqlite } from './pool';
import { env } from '../config/env';
import { translateMysqlToSqlite } from './sqlite';

/**
 * Exécuteur de migrations versionnées.
 * - Chaque migration est un fichier SQL NNN_nom.sql, appliquée une seule fois.
 * - Le journal schema_migrations garantit qu'une migration n'est jamais rejouée.
 * - Les fichiers sont écrits de façon idempotente (CREATE TABLE IF NOT EXISTS,
 *   INSERT ... ON DUPLICATE KEY) afin qu'une exécution interrompue puisse être relancée.
 * - MariaDB : connexion dédiée avec multipleStatements activé pour le runner.
 * - SQLite : les fichiers MySQL sont traduits à la volée (cf. database/sqlite.ts).
 */
export async function runMigrations(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) {
    throw new Error(`Dossier de migrations introuvable : ${dir}`);
  }

  const pool = getPool();

  if (isSqlite()) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )`
    );
  } else {
    await pool.query<mysql.RowDataPacket[]>(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  }

  const [appliedRows] = await pool.query<mysql.RowDataPacket[]>('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => String(r.filename)));

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();

  const executed: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');

    if (isSqlite()) {
      const translated = translateMysqlToSqlite(sql);
      try {
        // getConnection() -> SqliteConn, dont execScript gère les multi-instructions
        const conn = await pool.getConnection();
        await conn.query('SELECT 1');
        (conn as unknown as { execScript: (s: string) => void }).execScript(translated);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
        executed.push(file);
        console.log(`[migrate] appliquée : ${file}`);
      } catch (err) {
        const msg = (err as Error).message;
        // Idempotence SQLite : colonne/index déjà présent => migration déjà appliquée en partie
        if (/duplicate column name|already exists/i.test(msg)) {
          await pool.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
          executed.push(file);
          console.log(`[migrate] appliquée (éléments déjà présents) : ${file}`);
          continue;
        }
        throw new Error(`Échec de la migration ${file} : ${msg}`);
      }
      continue;
    }

    const conn = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      multipleStatements: true,
      charset: 'utf8mb4',
    });
    try {
      await conn.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      executed.push(file);
      console.log(`[migrate] appliquée : ${file}`);
    } catch (err) {
      throw new Error(`Échec de la migration ${file} : ${(err as Error).message}`);
    } finally {
      await conn.end();
    }
  }

  if (executed.length === 0) {
    console.log('[migrate] base déjà à jour.');
  }
  return executed;
}

// Exécution directe : npm run migrate
if (require.main === module) {
  const { env } = require('../config/env');
  runMigrations(env.migrationsDir)
    .then((files) => {
      console.log(`[migrate] terminé (${files.length} migration(s) appliquée(s)).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] erreur :', err.message);
      process.exit(1);
    });
}
