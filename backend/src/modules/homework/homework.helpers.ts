import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../../database/pool';
import { forbidden, notFound } from '../../shared/errors';
import type { SessionUser } from '../../shared/session';

/** Connexion ou pool : les deux exposent query(). */
export type Conn = PoolConnection | Pool;

export interface HomeworkRow {
  id: number;
  school_year_id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  title: string;
  description: string | null;
  homework_type: string;
  publish_date: string | null;
  due_date: string | null;
  estimated_minutes: number | null;
  max_score: string | null;
  status: string;
  corrections_published: number;
  created_by: number;
}

/** Chargement d'un devoir existant (404 sinon). */
export async function loadHomework(id: number): Promise<HomeworkRow> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, school_year_id, class_id, subject_id, teacher_id, title, description,
            homework_type, DATE_FORMAT(publish_date, '%Y-%m-%d') AS publish_date,
            DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, estimated_minutes, max_score,
            status, corrections_published, created_by
     FROM homework WHERE id = ? LIMIT 1`,
    [id]
  );
  const row = (rows as unknown as HomeworkRow[])[0];
  if (!row) throw notFound('Devoir introuvable.');
  return row;
}

/** Consultation : admin, ou professeur affecté à la classe du devoir. */
export async function assertHomeworkAccess(conn: Conn, user: SessionUser, homework: HomeworkRow): Promise<void> {
  if (user.role_code === 'admin') return;
  const [rows] = await conn.query(
    `SELECT 1 FROM teacher_class_assignments
     WHERE teacher_id = ? AND class_id = ? AND school_year_id = ? AND assigned_to IS NULL LIMIT 1`,
    [user.id, homework.class_id, homework.school_year_id]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Vous n’êtes pas affecté à la classe de ce devoir.');
  }
}

/**
 * Gestion : admin, ou professeur affecté à la classe ET à la matière
 * (règles métier identiques à assertClassAccess / assertSubjectTaught).
 */
export async function assertHomeworkManage(
  conn: Conn,
  user: SessionUser,
  homework: HomeworkRow
): Promise<void> {
  await assertClassSubjectManage(conn, user, homework.class_id, homework.subject_id, homework.school_year_id);
}

/**
 * Gestion au niveau classe + matière : admin, ou professeur affecté à la
 * classe ET à la matière (règles métier identiques aux bulletins).
 */
export async function assertClassSubjectManage(
  conn: Conn,
  user: SessionUser,
  classId: number,
  subjectId: number,
  schoolYearId: number
): Promise<void> {
  if (user.role_code === 'admin') return;
  const [rows] = await conn.query(
    `SELECT 1 FROM teacher_class_assignments
     WHERE teacher_id = ? AND class_id = ? AND school_year_id = ? AND assigned_to IS NULL LIMIT 1`,
    [user.id, classId, schoolYearId]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Vous n’êtes pas affecté à cette classe.');
  }
  const [cs] = await conn.query(
    `SELECT teacher_id, is_active FROM class_subjects
     WHERE class_id = ? AND subject_id = ? LIMIT 1`,
    [classId, subjectId]
  );
  const csRow = (cs as { teacher_id: number | null; is_active: number }[])[0];
  if (!csRow || !csRow.is_active) {
    throw forbidden('Cette matière n’est pas rattachée à cette classe.');
  }
  if (csRow.teacher_id !== null && csRow.teacher_id !== user.id) {
    throw forbidden('Cette matière est confiée à un autre professeur.');
  }
}

/** Fragment SQL de scoping liste/calendrier pour un professeur. */
export function teacherScopeSql(user: SessionUser): { join: string; params: unknown[] } {
  if (user.role_code === 'admin') return { join: '', params: [] };
  return {
    join:
      ' AND EXISTS (SELECT 1 FROM teacher_class_assignments tca' +
      ' WHERE tca.class_id = hw.class_id AND tca.school_year_id = hw.school_year_id' +
      ' AND tca.teacher_id = ? AND tca.assigned_to IS NULL)',
    params: [user.id],
  };
}

/** Historique d'un changement de statut (devoir ou remise). */
export async function recordHistory(
  conn: Conn,
  homeworkId: number,
  studentId: number | null,
  oldStatus: string | null,
  newStatus: string,
  note: string | null,
  actorId: number
): Promise<void> {
  await conn.query(
    `INSERT INTO homework_status_history (homework_id, student_id, old_status, new_status, note, changed_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [homeworkId, studentId, oldStatus, newStatus, note, actorId]
  );
}

/** Les corrections (réponses attendues) sont-elles visibles pour cet utilisateur ? */
export function answersVisible(user: SessionUser, homework: HomeworkRow): boolean {
  if (user.role_code === 'admin') return true;
  if (homework.created_by === user.id) return true;
  return homework.corrections_published === 1;
}

/** Journalise le statut précédent pour tracer les modifications post-publication. */
export function statusChanged(oldStatus: string, newStatus: string): boolean {
  return oldStatus !== newStatus;
}

/** Total des points des questions d'un devoir (pour contrôler le barème). */
export async function questionsPointsTotal(conn: Conn, homeworkId: number): Promise<number | null> {
  const [rows] = await conn.query(
    `SELECT SUM(points) AS total FROM homework_questions
     WHERE homework_id = ? AND points IS NOT NULL`,
    [homeworkId]
  );
  const row = (rows as { total: string | number | null }[])[0];
  return row?.total === null || row?.total === undefined ? null : Number(row.total);
}
