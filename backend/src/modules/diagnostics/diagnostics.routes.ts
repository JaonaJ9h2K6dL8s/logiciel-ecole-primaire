import { Router } from 'express';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { withTransaction } from '../../database/pool';
import { writeAudit } from '../../shared/audit';
import {
  diagnosticCreateSchema,
  diagnosticUpdateSchema,
  diagnosticsListQuerySchema,
  attemptStartSchema,
  answersSaveSchema,
  gradeOpenSchema,
} from './diagnostics.schemas';
import {
  isAdminRole,
  assertTestClassAccess,
  teacherScopeCondition,
  autoGrade,
  computeAttemptResults,
  loadTestOr404,
  parseJsonSafe,
  type DiagnosticQuestionRow,
} from './diagnostics.helpers';

/**
 * Évaluations diagnostiques (étape 14). Test de positionnement par compétence,
 * distinct des compositions, notes de bulletin et devoirs. Aucune écriture
 * dans assessments/grades. Sans compte élève : la passation est enregistrée
 * par un utilisateur habilité (professeur de la classe ou admin).
 */
export const diagnosticsRouter = Router();

diagnosticsRouter.use(requireAuth);

const TEST_SELECT = `
  dt.id, dt.title, dt.description, dt.school_year_id AS schoolYearId,
  dt.level_id AS levelId, dt.class_id AS classId, dt.subject_id AS subjectId,
  dt.created_by AS createdBy, dt.duration_minutes AS durationMinutes,
  dt.opens_at AS opensAt, dt.closes_at AS closesAt, dt.status,
  dt.threshold_intermediate_min AS thresholdIntermediateMin,
  dt.threshold_advanced_min AS thresholdAdvancedMin,
  dt.min_answered_pct AS minAnsweredPct, dt.created_at AS createdAt,
  c.name AS className, l.name AS levelName, sb.name AS subjectName,
  u.full_name AS authorName`;

// ========================= LISTE =========================

diagnosticsRouter.get(
  '/',
  requirePermission('diagnostics.view'),
  asyncHandler(async (req, res) => {
    const parsed = diagnosticsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const where: string[] = [];
    const params: unknown[] = [];
    if (!isAdminRole(req.user!.role_code)) {
      where.push(teacherScopeCondition(req.user!.id));
      params.push(req.user!.id);
    }
    if (q.schoolYearId) { where.push('dt.school_year_id = ?'); params.push(q.schoolYearId); }
    if (q.classId) { where.push('dt.class_id = ?'); params.push(q.classId); }
    if (q.subjectId) { where.push('dt.subject_id = ?'); params.push(q.subjectId); }
    if (q.status) { where.push('dt.status = ?'); params.push(q.status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await getPool().query(
      `SELECT ${TEST_SELECT},
              (SELECT COUNT(*) FROM diagnostic_questions dq WHERE dq.test_id = dt.id) AS questionCount,
              (SELECT COUNT(*) FROM diagnostic_attempts da WHERE da.test_id = dt.id AND da.status = 'submitted') AS submittedCount,
              (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = dt.class_id AND e.school_year_id = dt.school_year_id AND e.status = 'active') AS studentCount
       FROM diagnostic_tests dt
       JOIN classes c ON c.id = dt.class_id
       JOIN levels l ON l.id = dt.level_id
       JOIN subjects sb ON sb.id = dt.subject_id
       JOIN users u ON u.id = dt.created_by
       ${whereSql}
       ORDER BY dt.created_at DESC, dt.id DESC`,
      params
    );
    res.json({ data: rows });
  })
);

// ========================= OPTIONS DE FORMULAIRE =========================

/**
 * Années et classes proposées aux formulaires de création/filtrage.
 * Admin : toutes les années et classes. Professeur : uniquement celles de ses
 * affectations actives (teacher_class_assignments), sans exposer /school-years
 * ni /academics/classes (réservés aux permissions de gestion).
 */
diagnosticsRouter.get(
  '/form-options',
  requirePermission('diagnostics.view'),
  asyncHandler(async (req, res) => {
    const admin = isAdminRole(req.user!.role_code);
    const teacherId = req.user!.id;
    const years = admin
      ? await getPool().query(
          `SELECT id, label, is_active AS isActive FROM school_years ORDER BY start_date DESC`
        )
      : await getPool().query(
          `SELECT DISTINCT y.id, y.label, y.is_active AS isActive
           FROM school_years y
           JOIN teacher_class_assignments tca ON tca.school_year_id = y.id
           WHERE tca.teacher_id = ? AND tca.assigned_to IS NULL
           ORDER BY y.start_date DESC`,
          [teacherId]
        );
    let classes: unknown = [];
    const schoolYearId = Number(new URLSearchParams(req.url.split('?')[1] ?? '').get('schoolYearId'));
    if (Number.isInteger(schoolYearId) && schoolYearId > 0) {
      classes = admin
        ? await getPool().query(
            `SELECT c.id, c.name, c.level_id AS levelId, c.school_year_id AS schoolYearId, l.name AS levelName
             FROM classes c JOIN levels l ON l.id = c.level_id
             WHERE c.school_year_id = ? AND c.is_active = 1 ORDER BY c.name`,
            [schoolYearId]
          )
        : await getPool().query(
            `SELECT c.id, c.name, c.level_id AS levelId, c.school_year_id AS schoolYearId, l.name AS levelName
             FROM classes c
             JOIN levels l ON l.id = c.level_id
             JOIN teacher_class_assignments tca ON tca.class_id = c.id AND tca.school_year_id = c.school_year_id
             WHERE c.school_year_id = ? AND c.is_active = 1 AND tca.teacher_id = ? AND tca.assigned_to IS NULL
             ORDER BY c.name`,
            [schoolYearId, teacherId]
          );
    }
    res.json({ data: { years: (years as unknown[])[0], classes: (classes as unknown[])[0] } });
  })
);

// ========================= CRÉATION =========================

diagnosticsRouter.post(
  '/',
  requirePermission('diagnostics.manage'),
  asyncHandler(async (req, res) => {
    const parsed = diagnosticCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;

    const created = await withTransaction(async (conn) => {
      // Cohérence classe / niveau / année et accès professeur
      const [classRows] = await conn.query('SELECT id, level_id, school_year_id FROM classes WHERE id = ? LIMIT 1', [d.classId]);
      const cls = (classRows as { id: number; level_id: number; school_year_id: number }[])[0];
      if (!cls) throw notFound('Classe introuvable.');
      if (cls.level_id !== d.levelId) throw badRequest('Le niveau ne correspond pas à celui de la classe.');
      if (cls.school_year_id !== d.schoolYearId) throw badRequest('L’année scolaire ne correspond pas à celle de la classe.');
      await assertTestClassAccess(conn, req.user!, d.classId);

      try {
        const [ins] = await conn.query(
          `INSERT INTO diagnostic_tests
             (title, description, school_year_id, level_id, class_id, subject_id, created_by,
              duration_minutes, opens_at, closes_at, status,
              threshold_intermediate_min, threshold_advanced_min, min_answered_pct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
          [
            d.title, d.description || null, d.schoolYearId, d.levelId, d.classId, d.subjectId,
            req.user!.id, d.durationMinutes ?? null, d.opensAt ?? null, d.closesAt ?? null,
            d.thresholdIntermediateMin, d.thresholdAdvancedMin, d.minAnsweredPct,
          ]
        );
        const testId = (ins as { insertId: number }).insertId;

        const compIds = new Map<string, number>();
        for (let i = 0; i < d.competencies.length; i++) {
          const c = d.competencies[i];
          const [rc] = await conn.query(
            'INSERT INTO diagnostic_competencies (test_id, code, name, display_order) VALUES (?, ?, ?, ?)',
            [testId, c.code, c.name, i + 1]
          );
          compIds.set(c.code, (rc as { insertId: number }).insertId);
        }
        for (const q of d.questions) {
          await conn.query(
            `INSERT INTO diagnostic_questions
               (test_id, competency_id, display_order, question_type, statement, points, options_json, expected_answer)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              testId,
              q.competencyCode ? (compIds.get(q.competencyCode) ?? null) : null,
              q.displayOrder, q.questionType, q.statement, q.points,
              q.options ? JSON.stringify(q.options) : null,
              q.expected === undefined || q.expected === null ? null : JSON.stringify(q.expected),
            ]
          );
        }
        return testId;
      } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY') {
          throw conflict('Un test identique existe déjà pour cette classe et cette matière (même titre).');
        }
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'diagnostics.create',
      entityType: 'diagnostic_test',
      entityId: created,
      details: { title: d.title, questions: d.questions.length, competencies: d.competencies.length },
      ip: req.ip ?? null,
    });
    res.status(201).json({ data: { id: created }, message: 'Test diagnostique créé (brouillon).' });
  })
);

// ========================= DÉTAIL / MODIFICATION =========================

async function loadTestDetail(testId: number) {
  const [rows] = await getPool().query(
    `SELECT ${TEST_SELECT}
     FROM diagnostic_tests dt
     JOIN classes c ON c.id = dt.class_id
     JOIN levels l ON l.id = dt.level_id
     JOIN subjects sb ON sb.id = dt.subject_id
     JOIN users u ON u.id = dt.created_by
     WHERE dt.id = ?`,
    [testId]
  );
  const t = (rows as Record<string, unknown>[])[0];
  if (!t) throw notFound('Test diagnostique introuvable.');
  const [comps] = await getPool().query(
    'SELECT id, code, name, display_order AS displayOrder FROM diagnostic_competencies WHERE test_id = ? ORDER BY display_order, id',
    [testId]
  );
  const [qs] = await getPool().query(
    `SELECT dq.id, dq.competency_id AS competencyId, dc.code AS competencyCode, dc.name AS competencyName,
            dq.display_order AS displayOrder, dq.question_type AS questionType, dq.statement,
            dq.points, dq.options_json AS optionsJson, dq.expected_answer AS expectedAnswer
     FROM diagnostic_questions dq
     LEFT JOIN diagnostic_competencies dc ON dc.id = dq.competency_id
     WHERE dq.test_id = ? ORDER BY dq.display_order, dq.id`,
    [testId]
  );
  return {
    test: t,
    competencies: comps,
    questions: (qs as Record<string, unknown>[]).map((q) => ({
      ...q,
      options: parseJsonSafe(q.optionsJson),
      expected: parseJsonSafe(q.expectedAnswer),
      optionsJson: undefined,
      expectedAnswer: undefined,
    })),
  };
}

diagnosticsRouter.get(
  '/:id(\\d+)',
  requirePermission('diagnostics.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const detail = await loadTestDetail(id);
    const t = detail.test as { classId: number };
    await assertTestClassAccess(getPool(), req.user!, t.classId);
    res.json({ data: detail });
  })
);

diagnosticsRouter.patch(
  '/:id(\\d+)',
  requirePermission('diagnostics.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parsed = diagnosticUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;

    await withTransaction(async (conn) => {
      const t = await loadTestOr404(conn, id);
      await assertTestClassAccess(conn, req.user!, t.class_id);
      if (t.status === 'archived') throw conflict('Un test archivé ne peut plus être modifié.');

      if (d.status !== undefined) {
        // Transitions autorisées : draft→published, published→closed, tout→archived
        const allowed =
          (d.status === 'published' && t.status === 'draft') ||
          (d.status === 'closed' && t.status === 'published') ||
          (d.status === 'archived');
        if (!allowed) throw conflict(`Transition de statut « ${t.status} » vers « ${d.status} » non autorisée.`);
        if (d.status === 'published') {
          const [qc] = await conn.query('SELECT COUNT(*) AS n FROM diagnostic_questions WHERE test_id = ?', [id]);
          if ((qc as { n: number }[])[0].n === 0) throw badRequest('Impossible de publier un test sans question.');
        }
        await conn.query('UPDATE diagnostic_tests SET status = ? WHERE id = ?', [d.status, id]);
      }

      // Édition du contenu : autorisée en brouillon uniquement. Les champs à
      // défaut (seuils) sont détectés sur le corps brut : .partial() laisse
      // passer les .default() du schéma même en l'absence de clé.
      const provided = new Set(Object.keys(req.body ?? {}));
      const contentChanged =
        ['title', 'description', 'durationMinutes', 'opensAt', 'closesAt',
         'thresholdIntermediateMin', 'thresholdAdvancedMin', 'minAnsweredPct',
         'competencies', 'questions'].some((k) => provided.has(k));
      if (contentChanged) {
        if (t.status !== 'draft') {
          throw conflict('Seul un test en brouillon peut voir son contenu modifié. Publiez une copie pour une nouvelle version.');
        }
        const [dupeCheck] = await conn.query(
          'SELECT 1 FROM diagnostic_attempts WHERE test_id = ? LIMIT 1',
          [id]
        );
        if ((dupeCheck as unknown[]).length > 0) {
          throw conflict('Des tentatives existent déjà : le contenu n’est plus modifiable.');
        }
        if (d.title !== undefined || d.description !== undefined || d.durationMinutes !== undefined ||
            d.opensAt !== undefined || d.closesAt !== undefined || d.thresholdIntermediateMin !== undefined ||
            d.thresholdAdvancedMin !== undefined || d.minAnsweredPct !== undefined) {
          await conn.query(
            `UPDATE diagnostic_tests SET
               title = COALESCE(?, title), description = COALESCE(?, description),
               duration_minutes = COALESCE(?, duration_minutes),
               opens_at = COALESCE(?, opens_at), closes_at = COALESCE(?, closes_at),
               threshold_intermediate_min = COALESCE(?, threshold_intermediate_min),
               threshold_advanced_min = COALESCE(?, threshold_advanced_min),
               min_answered_pct = COALESCE(?, min_answered_pct)
             WHERE id = ?`,
            [
              d.title ?? null, d.description !== undefined ? d.description || null : null,
              d.durationMinutes !== undefined ? d.durationMinutes : null,
              d.opensAt !== undefined ? d.opensAt : null, d.closesAt !== undefined ? d.closesAt : null,
              d.thresholdIntermediateMin ?? null, d.thresholdAdvancedMin ?? null, d.minAnsweredPct ?? null,
              id,
            ]
          );
        }
        if (d.competencies !== undefined || d.questions !== undefined) {
          // Remplacement complet des compétences et questions (brouillon sans
          // tentatives). Les questions non fournies sont reprises à l'identique.
          type RawQuestion = {
            competencyCode: string | null;
            display_order: number;
            question_type: DiagnosticQuestionRow['question_type'];
            statement: string;
            points: number | string;
            options_json: string | null;
            expected_answer: string | null;
          };
          const comps =
            d.competencies ??
            ((await conn.query('SELECT code, name FROM diagnostic_competencies WHERE test_id = ? ORDER BY display_order, id', [id]))[0] as { code: string; name: string }[]);
          const questionsRaw: RawQuestion[] = d.questions
            ? d.questions.map((q) => ({
                competencyCode: q.competencyCode ?? null,
                display_order: q.displayOrder,
                question_type: q.questionType,
                statement: q.statement,
                points: q.points,
                options_json: q.options ? JSON.stringify(q.options) : null,
                expected_answer:
                  q.expected === undefined || q.expected === null ? null : JSON.stringify(q.expected),
              }))
            : ((await conn.query(
                `SELECT dc.code AS competencyCode, dq.display_order, dq.question_type,
                        dq.statement, dq.points, dq.options_json, dq.expected_answer
                 FROM diagnostic_questions dq LEFT JOIN diagnostic_competencies dc ON dc.id = dq.competency_id
                 WHERE dq.test_id = ? ORDER BY dq.display_order, dq.id`,
                [id]
              ))[0] as RawQuestion[]);

          await conn.query('DELETE FROM diagnostic_questions WHERE test_id = ?', [id]);
          await conn.query('DELETE FROM diagnostic_competencies WHERE test_id = ?', [id]);

          const compIds = new Map<string, number>();
          for (let i = 0; i < comps.length; i++) {
            const c = comps[i];
            const [rc] = await conn.query(
              'INSERT INTO diagnostic_competencies (test_id, code, name, display_order) VALUES (?, ?, ?, ?)',
              [id, c.code, c.name, i + 1]
            );
            compIds.set(c.code, (rc as { insertId: number }).insertId);
          }
          for (const q of questionsRaw) {
            await conn.query(
              `INSERT INTO diagnostic_questions
                 (test_id, competency_id, display_order, question_type, statement, points, options_json, expected_answer)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                q.competencyCode ? (compIds.get(q.competencyCode) ?? null) : null,
                q.display_order ?? 1, q.question_type, q.statement, q.points,
                q.options_json ?? null, q.expected_answer ?? null,
              ]
            );
          }
        }
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'diagnostics.update',
      entityType: 'diagnostic_test',
      entityId: id,
      details: { changes: { ...d, competencies: d.competencies?.length, questions: d.questions?.length } },
      ip: req.ip ?? null,
    });
    res.json({ ok: true, message: 'Test diagnostique mis à jour.' });
  })
);

// ========================= TENTATIVES =========================

diagnosticsRouter.post(
  '/:id(\\d+)/attempts',
  requirePermission('diagnostics.manage'),
  asyncHandler(async (req, res) => {
    const testId = Number(req.params.id);
    const parsed = attemptStartSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    const { studentId } = parsed.data;

    const result = await withTransaction(async (conn) => {
      const t = await loadTestOr404(conn, testId);
      await assertTestClassAccess(conn, req.user!, t.class_id);
      if (t.status !== 'published') throw conflict('Le test doit être publié pour démarrer une passation.');

      // L'élève doit être inscrit activement dans la classe du test.
      const [enr] = await conn.query(
        `SELECT e.id FROM enrollments e WHERE e.student_id = ? AND e.class_id = ? AND e.school_year_id = ? AND e.status = 'active' LIMIT 1`,
        [studentId, t.class_id, t.school_year_id]
      );
      if ((enr as unknown[]).length === 0) throw badRequest('L’élève n’est pas inscrit activement dans la classe de ce test.');

      const [existing] = await conn.query(
        'SELECT id, status FROM diagnostic_attempts WHERE test_id = ? AND student_id = ? FOR UPDATE',
        [testId, studentId]
      );
      const prev = (existing as { id: number; status: string }[])[0];
      if (prev) {
        if (prev.status === 'submitted') throw conflict('Ce test a déjà été soumis pour cet élève (une seule tentative).');
        return { attemptId: prev.id, resumed: true };
      }
      const [ins] = await conn.query(
        'INSERT INTO diagnostic_attempts (test_id, student_id, started_by) VALUES (?, ?, ?)',
        [testId, studentId, req.user!.id]
      );
      return { attemptId: (ins as { insertId: number }).insertId, resumed: false };
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: result.resumed ? 'diagnostics.attempt_resume' : 'diagnostics.attempt_start',
      entityType: 'diagnostic_attempt',
      entityId: result.attemptId,
      details: { testId, studentId },
      ip: req.ip ?? null,
    });
    res.status(result.resumed ? 200 : 201).json({ data: result });
  })
);

/** Sauvegarde de progression (tentative en cours uniquement). */
diagnosticsRouter.put(
  '/attempts/:id(\\d+)/answers',
  requirePermission('diagnostics.manage'),
  asyncHandler(async (req, res) => {
    const attemptId = Number(req.params.id);
    const parsed = answersSaveSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);

    await withTransaction(async (conn) => {
      const [arows] = await conn.query('SELECT * FROM diagnostic_attempts WHERE id = ? FOR UPDATE', [attemptId]);
      const attempt = (arows as { id: number; test_id: number; status: string }[])[0];
      if (!attempt) throw notFound('Tentative introuvable.');
      if (attempt.status !== 'in_progress') throw conflict('Tentative déjà soumise : les réponses ne sont plus modifiables.');
      const t = await loadTestOr404(conn, attempt.test_id);
      await assertTestClassAccess(conn, req.user!, t.class_id);

      const [qrows] = await conn.query('SELECT id FROM diagnostic_questions WHERE test_id = ?', [attempt.test_id]);
      const validQ = new Set((qrows as { id: number }[]).map((r) => r.id));

      for (const a of parsed.data.answers) {
        if (!validQ.has(a.questionId)) throw badRequest(`Question ${a.questionId} hors de ce test.`);
        const empty = a.value === null || a.value === undefined || (typeof a.value === 'string' && a.value.trim() === '') || (Array.isArray(a.value) && a.value.length === 0);
        await conn.query(
          `INSERT INTO diagnostic_answers (attempt_id, question_id, answer_json)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE answer_json = VALUES(answer_json), is_correct = NULL, points_earned = NULL, manually_graded = 0, graded_by = NULL, graded_at = NULL`,
          [attemptId, a.questionId, empty ? null : JSON.stringify(a.value)]
        );
      }
      await conn.query(
        `UPDATE diagnostic_attempts SET answered_count = (SELECT COUNT(*) FROM diagnostic_answers da WHERE da.attempt_id = ? AND da.answer_json IS NOT NULL) WHERE id = ?`,
        [attemptId, attemptId]
      );
    });

    res.json({ ok: true, message: 'Progression enregistrée.' });
  })
);

/** Soumission : calcul serveur, tout ou rien, une seule fois. */
diagnosticsRouter.post(
  '/attempts/:id(\\d+)/submit',
  requirePermission('diagnostics.manage'),
  asyncHandler(async (req, res) => {
    const attemptId = Number(req.params.id);

    const computed = await withTransaction(async (conn) => {
      const [arows] = await conn.query('SELECT * FROM diagnostic_attempts WHERE id = ? FOR UPDATE', [attemptId]);
      const attempt = (arows as { id: number; test_id: number; status: string; student_id: number }[])[0];
      if (!attempt) throw notFound('Tentative introuvable.');
      if (attempt.status === 'submitted') throw conflict('Tentative déjà soumise : aucun recalcul automatique.');
      const t = await loadTestOr404(conn, attempt.test_id);
      await assertTestClassAccess(conn, req.user!, t.class_id);

      const [qrows] = await conn.query(
        'SELECT * FROM diagnostic_questions WHERE test_id = ? ORDER BY display_order, id',
        [attempt.test_id]
      );
      const questions = qrows as DiagnosticQuestionRow[];
      const [crows] = await conn.query(
        'SELECT id, code, name FROM diagnostic_competencies WHERE test_id = ? ORDER BY display_order, id',
        [attempt.test_id]
      );
      const competencies = crows as { id: number; code: string; name: string }[];
      const [arows2] = await conn.query(
        'SELECT question_id, answer_json, points_earned FROM diagnostic_answers WHERE attempt_id = ?',
        [attemptId]
      );
      const answers = new Map<number, { answer_json: string | null; points_earned: string | null }>();
      for (const r of arows2 as { question_id: number; answer_json: string | null; points_earned: string | null }[]) {
        answers.set(r.question_id, { answer_json: r.answer_json, points_earned: r.points_earned });
      }

      // Correction automatique des questions auto-correctibles non encore notées.
      for (const q of questions) {
        if (q.question_type === 'open') continue;
        const a = answers.get(q.id);
        if (!a || a.answer_json === null || a.points_earned !== null) continue;
        let value: unknown = parseJsonSafe(a.answer_json);
        const res2 = autoGrade(q.question_type, q.expected_answer, value);
        const pts = Number(q.points);
        if (res2) {
          const earned = res2.correct ? pts : 0;
          await conn.query(
            'UPDATE diagnostic_answers SET is_correct = ?, points_earned = ? WHERE attempt_id = ? AND question_id = ?',
            [res2.correct ? 1 : 0, earned, attemptId, q.id]
          );
          a.points_earned = String(earned);
        }
      }

      // Recharge des réponses après correction automatique
      const [arows3] = await conn.query(
        'SELECT question_id, answer_json, points_earned FROM diagnostic_answers WHERE attempt_id = ?',
        [attemptId]
      );
      const finalAnswers = new Map<number, { answer_json: string | null; points_earned: string | null }>();
      for (const r of arows3 as { question_id: number; answer_json: string | null; points_earned: string | null }[]) {
        finalAnswers.set(r.question_id, { answer_json: r.answer_json, points_earned: r.points_earned });
      }

      const comp = computeAttemptResults({
        questions, competencies, answers: finalAnswers,
        thresholds: {
          intermediateMin: t.threshold_intermediate_min,
          advancedMin: t.threshold_advanced_min,
          minAnsweredPct: t.min_answered_pct,
        },
      });

      await conn.query(
        `UPDATE diagnostic_attempts SET
           status = 'submitted', submitted_at = NOW(), submitted_by = ?,
           score = ?, max_score = ?, percentage = ?, answered_count = ?, question_count = ?,
           level = ?, threshold_intermediate_min = ?, threshold_advanced_min = ?, min_answered_pct = ?,
           results_json = ?
         WHERE id = ?`,
        [
          req.user!.id, comp.score, comp.maxScore, comp.percentage, comp.answeredCount, questions.length,
          comp.level, t.threshold_intermediate_min, t.threshold_advanced_min, t.min_answered_pct,
          JSON.stringify(comp.resultsJson), attemptId,
        ]
      );
      return { attemptId, ...comp };
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'diagnostics.attempt_submit',
      entityType: 'diagnostic_attempt',
      entityId: attemptId,
      details: { score: computed.score, maxScore: computed.maxScore, level: computed.level },
      ip: req.ip ?? null,
    });
    res.json({ data: computed, message: 'Test soumis et résultats calculés.' });
  })
);

/** Détail d'une tentative (résultat individuel + réponses pour correction). */
diagnosticsRouter.get(
  '/attempts/:id(\\d+)',
  requirePermission('diagnostics.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [arows] = await getPool().query(
      `SELECT da.*, dt.class_id AS classId, dt.title AS testTitle, s.first_names, s.last_name, s.matricule
       FROM diagnostic_attempts da
       JOIN diagnostic_tests dt ON dt.id = da.test_id
       JOIN students s ON s.id = da.student_id
       WHERE da.id = ?`,
      [id]
    );
    const attempt = (arows as Record<string, unknown>[])[0];
    if (!attempt) throw notFound('Tentative introuvable.');
    await assertTestClassAccess(getPool(), req.user!, attempt.classId as number);

    const [ans] = await getPool().query(
      `SELECT da2.id, da2.question_id AS questionId, dq.statement, dq.question_type AS questionType,
              dq.points, dq.expected_answer AS expectedAnswer, dq.options_json AS optionsJson,
              dc.code AS competencyCode, dc.name AS competencyName,
              da2.answer_json AS answerJson, da2.is_correct AS isCorrect, da2.points_earned AS pointsEarned,
              da2.manually_graded AS manuallyGraded
       FROM diagnostic_answers da2
       JOIN diagnostic_questions dq ON dq.id = da2.question_id
       LEFT JOIN diagnostic_competencies dc ON dc.id = dq.competency_id
       WHERE da2.attempt_id = ? ORDER BY dq.display_order, dq.id`,
      [id]
    );
    const [missing] = await getPool().query(
      `SELECT dq.id AS questionId, dq.statement, dq.points,
              dq.question_type AS questionType, dq.options_json AS optionsJson,
              dq.competency_id AS competencyId
       FROM diagnostic_questions dq
       LEFT JOIN diagnostic_answers da3 ON da3.question_id = dq.id AND da3.attempt_id = ?
       WHERE dq.test_id = ? AND da3.id IS NULL ORDER BY dq.display_order, dq.id`,
      [id, attempt.test_id]
    );
    // Progression de l'élève : toutes ses tentatives soumises du même niveau/matière
    const [prog] = await getPool().query(
      `SELECT da4.id, da4.test_id AS testId, dt2.title, da4.score, da4.max_score AS maxScore,
              da4.percentage, da4.level, da4.submitted_at AS submittedAt
       FROM diagnostic_attempts da4
       JOIN diagnostic_tests dt2 ON dt2.id = da4.test_id
       WHERE da4.student_id = ? AND da4.status = 'submitted' AND dt2.subject_id = (SELECT subject_id FROM diagnostic_tests WHERE id = ?)
       ORDER BY da4.submitted_at, da4.id`,
      [attempt.student_id, attempt.test_id]
    );
    res.json({
      data: {
        attempt: {
          id: attempt.id, testId: attempt.test_id, testTitle: attempt.testTitle,
          studentId: attempt.student_id, studentName: `${attempt.last_name} ${attempt.first_names}`,
          matricule: attempt.matricule, status: attempt.status,
          score: attempt.score, maxScore: attempt.max_score, percentage: attempt.percentage,
          answeredCount: attempt.answered_count, questionCount: attempt.question_count,
          level: attempt.level, results: parseJsonSafe(attempt.results_json),
          submittedAt: attempt.submitted_at,
        },
        answers: (ans as Record<string, unknown>[]).map((a) => ({
          ...a,
          answer: parseJsonSafe(a.answerJson),
          expected: parseJsonSafe(a.expectedAnswer),
          options: parseJsonSafe(a.optionsJson),
          answerJson: undefined, expectedAnswer: undefined, optionsJson: undefined,
        })),
        missingQuestions: missing,
        progression: prog,
      },
    });
  })
);

/** Correction manuelle des questions ouvertes + recalcul du résultat. */
diagnosticsRouter.post(
  '/attempts/:id(\\d+)/grade',
  requirePermission('diagnostics.manage'),
  asyncHandler(async (req, res) => {
    const attemptId = Number(req.params.id);
    const parsed = gradeOpenSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);

    const computed = await withTransaction(async (conn) => {
      const [arows] = await conn.query('SELECT * FROM diagnostic_attempts WHERE id = ? FOR UPDATE', [attemptId]);
      const attempt = (arows as {
        id: number;
        test_id: number;
        status: string;
        threshold_intermediate_min: number | null;
        threshold_advanced_min: number | null;
        min_answered_pct: number | null;
      }[])[0];
      if (!attempt) throw notFound('Tentative introuvable.');
      if (attempt.status !== 'submitted') throw conflict('La tentative doit être soumise avant correction.');
      const t = await loadTestOr404(conn, attempt.test_id);
      await assertTestClassAccess(conn, req.user!, t.class_id);

      for (const g of parsed.data.grades) {
        // Seules les questions « open » en attente sont corrigibles manuellement.
        const [qrows] = await conn.query(
          `SELECT dq.id, dq.points, dq.question_type FROM diagnostic_answers da2
           JOIN diagnostic_questions dq ON dq.id = da2.question_id
           WHERE da2.id = ? AND da2.attempt_id = ? LIMIT 1`,
          [g.answerId, attemptId]
        );
        const q = (qrows as { id: number; points: string; question_type: string }[])[0];
        if (!q) throw badRequest('Réponse introuvable pour cette tentative.');
        if (q.question_type !== 'open') throw badRequest('Seules les questions ouvertes se corrigent manuellement.');
        if (g.pointsEarned > Number(q.points)) {
          throw badRequest(`Points attribués (${g.pointsEarned}) supérieurs au barème (${q.points}).`);
        }
        await conn.query(
          'UPDATE diagnostic_answers SET is_correct = ?, points_earned = ?, manually_graded = 1, graded_by = ?, graded_at = NOW() WHERE id = ?',
          [g.isCorrect ? 1 : 0, g.pointsEarned, req.user!.id, g.answerId]
        );
      }

      // Recalcul complet (même logique que la soumission, sans re-correction auto)
      const [qrows] = await conn.query('SELECT * FROM diagnostic_questions WHERE test_id = ? ORDER BY display_order, id', [attempt.test_id]);
      const questions = qrows as DiagnosticQuestionRow[];
      const [crows] = await conn.query('SELECT id, code, name FROM diagnostic_competencies WHERE test_id = ? ORDER BY display_order, id', [attempt.test_id]);
      const competencies = crows as { id: number; code: string; name: string }[];
      const [arows2] = await conn.query('SELECT question_id, answer_json, points_earned FROM diagnostic_answers WHERE attempt_id = ?', [attemptId]);
      const answers = new Map<number, { answer_json: string | null; points_earned: string | null }>();
      for (const r of arows2 as { question_id: number; answer_json: string | null; points_earned: string | null }[]) {
        answers.set(r.question_id, { answer_json: r.answer_json, points_earned: r.points_earned });
      }
      const comp = computeAttemptResults({
        questions, competencies, answers,
        thresholds: {
          intermediateMin: attempt.threshold_intermediate_min ?? t.threshold_intermediate_min,
          advancedMin: attempt.threshold_advanced_min ?? t.threshold_advanced_min,
          minAnsweredPct: attempt.min_answered_pct ?? t.min_answered_pct,
        },
      });
      await conn.query(
        `UPDATE diagnostic_attempts SET score = ?, max_score = ?, percentage = ?, answered_count = ?,
                level = ?, results_json = ? WHERE id = ?`,
        [comp.score, comp.maxScore, comp.percentage, comp.answeredCount, comp.level, JSON.stringify(comp.resultsJson), attemptId]
      );
      return { attemptId, ...comp };
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'diagnostics.attempt_grade',
      entityType: 'diagnostic_attempt',
      entityId: attemptId,
      details: { graded: parsed.data.grades.length, newScore: computed.score, newLevel: computed.level },
      ip: req.ip ?? null,
    });
    res.json({ data: computed, message: 'Correction enregistrée et résultat recalculé.' });
  })
);

// ========================= VUES DE CLASSE =========================

/** Tableau de la classe : état par élève + résultats par compétence. */
diagnosticsRouter.get(
  '/:id(\\d+)/class-results',
  requirePermission('diagnostics.view'),
  asyncHandler(async (req, res) => {
    const testId = Number(req.params.id);
    const [trows] = await getPool().query('SELECT class_id, school_year_id FROM diagnostic_tests WHERE id = ?', [testId]);
    const t = (trows as { class_id: number; school_year_id: number }[])[0];
    if (!t) throw notFound('Test diagnostique introuvable.');
    await assertTestClassAccess(getPool(), req.user!, t.class_id);

    const [roster] = await getPool().query(
      `SELECT s.id AS studentId, s.matricule, CONCAT(s.last_name, ' ', s.first_names) AS studentName,
              da.id AS attemptId, da.status, da.score, da.max_score AS maxScore, da.percentage, da.level
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN diagnostic_attempts da ON da.student_id = s.id AND da.test_id = ?
       WHERE e.class_id = ? AND e.school_year_id = ? AND e.status = 'active'
       ORDER BY s.last_name, s.first_names`,
      [testId, t.class_id, t.school_year_id]
    );

    // Agrégat par compétence sur les tentatives soumises et entièrement corrigées
    const [agg] = await getPool().query(
      `SELECT da.results_json FROM diagnostic_attempts da
       WHERE da.test_id = ? AND da.status = 'submitted' AND da.level <> 'insufficient_data'`,
      [testId]
    );
    const compAgg = new Map<string, { name: string; earned: number; max: number; mastered: number; attempts: number }>();
    for (const r of agg as { results_json: string | null }[]) {
      if (!r.results_json) continue;
      const parsed = parseJsonSafe<{ competencies?: { code: string; name: string; earned: number; max: number; mastered: boolean | null }[] }>(r.results_json);
      if (!parsed) continue;
      for (const c of parsed.competencies ?? []) {
        const cur = compAgg.get(c.code) ?? { name: c.name, earned: 0, max: 0, mastered: 0, attempts: 0 };
        cur.earned += c.earned;
        cur.max += c.max;
        if (c.mastered === true) cur.mastered += 1;
        cur.attempts += 1;
        compAgg.set(c.code, cur);
      }
    }

    // Difficultés fréquentes : questions avec le plus mauvais taux de réussite
    const [diff] = await getPool().query(
      `SELECT dq.id AS questionId, dq.statement, dc.code AS competencyCode,
              COUNT(da2.id) AS answeredCount,
              COALESCE(SUM(da2.is_correct = 1), 0) AS correctCount,
              COALESCE(AVG(da2.is_correct), 0) AS successRatio
       FROM diagnostic_questions dq
       LEFT JOIN diagnostic_competencies dc ON dc.id = dq.competency_id
       LEFT JOIN diagnostic_answers da2 ON da2.question_id = dq.id AND da2.is_correct IS NOT NULL
       WHERE dq.test_id = ?
       GROUP BY dq.id, dq.statement, dc.code
       HAVING answeredCount > 0
       ORDER BY successRatio ASC, dq.display_order ASC`,
      [testId]
    );

    res.json({
      data: {
        roster,
        competencies: [...compAgg.entries()].map(([code, v]) => ({
          code, name: v.name,
          pct: v.max > 0 ? Math.round((v.earned / v.max) * 10000) / 100 : null,
          masteredCount: v.mastered, attempts: v.attempts,
        })),
        difficulties: diff,
      },
    });
  })
);

/** Progression d'un élève entre plusieurs tests (toutes matières ou une). */
diagnosticsRouter.get(
  '/students/:studentId(\\d+)/progress',
  requirePermission('diagnostics.view'),
  asyncHandler(async (req, res) => {
    const studentId = Number(req.params.studentId);
    const subjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
    const params: unknown[] = [studentId];
    let subjFilter = '';
    if (subjectId) { subjFilter = 'AND dt.subject_id = ?'; params.push(subjectId); }
    const [rows] = await getPool().query(
      `SELECT da.id, da.test_id AS testId, dt.title, dt.class_id AS classId, sb.name AS subjectName,
              da.score, da.max_score AS maxScore, da.percentage, da.level, da.submitted_at AS submittedAt
       FROM diagnostic_attempts da
       JOIN diagnostic_tests dt ON dt.id = da.test_id
       JOIN subjects sb ON sb.id = dt.subject_id
       WHERE da.student_id = ? AND da.status = 'submitted' ${subjFilter}
       ORDER BY da.submitted_at, da.id`,
      params
    );
    // Cloisonnement : restreindre aux classes autorisées pour un professeur
    let visible = rows as Record<string, unknown>[];
    if (!isAdminRole(req.user!.role_code)) {
      const [allowed] = await getPool().query(
        'SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL',
        [req.user!.id]
      );
      const ids = new Set((allowed as { class_id: number }[]).map((r) => r.class_id));
      visible = visible.filter((r) => ids.has(r.classId as number));
    }
    res.json({ data: visible });
  })
);
