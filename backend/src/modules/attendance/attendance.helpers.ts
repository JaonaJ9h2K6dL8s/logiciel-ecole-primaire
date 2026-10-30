import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../../database/pool';
import { forbidden, notFound, badRequest } from '../../shared/errors';

export interface AuthUserLike {
  id: number;
  role_code: string;
}

/**
 * Contrôle d'accès aux classes pour l'appel :
 * - un professeur ne peut agir que sur les classes qui lui sont affectées
 *   (affectation en cours, table teacher_class_assignments) ;
 * - les autres rôles autorisés (admin) accèdent à toutes les classes.
 * L'identifiant de classe envoyé par le navigateur n'est jamais une autorisation
 * en soi : tout est revérifié côté serveur.
 */
export async function assertClassAccess(
  conn: PoolConnection | ReturnType<typeof getPool>,
  user: AuthUserLike,
  classId: number
): Promise<void> {
  if (user.role_code !== 'teacher') return; // admin / autre rôle autorisé : accès global
  const [rows] = await conn.query(
    `SELECT 1 FROM teacher_class_assignments
     WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL
     LIMIT 1`,
    [user.id, classId]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Vous n’êtes pas affecté à cette classe.');
  }
}

/** Classes accessibles pour l'appel : affectations du professeur, ou toutes (admin). */
export async function accessibleClassFilter(
  conn: PoolConnection | ReturnType<typeof getPool>,
  user: AuthUserLike,
  classColumn = 'class_id'
): Promise<{ sql: string; params: unknown[] }> {
  if (user.role_code !== 'teacher') {
    return { sql: '1=1', params: [] };
  }
  return {
    sql: `${classColumn} IN (SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL)`,
    params: [user.id],
  };
}

/** Élèves réellement inscrits dans la classe à la date de la séance. */
export async function rosterForSession(
  conn: PoolConnection | ReturnType<typeof getPool>,
  classId: number,
  schoolYearId: number,
  sessionDate: string
): Promise<{ id: number; matricule: string; last_name: string; first_names: string }[]> {
  const [rows] = await conn.query(
    `SELECT s.id, s.matricule, s.last_name, s.first_names
     FROM students s
     WHERE s.status = 'active' AND s.id IN (
       SELECT e.student_id FROM enrollments e
       WHERE e.class_id = ? AND e.school_year_id = ?
         AND e.enrollment_date <= ?
         AND (e.exit_date IS NULL OR e.exit_date >= ?)
     )
     ORDER BY s.last_name, s.first_names, s.matricule`,
    [classId, schoolYearId, sessionDate, sessionDate]
  );
  return rows as { id: number; matricule: string; last_name: string; first_names: string }[];
}

/** Charge une séance et vérifie les droits d'accès du rôle courant. */
export async function loadSessionForUser(
  conn: PoolConnection | ReturnType<typeof getPool>,
  user: AuthUserLike,
  sessionId: number
): Promise<{ id: number; class_id: number; school_year_id: number; session_date: string; slot: number; status: 'draft' | 'submitted'; teacher_id: number | null }> {
  const [rows] = await conn.query(
    `SELECT id, class_id, school_year_id, session_date, slot, status, teacher_id
     FROM attendance_sessions WHERE id = ? LIMIT 1`,
    [sessionId]
  );
  const session = (rows as { id: number; class_id: number; school_year_id: number; session_date: string; slot: number; status: 'draft' | 'submitted'; teacher_id: number | null }[])[0];
  if (!session) throw notFound('Séance introuvable.');
  await assertClassAccess(conn, user, session.class_id);
  return session;
}

/** Validation des statuts saisis : EXCUSED exige une justification. */
export function validateRecordInputs(
  records: { studentId: number; status: string; comment?: string }[]
): void {
  for (const r of records) {
    if (r.status === 'EXCUSED' && !(r.comment && r.comment.trim().length >= 3)) {
      throw badRequest(
        `Justification obligatoire pour l'absence justifiée (élève #${r.studentId}).`
      );
    }
  }
}
