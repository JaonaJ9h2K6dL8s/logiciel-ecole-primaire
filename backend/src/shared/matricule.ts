import { env } from '../config/env';
import { conflict } from './errors';

/**
 * Génération de matricule élève, côté serveur uniquement.
 * - Compteur atomique en base (matricule_counters) : l'UPDATE prend un verrou de
 *   ligne et sérialise les créations concurrentes ; aucune valeur n'est réutilisée,
 *   même en cas de rollback (trou éventuel, jamais de doublon).
 * - La contrainte UNIQUE sur students.matricule est le filet de sécurité final.
 */
export function formatMatricule(value: number): string {
  return `${env.matriculePrefix}-${String(value).padStart(env.matriculePad, '0')}`;
}

export async function nextStudentMatricule(conn: import('mysql2/promise').PoolConnection): Promise<string> {
  await conn.query(`UPDATE matricule_counters SET next_value = next_value + 1 WHERE scope = 'student'`);
  const [rows] = await conn.query(`SELECT next_value - 1 AS v FROM matricule_counters WHERE scope = 'student'`);
  const value = (rows as { v: number }[])[0].v;
  if (!Number.isInteger(value) || value < 1) {
    throw conflict('Compteur de matricules invalide.');
  }
  return formatMatricule(value);
}

/** Vérifie qu'un matricule fourni manuellement n'est pas déjà pris (usage interne). */
export async function assertMatriculeAvailable(conn: import('mysql2/promise').PoolConnection, matricule: string): Promise<void> {
  const [rows] = await conn.query('SELECT id FROM students WHERE matricule = ? LIMIT 1', [matricule]);
  if ((rows as unknown[]).length > 0) {
    throw conflict('Ce matricule est déjà attribué à un autre élève.');
  }
}
