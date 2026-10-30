import type { PoolConnection } from 'mysql2/promise';
import { getPool, withTransaction } from '../../database/pool';
import { badRequest, conflict, notFound } from '../../shared/errors';
import { env } from '../../config/env';
import { writeAudit } from '../../shared/audit';

export interface ClassRow {
  id: number;
  name: string;
  capacity: number | null;
  is_active: number;
  school_year_id: number;
}

export interface EnrollResult {
  enrollmentId: number;
  schoolYearId: number;
  classId: number;
  transferredFromClassId: number | null;
  completedPreviousYearIds: number[];
}

/**
 * Vérifications métier avant inscription (à exécuter DANS la transaction) :
 * - la classe existe et est active ;
 * - la capacité n'est pas dépassée (règle : refus HTTP 409 quand
 *   ENFORCE_CLASS_CAPACITY=true — défaut ; false = avertissement côté client seulement).
 */
export async function assertClassEnrollable(conn: PoolConnection, classId: number): Promise<ClassRow> {
  const [rows] = await conn.query(
    `SELECT id, name, capacity, is_active, school_year_id FROM classes WHERE id = ? FOR UPDATE`,
    [classId]
  );
  const cls = (rows as ClassRow[])[0];
  if (!cls) throw badRequest('Classe inconnue.');
  if (cls.is_active !== 1) throw conflict('Cette classe est inactive : inscription impossible.');

  if (env.enforceClassCapacity && cls.capacity !== null) {
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND status = 'active'`,
      [classId]
    );
    const n = (countRows as { n: number }[])[0].n;
    if (n >= cls.capacity) {
      throw conflict(
        `Capacité de la classe « ${cls.name} » atteinte (${n}/${cls.capacity}). Inscription refusée.`
      );
    }
  }
  return cls;
}

/**
 * Création d'une inscription avec gestion cohérente de l'historique :
 * - même année + même classe → conflit (double inscription) ;
 * - même année + classe différente → changement de classe : l'ancienne inscription
 *   est clôturée (status 'transferred'), jamais supprimée ;
 * - année différente encore active (réinscription) → clôturée en 'completed'.
 */
export async function createEnrollment(
  conn: PoolConnection,
  opts: {
    actorId: number;
    actorUsername: string;
    studentId: number;
    classId: number;
    enrollmentDate: string;
    ip?: string | null;
  }
): Promise<EnrollResult> {
  const { actorId, actorUsername, studentId, classId, enrollmentDate, ip } = opts;

  const [studentRows] = await conn.query('SELECT id, matricule FROM students WHERE id = ? FOR UPDATE', [studentId]);
  const student = (studentRows as { id: number; matricule: string }[])[0];
  if (!student) throw notFound('Élève introuvable.');

  const cls = await assertClassEnrollable(conn, classId);
  const yearId = cls.school_year_id;

  const [activeRows] = await conn.query(
    `SELECT id, class_id, school_year_id FROM enrollments WHERE student_id = ? AND status = 'active' FOR UPDATE`,
    [studentId]
  );
  const actives = activeRows as { id: number; class_id: number; school_year_id: number }[];

  let transferredFromClassId: number | null = null;
  const completedPreviousYearIds: number[] = [];

  for (const a of actives) {
    if (a.school_year_id === yearId) {
      if (a.class_id === classId) {
        throw conflict('Cet élève est déjà inscrit activement dans cette classe pour cette année scolaire.');
      }
      // Changement de classe en cours d'année
      await conn.query(
        `UPDATE enrollments SET status = 'transferred', exit_date = ?, exit_reason = 'Changement de classe' WHERE id = ?`,
        [enrollmentDate, a.id]
      );
      transferredFromClassId = a.class_id;
    } else {
      // Réinscription dans une nouvelle année : clôture de l'inscription précédente
      await conn.query(
        `UPDATE enrollments SET status = 'completed', exit_date = ?, exit_reason = 'Réinscription (nouvelle année scolaire)' WHERE id = ?`,
        [enrollmentDate, a.id]
      );
      completedPreviousYearIds.push(a.school_year_id);
    }
  }

  const [r] = await conn.query(
    `INSERT INTO enrollments (student_id, school_year_id, class_id, enrollment_date, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [studentId, yearId, classId, enrollmentDate]
  );
  const enrollmentId = (r as { insertId: number }).insertId;

  await writeAudit({
    actorId,
    actorUsername,
    action: 'enrollments.create',
    entityType: 'enrollment',
    entityId: enrollmentId,
    details: {
      studentId,
      matricule: student.matricule,
      classId,
      schoolYearId: yearId,
      transferredFrom: transferredFromClassId ?? undefined,
      closedPreviousYears: completedPreviousYearIds.length > 0 ? completedPreviousYearIds : undefined,
    },
    ip: ip ?? null,
  });

  return { enrollmentId, schoolYearId: yearId, classId, transferredFromClassId, completedPreviousYearIds };
}

/** Liste paginée/filtrée des élèves (utilisée par GET /students). */
export function buildStudentsQuery(opts: {
  search?: string;
  schoolYearId?: number | null;
  levelId?: number | null;
  classId?: number | null;
  status?: string | null;
  sortBy?: string | null;
  sortDir?: string | null;
}) {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  const joins = `
    LEFT JOIN enrollments ce ON ce.student_id = s.id AND ce.status = 'active'
    LEFT JOIN classes c ON c.id = ce.class_id
    LEFT JOIN levels l ON l.id = c.level_id
    LEFT JOIN school_years sy ON sy.id = c.school_year_id
    LEFT JOIN student_guardians sp ON sp.student_id = s.id AND sp.is_primary_contact = 1
    LEFT JOIN guardians g ON g.id = sp.guardian_id`;

  if (opts.search) {
    where.push('(s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ?)');
    const like = `%${opts.search}%`;
    params.push(like, like, like);
  }
  if (opts.schoolYearId) {
    where.push('c.school_year_id = ?');
    params.push(opts.schoolYearId);
  }
  if (opts.levelId) {
    where.push('c.level_id = ?');
    params.push(opts.levelId);
  }
  if (opts.classId) {
    where.push('c.id = ?');
    params.push(opts.classId);
  }
  if (opts.status) {
    where.push('s.status = ?');
    params.push(opts.status);
  }

  const sortColumns: Record<string, string> = {
    matricule: 's.matricule',
    last_name: 's.last_name',
    first_names: 's.first_names',
    birth_date: 's.birth_date',
    created_at: 's.created_at',
  };
  const sortBy = sortColumns[opts.sortBy ?? 'last_name'] ?? sortColumns.last_name;
  const sortDir = (opts.sortDir ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return { joins, whereSql: where.join(' AND '), params, orderBy: `${sortBy} ${sortDir}, s.id ASC` };
}

export async function countActiveEnrollments(classId: number): Promise<number> {
  const [rows] = await getPool().query(
    `SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND status = 'active'`,
    [classId]
  );
  return (rows as { n: number }[])[0].n;
}

export async function enrollInTransaction(
  opts: { actorId: number; actorUsername: string; studentId: number; classId: number; enrollmentDate: string; ip?: string | null }
) {
  return withTransaction((conn) => createEnrollment(conn, opts));
}
