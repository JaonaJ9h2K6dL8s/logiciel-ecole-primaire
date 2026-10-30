import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../../database/pool';
import { forbidden } from '../../shared/errors';
import type { SessionUser } from '../../shared/session';

/**
 * Calculs du module bulletins — intégralement côté serveur.
 *
 * Règles (réutilise l'étape 4, inchangées) :
 * - moyenne matière = Σ(score/max × 20 × coef_évaluation) / Σ(coef_évaluations),
 *   seules les notes 'graded' participent ; sans note valide → NULL ;
 * - moyenne générale = Σ(moyenne matière × coefficient matière) /
 *   Σ(coefficients des matières prises en compte) ; une matière sans
 *   résultat valide n'entre jamais dans le dénominateur ; NULL si aucune
 *   matière évaluée ; arrondi final 2 décimales (demi supérieur).
 * - coefficient matière = class_subjects.coefficient ?? subjects.default_coefficient ?? 1.
 */
export interface SubjectLine {
  subjectId: number;
  subjectName: string;
  coefficient: number;
  average: number | null;
  evaluationsCount: number;
  gradingCount: number;
}

export interface ComputedCard {
  lines: SubjectLine[];
  generalAverage: number | null;
  totalCoefficient: number | null;
  subjectsGraded: number;
  subjectsTotal: number;
}

/** Matières actives rattachées à la classe, avec leur coefficient effectif. */
export async function loadClassSubjects(
  conn: PoolConnection,
  classId: number
): Promise<{ id: number; name: string; coefficient: number }[]> {
  const [rows] = await conn.query(
    `SELECT s.id, s.name,
            COALESCE(cs.coefficient, s.default_coefficient, 1) AS coefficient
     FROM class_subjects cs
     JOIN subjects s ON s.id = cs.subject_id
     WHERE cs.class_id = ? AND cs.is_active = 1 AND s.is_active = 1
     ORDER BY s.name, s.id`,
    [classId]
  );
  return (rows as { id: number; name: string; coefficient: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
    coefficient: Number(r.coefficient),
  }));
}

/** Moyenne de période d'un élève pour une matière (règle étape 4). */
async function subjectAverage(
  conn: PoolConnection,
  studentId: number,
  classId: number,
  subjectId: number,
  periodId: number
): Promise<{ average: number | null; evaluationsCount: number; gradingCount: number }> {
  const [asmRows] = await conn.query(
    `SELECT id, max_score, coefficient FROM assessments
     WHERE class_id = ? AND subject_id = ? AND grading_period_id = ?`,
    [classId, subjectId, periodId]
  );
  const assessments = asmRows as { id: number; max_score: string; coefficient: string }[];
  if (assessments.length === 0) {
    return { average: null, evaluationsCount: 0, gradingCount: 0 };
  }
  const ids = assessments.map((a) => a.id);
  const [gr] = await conn.query(
    `SELECT g.assessment_id, g.score FROM grades g
     WHERE g.assessment_id IN (?) AND g.student_id = ? AND g.grade_status = 'graded'`,
    [ids, studentId]
  );
  const graded = gr as { assessment_id: number; score: string }[];
  let weightedSum = 0;
  let coeffSum = 0;
  for (const a of assessments) {
    const g = graded.find((x) => x.assessment_id === a.id);
    if (g && g.score !== null) {
      weightedSum += (Number(g.score) / Number(a.max_score)) * 20 * Number(a.coefficient);
      coeffSum += Number(a.coefficient);
    }
  }
  return {
    average: coeffSum > 0 ? Math.round((weightedSum / coeffSum) * 100) / 100 : null,
    evaluationsCount: assessments.length,
    gradingCount: graded.length,
  };
}

/** Calcul complet du bulletin d'un élève pour une classe et une période. */
export async function computeCard(
  conn: PoolConnection,
  studentId: number,
  classId: number,
  periodId: number
): Promise<ComputedCard> {
  const subjects = await loadClassSubjects(conn, classId);
  const lines: SubjectLine[] = [];
  let weightedSum = 0;
  let coeffSum = 0;
  for (const s of subjects) {
    const r = await subjectAverage(conn, studentId, classId, s.id, periodId);
    if (r.average !== null) {
      weightedSum += r.average * s.coefficient;
      coeffSum += s.coefficient;
    }
    lines.push({
      subjectId: s.id,
      subjectName: s.name,
      coefficient: s.coefficient,
      average: r.average,
      evaluationsCount: r.evaluationsCount,
      gradingCount: r.gradingCount,
    });
  }
  return {
    lines,
    generalAverage: coeffSum > 0 ? Math.round((weightedSum / coeffSum) * 100) / 100 : null,
    totalCoefficient: coeffSum > 0 ? coeffSum : null,
    subjectsGraded: lines.filter((l) => l.average !== null).length,
    subjectsTotal: lines.length,
  };
}

/**
 * Anomalies bloquant la validation d'un bulletin :
 * - évaluations encore en brouillon pour la classe et la période ;
 * - matières rattachées sans aucune évaluation créée ;
 * - matières sans note valide.
 * Retourne la liste explicite (aucune validation si non vide).
 */
export async function cardAnomalies(
  conn: PoolConnection,
  classId: number,
  periodId: number,
  lines: SubjectLine[]
): Promise<string[]> {
  const anomalies: string[] = [];
  const [draftRows] = await conn.query(
    `SELECT COUNT(*) AS n FROM assessments
     WHERE class_id = ? AND grading_period_id = ? AND status = 'draft'`,
    [classId, periodId]
  );
  const draftCount = Number((draftRows as { n: number }[])[0].n);
  if (draftCount > 0) {
    anomalies.push(`${draftCount} évaluation(s) encore en brouillon pour cette classe et cette période.`);
  }
  for (const l of lines) {
    if (l.evaluationsCount === 0) {
      anomalies.push(`Matière « ${l.subjectName} » : aucune évaluation créée.`);
    } else if (l.average === null) {
      anomalies.push(`Matière « ${l.subjectName} » : aucune note valide.`);
    }
  }
  return anomalies;
}

/**
 * Statistiques de présence d'un élève sur la période — issues uniquement
 * des appels en classe (attendance_sessions / attendance_records), jamais
 * du pointage d'entrée. Chaque séance compte une fois (UNIQUE session,
 * student). 'incomplete' : séance de la période sans enregistrement pour
 * l'élève (donnée manquante, jamais déduite d'un pointage).
 */
export async function attendanceStats(
  conn: PoolConnection,
  studentId: number,
  classId: number,
  periodStart: string,
  periodEnd: string
): Promise<{
  present: number;
  absent: number;
  excused: number;
  late: number;
  incomplete: number;
}> {
  const [rows] = await conn.query(
    `SELECT ar.status, COUNT(*) AS n
     FROM attendance_sessions s
     JOIN attendance_records ar ON ar.session_id = s.id
     WHERE s.class_id = ? AND s.session_date BETWEEN ? AND ? AND ar.student_id = ?
     GROUP BY ar.status`,
    [classId, periodStart, periodEnd, studentId]
  );
  const byStatus = new Map(
    (rows as { status: string; n: number }[]).map((r) => [r.status, Number(r.n)])
  );
  // Séances de la période sans enregistrement pour cet élève.
  const [totalRows] = await conn.query(
    `SELECT COUNT(*) AS n FROM attendance_sessions
     WHERE class_id = ? AND session_date BETWEEN ? AND ?`,
    [classId, periodStart, periodEnd]
  );
  const totalSessions = Number((totalRows as { n: number }[])[0].n);
  const recorded = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].reduce(
    (acc, k) => acc + (byStatus.get(k) ?? 0),
    0
  );
  return {
    present: byStatus.get('PRESENT') ?? 0,
    absent: byStatus.get('ABSENT') ?? 0,
    excused: byStatus.get('EXCUSED') ?? 0,
    late: byStatus.get('LATE') ?? 0,
    incomplete: Math.max(0, totalSessions - recorded),
  };
}

/**
 * Autorisation professeur : affectation active à la classe.
 * (Les appréciations par matière exigent en plus la matière —
 * vérifiée par assertSubjectTaught ci-dessous.)
 */
export async function assertClassAccess(
  conn: PoolConnection,
  user: SessionUser,
  classId: number
): Promise<void> {
  if (user.role_code === 'admin') return;
  const [rows] = await conn.query(
    `SELECT 1 FROM teacher_class_assignments
     WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL LIMIT 1`,
    [user.id, classId]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Vous n’êtes pas affecté à cette classe.');
  }
}

/** Autorisation professeur pour une matière précise d'une classe (appréciation). */
export async function assertSubjectTaught(
  conn: PoolConnection,
  user: SessionUser,
  classId: number,
  subjectId: number
): Promise<void> {
  if (user.role_code === 'admin') return;
  await assertClassAccess(conn, user, classId);
  const [rows] = await conn.query(
    `SELECT teacher_id, is_active FROM class_subjects
     WHERE class_id = ? AND subject_id = ? LIMIT 1`,
    [classId, subjectId]
  );
  const cs = (rows as { teacher_id: number | null; is_active: number }[])[0];
  if (!cs || !cs.is_active) {
    throw forbidden('Cette matière n’est pas rattachée à cette classe.');
  }
  if (cs.teacher_id !== null && cs.teacher_id !== user.id) {
    throw forbidden('Cette matière est confiée à un autre professeur.');
  }
}

/** Élève de la classe inscrit à la fin de la période (roster du bulletin). */
export async function periodRoster(
  conn: PoolConnection,
  classId: number,
  periodEnd: string
): Promise<{ id: number; matricule: string; last_name: string; first_names: string }[]> {
  const [rows] = await conn.query(
    `SELECT s.id, s.matricule, s.last_name, s.first_names
     FROM enrollments e JOIN students s ON s.id = e.student_id
     WHERE e.class_id = ? AND e.enrollment_date <= ?
       AND (e.exit_date IS NULL OR e.exit_date >= ?) AND s.status = 'active'
     ORDER BY s.last_name, s.first_names, s.matricule`,
    [classId, periodEnd, periodEnd]
  );
  return rows as { id: number; matricule: string; last_name: string; first_names: string }[];
}

/** Chargement du pool brut (routes hors transaction). */
export function pool() {
  return getPool();
}
