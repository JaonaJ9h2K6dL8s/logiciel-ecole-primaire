import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../../database/pool';
import { badRequest, forbidden, notFound } from '../../shared/errors';
import type { SessionUser } from '../../shared/session';

/**
 * Règle d'autorisation pédagogique côté serveur (jamais l'identifiant navigateur) :
 * - admin : accès global ;
 * - professeur : il faut une affectation de classe active (teacher_class_assignments)
 *   ET une matière rattachée à cette classe (class_subjects, active) dont le
 *   professeur désigné est absent ou est l'utilisateur lui-même.
 */
export async function assertSubjectAccess(
  conn: PoolConnection,
  user: SessionUser,
  classId: number,
  subjectId: number
): Promise<void> {
  if (user.role_code === 'admin') return;

  const [assignRows] = await conn.query(
    `SELECT 1 FROM teacher_class_assignments
     WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL LIMIT 1`,
    [user.id, classId]
  );
  if ((assignRows as unknown[]).length === 0) {
    throw forbidden('Vous n’êtes pas affecté à cette classe.');
  }

  const [csRows] = await conn.query(
    `SELECT teacher_id, is_active FROM class_subjects
     WHERE class_id = ? AND subject_id = ? LIMIT 1`,
    [classId, subjectId]
  );
  const cs = (csRows as { teacher_id: number | null; is_active: number }[])[0];
  if (!cs || !cs.is_active) {
    throw forbidden('Cette matière n’est pas rattachée à cette classe.');
  }
  if (cs.teacher_id !== null && cs.teacher_id !== user.id) {
    throw forbidden('Cette matière est confiée à un autre professeur.');
  }
}

/**
 * Filtre d'accès SQL des évaluations pour un professeur (étape 12, partagé avec
 * le module exams) :
 * - ses propres évaluations, OU
 * - évaluations d'une classe qui lui est affectée dont la matière ne désigne
 *   pas un autre professeur (class_subjects.teacher_id).
 */
export function teacherAssessmentsCondition(userId: number): string {
  return `(a.teacher_id = ?
    OR (a.class_id IN (SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL)
        AND NOT EXISTS (SELECT 1 FROM class_subjects cs
                        WHERE cs.class_id = a.class_id AND cs.subject_id = a.subject_id
                          AND cs.teacher_id IS NOT NULL AND cs.teacher_id <> ?)))`;
}

/** Vérifie l'existence et la cohérence d'une évaluation chargée. */
export interface AssessmentRow {
  id: number;
  class_id: number;
  subject_id: number;
  school_year_id: number;
  grading_period_id: number;
  title: string;
  assessment_type: 'homework' | 'quiz' | 'exam' | 'other' | 'composition' | 'ds';
  assessment_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  max_score: string;
  coefficient: string;
  teacher_id: number;
  description: string | null;
  status: 'draft' | 'submitted' | 'locked';
}

export async function loadAssessmentForUpdate(
  conn: PoolConnection,
  id: number
): Promise<AssessmentRow> {
  const [rows] = await conn.query('SELECT * FROM assessments WHERE id = ? FOR UPDATE', [id]);
  const row = (rows as AssessmentRow[])[0];
  if (!row) throw notFound('Évaluation introuvable.');
  return row;
}

/** Élèves à noter : inscrits dans la classe à la date de l'évaluation. */
export interface RosterRow {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
}

export async function rosterAtDate(
  conn: PoolConnection,
  classId: number,
  date: string
): Promise<RosterRow[]> {
  const [rows] = await conn.query(
    `SELECT s.id, s.matricule, s.last_name, s.first_names
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.class_id = ?
       AND e.enrollment_date <= ?
       AND (e.exit_date IS NULL OR e.exit_date >= ?)
       AND s.status = 'active'
     ORDER BY s.last_name, s.first_names, s.matricule`,
    [classId, date, date]
  );
  return rows as RosterRow[];
}

/** Période : existence + cohérence d'année + non verrouillée pour la saisie. */
export interface PeriodRow {
  id: number;
  school_year_id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_locked: number;
}

export async function loadPeriod(conn: PoolConnection, periodId: number): Promise<PeriodRow> {
  const [rows] = await conn.query(
    'SELECT id, school_year_id, name, DATE_FORMAT(start_date, "%Y-%m-%d") AS start_date, DATE_FORMAT(end_date, "%Y-%m-%d") AS end_date, is_locked FROM grading_periods WHERE id = ? LIMIT 1',
    [periodId]
  );
  const row = (rows as PeriodRow[])[0];
  if (!row) throw notFound('Période introuvable.');
  return row;
}

/** Contrôle du barème d'une note : 0 (zéro explicite) <= score <= max, numérique strict. */
export function validateScore(score: unknown, maxScore: number): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw badRequest('Note invalide : valeur numérique attendue.');
  }
  if (score < 0) throw badRequest('Note négative refusée.');
  if (score > maxScore) throw badRequest(`Note supérieure au barème (maximum ${maxScore}).`);
  return score;
}

/**
 * Épreuves de la même classe le même jour dont le créneau chevauche
 * [startTime, startTime + durationMinutes) — étape 12. Les épreuves sans
 * créneau signalent simplement la coexistence le même jour. Avertissement
 * uniquement : jamais un blocage automatique.
 */
export interface OverlapRow {
  id: number;
  title: string;
  start_time: string | null;
  duration_minutes: number | null;
  subject_name: string;
}

export async function findScheduleConflicts(
  conn: PoolConnection,
  classId: number,
  date: string,
  excludeId: number | null,
  startTime: string | null,
  durationMinutes: number | null
): Promise<OverlapRow[]> {
  const params: unknown[] = [classId, date];
  let excludeSql = '';
  if (excludeId !== null) {
    excludeSql = 'AND a.id <> ?';
    params.push(excludeId);
  }

  if (startTime && durationMinutes) {
    // startTime est utilisé dans les deux bornes de l'intervalle.
    params.push(startTime, durationMinutes, startTime);
    const [rows] = await conn.query(
      `SELECT a.id, a.title, TIME_FORMAT(a.start_time, '%H:%i') AS start_time,
              a.duration_minutes, sb.name AS subject_name
       FROM assessments a
       JOIN subjects sb ON sb.id = a.subject_id
       WHERE a.class_id = ? AND a.assessment_date = ? ${excludeSql}
         AND a.start_time IS NOT NULL AND a.duration_minutes IS NOT NULL
         AND (TIME_TO_SEC(a.start_time) < TIME_TO_SEC(?) + ? * 60)
         AND (TIME_TO_SEC(?) < TIME_TO_SEC(a.start_time) + a.duration_minutes * 60)`,
      params
    );
    return rows as OverlapRow[];
  }

  const [rows] = await conn.query(
    `SELECT a.id, a.title, TIME_FORMAT(a.start_time, '%H:%i') AS start_time,
            a.duration_minutes, sb.name AS subject_name
     FROM assessments a
     JOIN subjects sb ON sb.id = a.subject_id
     WHERE a.class_id = ? AND a.assessment_date = ? ${excludeSql}`,
    params
  );
  return rows as OverlapRow[];
}
