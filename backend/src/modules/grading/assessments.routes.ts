import { Router } from 'express';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { toAppDateString } from '../../shared/time';
import {
  assessmentsListQuerySchema,
  assessmentCreateSchema,
  assessmentUpdateSchema,
  gradesSaveSchema,
  gradeCorrectionSchema,
} from './grading.schemas';
import {
  assertSubjectAccess,
  rosterAtDate,
  loadPeriod,
  validateScore,
  findScheduleConflicts,
  teacherAssessmentsCondition,
  type AssessmentRow,
  type OverlapRow,
} from './grading.helpers';

export const assessmentsRouter = Router();

assessmentsRouter.use(requireAuth);

const teacherAccessCondition = teacherAssessmentsCondition;

function isDupEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

/** Normalise une valeur TIME MySQL (« 08:30:00 ») en « HH:MM ». */
function fmtTime(t: unknown): string | null {
  if (t === null || t === undefined) return null;
  const s = typeof t === 'string' ? t : t instanceof Date ? t.toISOString().slice(11, 16) : String(t);
  return s.slice(0, 5);
}

/** Message d'avertissement pour une coexistence/chevauchement d'épreuves. */
function formatConflictWarning(c: OverlapRow, date?: string): string {
  const slot = c.start_time && c.duration_minutes ? ` (${c.start_time}, ${c.duration_minutes} min)` : '';
  const day = date ? ` le ${date}` : ' le même jour';
  return `Autre épreuve de la classe${day} : « ${c.title} » (${c.subject_name})${slot}.`;
}

const DATE_LIST = `DATE_FORMAT(a.assessment_date, '%Y-%m-%d') AS assessmentDate`;

async function assertAssessmentAccess(
  user: { id: number; role_code: string },
  assessment: AssessmentRow
): Promise<void> {
  if (user.role_code === 'admin') return;
  if (assessment.teacher_id === user.id) return;
  // Sinon : accès via affectation classe + matière non confiée à un autre prof
  const [rows] = await getPool().query(
    `SELECT 1
     WHERE EXISTS (SELECT 1 FROM teacher_class_assignments
                   WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL)
       AND NOT EXISTS (SELECT 1 FROM class_subjects
                       WHERE class_id = ? AND subject_id = ?
                         AND teacher_id IS NOT NULL AND teacher_id <> ?)`,
    [user.id, assessment.class_id, assessment.class_id, assessment.subject_id, user.id]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Évaluation non accessible (classe ou matière non autorisée).');
  }
}

// ---------- Liste des évaluations ----------
assessmentsRouter.get(
  '/',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const parsed = assessmentsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (req.user!.role_code !== 'admin') {
      where.push(teacherAccessCondition(req.user!.id));
      params.push(req.user!.id, req.user!.id, req.user!.id);
    }
    if (q.classId) {
      where.push('a.class_id = ?');
      params.push(q.classId);
    }
    if (q.subjectId) {
      where.push('a.subject_id = ?');
      params.push(q.subjectId);
    }
    if (q.schoolYearId) {
      where.push('a.school_year_id = ?');
      params.push(q.schoolYearId);
    }
    if (q.gradingPeriodId) {
      where.push('a.grading_period_id = ?');
      params.push(q.gradingPeriodId);
    }
    if (q.status) {
      where.push('a.status = ?');
      params.push(q.status);
    }
    if (q.assessmentType) {
      where.push('a.assessment_type = ?');
      params.push(q.assessmentType);
    }
    if (q.fromDate) {
      where.push('a.assessment_date >= ?');
      params.push(q.fromDate);
    }
    if (q.toDate) {
      where.push('a.assessment_date <= ?');
      params.push(q.toDate);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM assessments a WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const offset = (q.page - 1) * q.pageSize;
    const [rows] = await getPool().query(
      `SELECT a.id, a.class_id AS classId, c.name AS className,
              a.subject_id AS subjectId, sb.name AS subjectName,
              a.school_year_id AS schoolYearId, sy.label AS schoolYearLabel,
              a.grading_period_id AS gradingPeriodId, gp.name AS periodName,
              a.title, a.assessment_type AS assessmentType, ${DATE_LIST},
              TIME_FORMAT(a.start_time, '%H:%i') AS startTime,
              a.duration_minutes AS durationMinutes,
              a.max_score AS maxScore, a.coefficient,
              a.teacher_id AS teacherId, u.full_name AS teacherName,
              a.status,
              (SELECT COUNT(*) FROM grades g WHERE g.assessment_id = a.id AND g.grade_status = 'graded') AS gradedCount,
              (SELECT COUNT(*) FROM grades g WHERE g.assessment_id = a.id AND g.grade_status <> 'graded') AS pendingCount
       FROM assessments a
       JOIN classes c ON c.id = a.class_id
       JOIN subjects sb ON sb.id = a.subject_id
       JOIN school_years sy ON sy.id = a.school_year_id
       JOIN grading_periods gp ON gp.id = a.grading_period_id
       JOIN users u ON u.id = a.teacher_id
       WHERE ${whereSql}
       ORDER BY a.assessment_date DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

// ---------- Détail d'une évaluation + feuille de notes ----------
assessmentsRouter.get(
  '/:id',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT a.*, ${DATE_LIST.replace('a.', 'a.')}
         FROM assessments a WHERE a.id = ? LIMIT 1`,
        [id]
      );
      const assessment = (rows as AssessmentRow[])[0];
      if (!assessment) throw notFound('Évaluation introuvable.');
      await assertAssessmentAccess(req.user!, assessment);

      const roster = await rosterAtDate(conn, assessment.class_id, toAppDateString(assessment.assessment_date));
      const [gradeRows] = await conn.query(
        `SELECT g.student_id AS studentId, g.score, g.grade_status AS gradeStatus, g.comment,
                g.updated_at AS updatedAt
         FROM grades g WHERE g.assessment_id = ?`,
        [id]
      );
      const grades = (gradeRows as { studentId: number; score: string | null; gradeStatus: string; comment: string | null; updatedAt: Date }[]).map(
        (g) => ({ ...g, score: g.score === null ? null : Number(g.score) })
      );
      const [corrRows] = await conn.query(
        `SELECT gc.grade_id AS gradeId, gc.student_id AS studentId, gc.old_score AS oldScore,
                gc.new_score AS newScore, gc.old_status AS oldStatus, gc.new_status AS newStatus,
                gc.reason, gc.created_at AS createdAt, u.full_name AS correctedByName
         FROM grade_corrections gc JOIN users u ON u.id = gc.corrected_by
         WHERE gc.assessment_id = ? ORDER BY gc.created_at DESC LIMIT 100`,
        [id]
      );
      return { assessment, roster, grades, corrections: corrRows };
    });

    res.json({ data: result });
  })
);

// ---------- Création (professeur autorisé ou admin) ----------
assessmentsRouter.post(
  '/',
  requirePermission('assessments.manage'),
  asyncHandler(async (req, res) => {
    const parsed = assessmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const b = parsed.data;

    const { id, conflicts } = await withTransaction(async (conn) => {
      const period = await loadPeriod(conn, b.gradingPeriodId);
      if (period.is_locked) throw conflict('Période verrouillée : création interdite.');
      const schoolYearId = period.school_year_id;

      if (b.assessmentDate < period.start_date || b.assessmentDate > period.end_date) {
        throw badRequest(`La date de l’évaluation doit être comprise dans la période « ${period.name} » (${period.start_date} → ${period.end_date}).`);
      }

      const [clsRows] = await conn.query(
        'SELECT id, is_active, school_year_id FROM classes WHERE id = ? LIMIT 1',
        [b.classId]
      );
      const cls = (clsRows as { id: number; is_active: number; school_year_id: number }[])[0];
      if (!cls) throw notFound('Classe introuvable.');
      if (!cls.is_active) throw conflict('Cette classe est inactive.');
      if (cls.school_year_id !== schoolYearId) {
        throw conflict('La classe n’appartient pas à l’année scolaire de la période.');
      }

      await assertSubjectAccess(conn, req.user!, b.classId, b.subjectId);

      // Chevauchements éventuels le même jour : avertissement non bloquant.
      const conflicts = await findScheduleConflicts(
        conn,
        b.classId,
        b.assessmentDate,
        null,
        b.startTime || null,
        b.durationMinutes || null
      );

      try {
        const [ins] = await conn.query(
          `INSERT INTO assessments
             (class_id, subject_id, school_year_id, grading_period_id, title,
              assessment_type, assessment_date, start_time, duration_minutes,
              max_score, coefficient, teacher_id, description, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.classId, b.subjectId, schoolYearId, b.gradingPeriodId, b.title,
            b.assessmentType, b.assessmentDate, b.startTime || null, b.durationMinutes || null,
            b.maxScore, b.coefficient,
            req.user!.id, b.description || null, req.user!.id,
          ]
        );
        return { id: (ins as { insertId: number }).insertId, conflicts };
      } catch (err) {
        if (isDupEntry(err)) throw conflict('Une évaluation identique existe déjà (classe, matière, période, titre et date).');
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'assessments.create',
      entityType: 'assessment',
      entityId: id,
      details: { title: b.title, classId: b.classId, subjectId: b.subjectId },
      ip: req.ip ?? null,
    });

    res.status(201).json({
      data: { id, warnings: conflicts.map((c) => formatConflictWarning(c, b.assessmentDate)) },
      message: 'Évaluation créée (brouillon).',
    });
  })
);

// ---------- Modification (brouillon uniquement) ----------
assessmentsRouter.patch(
  '/:id',
  requirePermission('assessments.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = assessmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const b = parsed.data;
    if (Object.keys(b).length === 0) throw badRequest('Aucune modification fournie.');

    const conflicts = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM assessments WHERE id = ? FOR UPDATE', [id]);
      const a = (rows as AssessmentRow[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      if (a.teacher_id !== req.user!.id && req.user!.role_code !== 'admin') {
        throw forbidden('Seul le professeur responsable peut modifier cette évaluation.');
      }
      if (a.status !== 'draft') {
        throw conflict('Seule une évaluation en brouillon peut être modifiée. Utilisez la procédure de correction après verrouillage.');
      }

      const newMax = b.maxScore ?? Number(a.max_score);
      if (b.maxScore !== undefined) {
        const [exceed] = await conn.query(
          'SELECT COUNT(*) AS n FROM grades WHERE assessment_id = ? AND grade_status = ? AND score > ?',
          [id, 'graded', b.maxScore]
        );
        if ((exceed as { n: number }[])[0].n > 0) {
          throw badRequest('Nouveau barème trop bas : des notes saisies le dépassent déjà.');
        }
      }

      const newDate = b.assessmentDate ?? toAppDateString(a.assessment_date);
      if (b.assessmentDate !== undefined) {
        const [periodRows] = await conn.query(
          `SELECT name, DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, is_locked
           FROM grading_periods WHERE id = ? LIMIT 1`,
          [a.grading_period_id]
        );
        const period = (periodRows as { name: string; startDate: string; endDate: string; is_locked: number }[])[0];
        if (period.is_locked) throw conflict('Période verrouillée.');
        if (newDate < period.startDate || newDate > period.endDate) {
          throw badRequest(`La date doit rester dans la période « ${period.name} » (${period.startDate} → ${period.endDate}).`);
        }
      }

      // Créneau : les deux champs vont ensemble (heure sans durée ou l'inverse = erreur).
      const newStart = b.startTime !== undefined ? b.startTime || null : fmtTime(a.start_time);
      const newDuration = b.durationMinutes !== undefined ? b.durationMinutes || null : a.duration_minutes;
      if ((newStart && !newDuration) || (newDuration && !newStart)) {
        throw badRequest('Le créneau nécessite l’heure de début ET la durée (ou aucun des deux).');
      }

      // Chevauchements éventuels le même jour : avertissement non bloquant.
      const conflicts = await findScheduleConflicts(conn, a.class_id, newDate, id, newStart, newDuration);

      await conn.query(
        `UPDATE assessments SET title = ?, assessment_type = ?, assessment_date = ?,
                                start_time = ?, duration_minutes = ?,
                                max_score = ?, coefficient = ?, description = ?, updated_by = ?
         WHERE id = ?`,
        [
          b.title ?? a.title,
          b.assessmentType ?? a.assessment_type,
          newDate,
          newStart,
          newDuration,
          b.maxScore ?? a.max_score,
          b.coefficient ?? a.coefficient,
          b.description !== undefined ? b.description || null : a.description,
          req.user!.id,
          id,
        ]
      );
      return conflicts;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'assessments.update',
      entityType: 'assessment',
      entityId: id,
      details: { changes: b },
      ip: req.ip ?? null,
    });

    res.json({
      ok: true,
      data: { warnings: conflicts.map((c) => formatConflictWarning(c)) },
      message: 'Évaluation mise à jour.',
    });
  })
);

// ---------- Saisie groupée des notes (transactionnelle, tout ou rien) ----------
assessmentsRouter.put(
  '/:id/grades',
  requirePermission('grades.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = gradesSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const entries = parsed.data.grades;

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM assessments WHERE id = ? FOR UPDATE', [id]);
      const a = (rows as AssessmentRow[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      if (a.teacher_id !== req.user!.id && req.user!.role_code !== 'admin') {
        throw forbidden('Seul le professeur responsable peut saisir les notes de cette évaluation.');
      }
      if (a.status === 'locked') {
        throw conflict('Évaluation verrouillée : passez par la procédure de correction.');
      }

      const period = await loadPeriod(conn, a.grading_period_id);
      if (period.is_locked) throw conflict('Période verrouillée : saisie interdite.');

      const maxScore = Number(a.max_score);
      const roster = await rosterAtDate(conn, a.class_id, toAppDateString(a.assessment_date));
      const rosterIds = new Set(roster.map((s) => s.id));

      const invalidStudents = entries.filter((e) => !rosterIds.has(e.studentId)).map((e) => e.studentId);
      if (invalidStudents.length > 0) {
        throw badRequest('Élève(s) non inscrit(s) dans la classe à la date de l’évaluation.', {
          studentIds: invalidStudents,
        });
      }

      // Contrôles de barème : note numérique 0..max pour 'graded', pas de valeur
      // pour les autres statuts. Le zéro explicitement saisi est valide ; il ne
      // doit jamais être confondu avec une valeur vide ou une absence.
      for (const e of entries) {
        if (e.gradeStatus === 'graded') {
          if (e.score === null || e.score === undefined) {
            throw badRequest(`Note manquante pour l’élève ${e.studentId} (statut « noté »).`);
          }
          validateScore(e.score, maxScore);
        } else if (e.score !== null && e.score !== undefined) {
          throw badRequest(
            `Statut « ${e.gradeStatus} » pour l’élève ${e.studentId} : aucune valeur numérique ne doit accompagner ce statut.`
          );
        }
      }

      for (const e of entries) {
        await conn.query(
          `INSERT INTO grades (assessment_id, student_id, score, grade_status, comment, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE score = VALUES(score), grade_status = VALUES(grade_status),
                                   comment = VALUES(comment), updated_by = VALUES(updated_by)`,
          [
            id,
            e.studentId,
            e.gradeStatus === 'graded' ? e.score : null,
            e.gradeStatus,
            e.comment || null,
            req.user!.id,
            req.user!.id,
          ]
        );
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'grades.save',
      entityType: 'assessment',
      entityId: id,
      details: { count: entries.length }, // aucune note individuelle dans le journal
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: `${entries.length} note(s) enregistrée(s).` });
  })
);

// ---------- Soumission (fin de saisie) ----------
assessmentsRouter.post(
  '/:id/submit',
  requirePermission('assessments.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM assessments WHERE id = ? FOR UPDATE', [id]);
      const a = (rows as AssessmentRow[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      if (a.teacher_id !== req.user!.id && req.user!.role_code !== 'admin') {
        throw forbidden('Seul le professeur responsable peut soumettre cette évaluation.');
      }
      if (a.status !== 'draft') throw conflict('Seule une évaluation en brouillon peut être soumise.');

      const [graded] = await conn.query(
        `SELECT COUNT(*) AS n FROM grades WHERE assessment_id = ? AND grade_status <> 'not_graded'`,
        [id]
      );
      if ((graded as { n: number }[])[0].n === 0) {
        throw badRequest('Impossible de soumettre : aucune note ni statut saisi.');
      }

      const period = await loadPeriod(conn, a.grading_period_id);
      if (period.is_locked) throw conflict('Période verrouillée.');

      await conn.query(`UPDATE assessments SET status = 'submitted', updated_by = ? WHERE id = ?`, [
        req.user!.id,
        id,
      ]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'assessments.submit',
      entityType: 'assessment',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Évaluation soumise.' });
  })
);

// ---------- Verrouillage / déverrouillage (permission dédiée) ----------
assessmentsRouter.post(
  '/:id/lock',
  requirePermission('grades.lock'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT status FROM assessments WHERE id = ? FOR UPDATE', [id]);
      const a = (rows as { status: AssessmentRow['status'] }[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      if (a.status === 'locked') throw conflict('Évaluation déjà verrouillée.');
      if (a.status === 'draft') {
        throw conflict('Soumettez d’abord l’évaluation avant de la verrouiller.');
      }
      await conn.query(`UPDATE assessments SET status = 'locked', updated_by = ? WHERE id = ?`, [
        req.user!.id,
        id,
      ]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'assessments.lock',
      entityType: 'assessment',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Évaluation verrouillée.' });
  })
);

assessmentsRouter.post(
  '/:id/unlock',
  requirePermission('grades.lock'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT status FROM assessments WHERE id = ? FOR UPDATE', [id]);
      const a = (rows as { status: AssessmentRow['status'] }[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      if (a.status !== 'locked') throw conflict('Seule une évaluation verrouillée peut être déverrouillée.');
      await conn.query(`UPDATE assessments SET status = 'submitted', updated_by = ? WHERE id = ?`, [
        req.user!.id,
        id,
      ]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'assessments.unlock',
      entityType: 'assessment',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Évaluation déverrouillée (retour en « soumise »).' });
  })
);

// ---------- Correction après verrouillage (motif obligatoire, historique) ----------
assessmentsRouter.post(
  '/:id/corrections',
  requirePermission('grades.correct'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = gradeCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const b = parsed.data;

    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM assessments WHERE id = ? FOR UPDATE', [id]);
      const a = (rows as AssessmentRow[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      if (a.status !== 'locked') {
        throw conflict('La correction formelle ne s’applique qu’à une évaluation verrouillée (sinon, modifiez directement les notes).');
      }

      const [gradeRows] = await conn.query(
        'SELECT id, score, grade_status FROM grades WHERE assessment_id = ? AND student_id = ? FOR UPDATE',
        [id, b.studentId]
      );
      const grade = (gradeRows as { id: number; score: string | null; grade_status: string }[])[0];
      if (!grade) {
        throw badRequest('Aucune note existante pour cet élève : correction impossible.');
      }

      if (b.gradeStatus === 'graded') {
        if (b.score === null || b.score === undefined) {
          throw badRequest('Nouvelle note manquante (statut « noté »).');
        }
        validateScore(b.score, Number(a.max_score));
      } else if (b.score !== null && b.score !== undefined) {
        throw badRequest('Ce statut ne doit pas s’accompagner d’une valeur numérique.');
      }

      await conn.query(
        `INSERT INTO grade_corrections
           (grade_id, assessment_id, student_id, old_score, new_score, old_status, new_status, reason, corrected_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          grade.id, id, b.studentId,
          grade.score, b.gradeStatus === 'graded' ? b.score : null,
          grade.grade_status, b.gradeStatus, b.reason, req.user!.id,
        ]
      );
      await conn.query(
        `UPDATE grades SET score = ?, grade_status = ?, updated_by = ? WHERE id = ?`,
        [b.gradeStatus === 'graded' ? b.score : null, b.gradeStatus, req.user!.id, grade.id]
      );
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'grades.correct',
      entityType: 'assessment',
      entityId: id,
      details: { studentId: b.studentId }, // motif conservé en base, pas de valeur dans le journal
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Correction enregistrée (ancienne valeur conservée dans l’historique).' });
  })
);

// ---------- Historique des corrections ----------
assessmentsRouter.get(
  '/:id/corrections',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM assessments WHERE id = ? LIMIT 1', [id]);
      const a = (rows as AssessmentRow[])[0];
      if (!a) throw notFound('Évaluation introuvable.');
      await assertAssessmentAccess(req.user!, a);
      return a;
    });
    void result;

    const [corrRows] = await getPool().query(
      `SELECT gc.id, gc.student_id AS studentId, s.matricule,
              CONCAT(s.last_name, ' ', s.first_names) AS studentName,
              gc.old_score AS oldScore, gc.new_score AS newScore,
              gc.old_status AS oldStatus, gc.new_status AS newStatus,
              gc.reason, gc.created_at AS createdAt, u.full_name AS correctedByName
       FROM grade_corrections gc
       JOIN students s ON s.id = gc.student_id
       JOIN users u ON u.id = gc.corrected_by
       WHERE gc.assessment_id = ?
       ORDER BY gc.created_at DESC`,
      [id]
    );
    const corrections = (corrRows as { oldScore: string | null; newScore: string | null }[]).map((c) => ({
      ...c,
      oldScore: c.oldScore === null ? null : Number(c.oldScore),
      newScore: c.newScore === null ? null : Number(c.newScore),
    }));
    res.json({ data: corrections });
  })
);
