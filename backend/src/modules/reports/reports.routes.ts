import { Router } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import {
  listQuerySchema,
  generateSchema,
  generalCommentSchema,
  subjectAppreciationSchema,
  correctionSchema,
  annualResultsQuerySchema,
  annualDecisionSchema,
} from './reports.schemas';
import {
  computeCard,
  cardAnomalies,
  attendanceStats,
  assertClassAccess,
  assertSubjectTaught,
  periodRoster,
} from './reports.helpers';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

interface CardRow {
  id: number;
  student_id: number;
  class_id: number;
  school_year_id: number;
  grading_period_id: number;
  status: 'draft' | 'ready' | 'validated' | 'locked' | 'cancelled';
  general_average: string | null;
  total_coefficient: string | null;
  subjects_graded: number;
  subjects_total: number;
  general_comment: string | null;
  revision: number;
  validated_at: Date | null;
  locked_at: Date | null;
}

async function loadCard(conn: PoolConnection, id: number): Promise<CardRow> {
  const [rows] = await conn.query('SELECT * FROM report_cards WHERE id = ? LIMIT 1', [id]);
  const card = (rows as CardRow[])[0];
  if (!card) throw notFound('Bulletin introuvable.');
  return card;
}

async function loadPeriodForCard(
  conn: PoolConnection,
  periodId: number,
  yearId: number
): Promise<{ name: string; start_date: string; end_date: string; is_locked: number }> {
  const [rows] = await conn.query(
    `SELECT name, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, is_locked
     FROM grading_periods WHERE id = ? AND school_year_id = ? LIMIT 1`,
    [periodId, yearId]
  );
  const p = (rows as { name: string; start_date: string; end_date: string; is_locked: number }[])[0];
  if (!p) throw notFound('Période introuvable.');
  return p;
}

/** Recalcule et écrit les lignes du bulletin (draft/ready uniquement). */
async function refreshCardLines(
  conn: PoolConnection,
  card: CardRow,
  userId: number
): Promise<CardRow> {
  const computed = await computeCard(conn, card.student_id, card.class_id, card.grading_period_id);
  await conn.query('DELETE FROM report_card_lines WHERE report_card_id = ?', [card.id]);
  for (const l of computed.lines) {
    await conn.query(
      `INSERT INTO report_card_lines
       (report_card_id, subject_id, subject_name, coefficient, average, evaluations_count, grading_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [card.id, l.subjectId, l.subjectName, l.coefficient, l.average, l.evaluationsCount, l.gradingCount]
    );
  }
  await conn.query(
    `UPDATE report_cards SET general_average = ?, total_coefficient = ?,
       subjects_graded = ?, subjects_total = ?, updated_by = ?
     WHERE id = ?`,
    [
      computed.generalAverage,
      computed.totalCoefficient,
      computed.subjectsGraded,
      computed.subjectsTotal,
      userId,
      card.id,
    ]
  );
  return { ...card, general_average: computed.generalAverage === null ? null : String(computed.generalAverage) };
}

/** Instantané JSON complet (figé à la validation, conservé en révision). */
async function cardSnapshot(conn: PoolConnection, cardId: number): Promise<unknown> {
  const [lines] = await conn.query(
    `SELECT subject_id, subject_name, coefficient, average, evaluations_count, grading_count
     FROM report_card_lines WHERE report_card_id = ? ORDER BY subject_name`,
    [cardId]
  );
  const [cardRows] = await conn.query(
    `SELECT rc.*, s.matricule, s.last_name, s.first_names, c.name AS class_name,
            l.name AS level_name, gp.name AS period_name, sy.label AS year_label
     FROM report_cards rc
     JOIN students s ON s.id = rc.student_id
     JOIN classes c ON c.id = rc.class_id
     JOIN levels l ON l.id = c.level_id
     JOIN grading_periods gp ON gp.id = rc.grading_period_id
     JOIN school_years sy ON sy.id = rc.school_year_id
     WHERE rc.id = ?`,
    [cardId]
  );
  const [appr] = await conn.query(
    `SELECT sa.subject_id, sa.comment FROM subject_appreciations sa
     WHERE sa.student_id = (SELECT student_id FROM report_cards WHERE id = ?)
       AND sa.grading_period_id = (SELECT grading_period_id FROM report_cards WHERE id = ?)`,
    [cardId, cardId]
  );
  const card = (cardRows as Record<string, unknown>[])[0];
  return {
    card,
    lines,
    appreciations: appr,
  };
}

// ---------------------------------------------------------------------------
// Liste des bulletins d'une classe pour une période
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/',
  requirePermission('report_cards.view'),
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const { schoolYearId, gradingPeriodId, classId } = parsed.data;

    const conn = await getPool().getConnection();
    try {
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, classId);
      }
      const period = await loadPeriodForCard(conn, gradingPeriodId, schoolYearId);
      const roster = await periodRoster(conn, classId, period.end_date);
      const [cardRows] = await conn.query(
        `SELECT rc.id, rc.student_id, rc.status, rc.general_average, rc.revision,
                rc.subjects_graded, rc.subjects_total, rc.validated_at, rc.locked_at
         FROM report_cards rc
         WHERE rc.grading_period_id = ? AND rc.student_id IN (?)
           AND rc.class_id = ?`,
        [gradingPeriodId, roster.length > 0 ? roster.map((r) => r.id) : [0], classId]
      );
      const cards = cardRows as {
        id: number;
        student_id: number;
        status: string;
        general_average: string | null;
        revision: number;
        subjects_graded: number;
        subjects_total: number;
      }[];
      res.json({
        data: {
          period: { id: gradingPeriodId, name: period.name, startDate: period.start_date, endDate: period.end_date },
          students: roster.map((s) => {
            const c = cards.find((x) => x.student_id === s.id);
            return {
              studentId: s.id,
              matricule: s.matricule,
              studentName: `${s.last_name} ${s.first_names}`,
              reportCardId: c?.id ?? null,
              status: c?.status ?? null,
              generalAverage: c?.general_average != null ? Number(c.general_average) : null,
              revision: c?.revision ?? null,
              subjectsGraded: c?.subjects_graded ?? null,
              subjectsTotal: c?.subjects_total ?? null,
            };
          }),
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Génération / rafraîchissement (un élève ou toute la classe)
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/generate',
  requirePermission('report_cards.manage'),
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { classId, gradingPeriodId, studentId } = parsed.data;

    const result = await withTransaction(async (conn) => {
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, classId);
      }
      const period = await loadPeriodForCard(conn, gradingPeriodId, (await classYear(conn, classId)));
      const roster = await periodRoster(conn, classId, period.end_date);
      const targets = studentId ? roster.filter((s) => s.id === studentId) : roster;
      if (studentId && targets.length === 0) {
        throw badRequest('Cet élève n’est pas inscrit dans cette classe pour cette période.');
      }
      let generated = 0;
      for (const s of targets) {
        // Upsert : une requête concurrente avec la même clé aboutit au même
        // bulletin (UNIQUE(student_id, grading_period_id)) — jamais de doublon.
        await conn.query(
          `INSERT INTO report_cards
           (student_id, class_id, school_year_id, grading_period_id, status, created_by)
           VALUES (?, ?, ?, ?, 'draft', ?)
           ON DUPLICATE KEY UPDATE updated_by = VALUES(created_by)`,
          [s.id, classId, (await classYear(conn, classId)), gradingPeriodId, req.user!.id]
        );
        const [rows] = await conn.query(
          'SELECT * FROM report_cards WHERE student_id = ? AND grading_period_id = ? LIMIT 1',
          [s.id, gradingPeriodId]
        );
        const card = (rows as CardRow[])[0];
        if (!card) {
          // Hardening étape 13 : l'upsert garantit théoriquement l'existence de
          // la ligne dans cette transaction ; toute absence est une anomalie
          // interne explicite (jamais un TypeError obscur).
          throw new Error(`Bulletin introuvable après upsert (élève ${s.id}, période ${gradingPeriodId}).`);
        }
        if (card.status === 'validated' || card.status === 'locked') {
          continue; // un bulletin validé n'est jamais modifié silencieusement
        }
        await refreshCardLines(conn, card, req.user!.id);
        await conn.query(
          `INSERT INTO report_card_revisions (report_card_id, revision, action, actor_id)
           VALUES (?, ?, 'generated', ?)`,
          [card.id, card.revision, req.user!.id]
        );
        generated++;
      }
      return { generated, total: targets.length };
    });

    await writeAudit({
      actorId: req.user!.id,
      action: 'report_cards.generate',
      entityType: 'report_card',
      entityId: classId,
      details: { classId, gradingPeriodId, ...result },
    });
    res.status(200).json({ message: `${result.generated} bulletin(s) généré(s) ou rafraîchi(s).`, data: result });
  })
);

async function classYear(conn: PoolConnection, classId: number): Promise<number> {
  const [rows] = await conn.query('SELECT school_year_id FROM classes WHERE id = ? LIMIT 1', [classId]);
  const r = (rows as { school_year_id: number }[])[0];
  if (!r) throw notFound('Classe introuvable.');
  return r.school_year_id;
}

// ---------------------------------------------------------------------------
// Détail d'un bulletin (avec dérive source signalée, jamais corrigée ici)
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/:id(\\d+)',
  requirePermission('report_cards.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const conn = await getPool().getConnection();
    try {
      const card = await loadCard(conn, id);
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, card.class_id);
      }
      const period = await loadPeriodForCard(conn, card.grading_period_id, card.school_year_id);
      const [infoRows] = await conn.query(
        `SELECT s.matricule, s.last_name, s.first_names, c.name AS className,
                l.name AS levelName, sy.label AS yearLabel, gp.name AS periodName,
                v.full_name AS validatedByName, lk.full_name AS lockedByName
         FROM report_cards rc
         JOIN students s ON s.id = rc.student_id
         JOIN classes c ON c.id = rc.class_id
         JOIN levels l ON l.id = c.level_id
         JOIN grading_periods gp ON gp.id = rc.grading_period_id
         JOIN school_years sy ON sy.id = rc.school_year_id
         LEFT JOIN users v ON v.id = rc.validated_by
         LEFT JOIN users lk ON lk.id = rc.locked_by
         WHERE rc.id = ?`,
        [id]
      );
      const info = (infoRows as Record<string, string | null>[])[0];
      const [lineRows] = await conn.query(
        `SELECT rcl.subject_id, rcl.subject_name, rcl.coefficient, rcl.average,
                rcl.evaluations_count, rcl.grading_count,
                sa.comment AS appreciation
         FROM report_card_lines rcl
         LEFT JOIN subject_appreciations sa
           ON sa.student_id = ? AND sa.subject_id = rcl.subject_id
           AND sa.grading_period_id = ?
         WHERE rcl.report_card_id = ?
         ORDER BY rcl.subject_name, rcl.subject_id`,
        [card.student_id, card.grading_period_id, id]
      );
      interface LineRow {
        subject_id: number;
        subject_name: string;
        coefficient: string;
        average: string | null;
        evaluations_count: number;
        grading_count: number;
        appreciation: string | null;
      }
      const lines: LineRow[] = lineRows as LineRow[];
      const linesOut = lines.map((l) => ({
        subjectId: l.subject_id,
        subjectName: l.subject_name,
        coefficient: Number(l.coefficient),
        average: l.average != null ? Number(l.average) : null,
        evaluationsCount: l.evaluations_count,
        gradingCount: l.grading_count,
        appreciation: l.appreciation,
      }));
      const stats = await attendanceStats(conn, card.student_id, card.class_id, period.start_date, period.end_date);
      const anomalies = await cardAnomalies(
        conn,
        card.class_id,
        card.grading_period_id,
        lines.map((l) => ({
          subjectId: l.subject_id,
          subjectName: l.subject_name,
          coefficient: Number(l.coefficient),
          average: l.average != null ? Number(l.average) : null,
          evaluationsCount: l.evaluations_count,
          gradingCount: l.grading_count,
        }))
      );
      // Dérive source : recalcul comparé aux valeurs affichées (lecture seule).
      const computed = await computeCard(conn, card.student_id, card.class_id, card.grading_period_id);
      const sourceDrift = computed.generalAverage !== (card.general_average != null ? Number(card.general_average) : null);
      const [revRows] = await conn.query(
        `SELECT r.revision, r.action, r.reason, r.created_at, u.full_name AS actorName
         FROM report_card_revisions r JOIN users u ON u.id = r.actor_id
         WHERE r.report_card_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
        [id]
      );
      res.json({
        data: {
          card: {
            id: card.id,
            status: card.status,
            revision: card.revision,
            classId: card.class_id,
            gradingPeriodId: card.grading_period_id,
            generalAverage: card.general_average != null ? Number(card.general_average) : null,
            totalCoefficient: card.total_coefficient != null ? Number(card.total_coefficient) : null,
            subjectsGraded: card.subjects_graded,
            subjectsTotal: card.subjects_total,
            generalComment: card.general_comment,
            validatedAt: card.validated_at,
            lockedAt: card.locked_at,
            validatedByName: info?.validatedByName ?? null,
            lockedByName: info?.lockedByName ?? null,
          },
          student: {
            matricule: info?.matricule,
            lastName: info?.last_name,
            firstNames: info?.first_names,
            className: info?.className,
            levelName: info?.levelName,
            yearLabel: info?.yearLabel,
            periodName: info?.periodName,
          },
          lines: linesOut,
          attendance: stats,
          anomalies,
          sourceDrift,
          revisions: revRows,
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Appréciation générale (professeur titulaire de la classe ou admin)
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/:id(\\d+)/general-comment',
  requirePermission('report_cards.manage'),
  asyncHandler(async (req, res) => {
    const parsed = generalCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Appréciation invalide.', parsed.error.flatten().fieldErrors);
    }
    const id = Number(req.params.id);
    const result = await withTransaction(async (conn) => {
      const card = await loadCardForUpdate(conn, id);
      if (card.status === 'validated' || card.status === 'locked') {
        throw forbidden('Bulletin validé ou verrouillé : passez par une correction autorisée.');
      }
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, card.class_id);
      }
      await conn.query('UPDATE report_cards SET general_comment = ?, updated_by = ? WHERE id = ?', [
        parsed.data.comment === '' ? null : parsed.data.comment,
        req.user!.id,
        id,
      ]);
      return { message: 'Appréciation générale enregistrée.' };
    });
    await writeAudit({
      actorId: req.user!.id,
      action: 'report_cards.general_comment',
      entityType: 'report_card',
      entityId: id,
      details: {},
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Appréciation par matière (professeur de la matière)
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/:id(\\d+)/subject-appreciation',
  requirePermission('report_cards.manage'),
  asyncHandler(async (req, res) => {
    const parsed = subjectAppreciationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Appréciation invalide.', parsed.error.flatten().fieldErrors);
    }
    const id = Number(req.params.id);
    const result = await withTransaction(async (conn) => {
      const card = await loadCardForUpdate(conn, id);
      if (card.status === 'validated' || card.status === 'locked') {
        throw forbidden('Bulletin validé ou verrouillé : passez par une correction autorisée.');
      }
      await assertSubjectTaught(conn, req.user!, card.class_id, parsed.data.subjectId);
      await conn.query(
        `INSERT INTO subject_appreciations
         (student_id, class_id, school_year_id, grading_period_id, subject_id, comment, author_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE comment = VALUES(comment), updated_by = VALUES(author_id)`,
        [
          card.student_id,
          card.class_id,
          card.school_year_id,
          card.grading_period_id,
          parsed.data.subjectId,
          parsed.data.comment,
          req.user!.id,
        ]
      );
      return { message: 'Appréciation enregistrée.' };
    });
    await writeAudit({
      actorId: req.user!.id,
      action: 'report_cards.subject_appreciation',
      entityType: 'report_card',
      entityId: id,
      details: { subjectId: parsed.data.subjectId },
    });
    res.json(result);
  })
);

async function loadCardForUpdate(conn: PoolConnection, id: number): Promise<CardRow> {
  const [rows] = await conn.query('SELECT * FROM report_cards WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
  const card = (rows as CardRow[])[0];
  if (!card) throw notFound('Bulletin introuvable.');
  return card;
}

// ---------------------------------------------------------------------------
// Passage à l'état ready (vérification professeur)
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/:id(\\d+)/submit',
  requirePermission('report_cards.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = await withTransaction(async (conn) => {
      const card = await loadCardForUpdate(conn, id);
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, card.class_id);
      }
      if (card.status === 'ready') {
        throw badRequest('Bulletin déjà prêt.');
      }
      if (card.status !== 'draft') {
        throw badRequest(`Transition impossible depuis l'état « ${card.status} ».`);
      }
      const fresh = await refreshCardLines(conn, card, req.user!.id);
      const computed = await computeCard(conn, card.student_id, card.class_id, card.grading_period_id);
      const anomalies = await cardAnomalies(conn, card.class_id, card.grading_period_id, computed.lines);
      await conn.query(`UPDATE report_cards SET status = 'ready', prepared_by = ? WHERE id = ?`, [
        req.user!.id,
        id,
      ]);
      await conn.query(
        `INSERT INTO report_card_revisions (report_card_id, revision, action, actor_id)
         VALUES (?, ?, 'ready', ?)`,
        [id, card.revision, req.user!.id]
      );
      return { message: 'Bulletin marqué prêt.', anomalies };
    });
    await writeAudit({ actorId: req.user!.id, action: 'report_cards.submit', entityType: 'report_card', entityId: id, details: {} });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Validation (direction) : fige l'instantané — refusée si anomalies
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/:id(\\d+)/validate',
  requirePermission('report_cards.validate'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = await withTransaction(async (conn) => {
      const card = await loadCardForUpdate(conn, id);
      if (card.status !== 'ready') {
        throw badRequest(
          card.status === 'draft'
            ? 'Le bulletin doit d’abord être vérifié (état prêt) avant validation.'
            : `Validation impossible depuis l'état « ${card.status} ».`
        );
      }
      const computed = await computeCard(conn, card.student_id, card.class_id, card.grading_period_id);
      const anomalies = await cardAnomalies(conn, card.class_id, card.grading_period_id, computed.lines);
      if (anomalies.length > 0) {
        throw badRequest('Validation refusée : anomalies en cours.', { anomalies });
      }
      const snapshot = await cardSnapshot(conn, id);
      await conn.query(
        `UPDATE report_cards SET status = 'validated', validated_by = ?, validated_at = NOW(),
           updated_by = ? WHERE id = ?`,
        [req.user!.id, req.user!.id, id]
      );
      await conn.query(
        `INSERT INTO report_card_revisions (report_card_id, revision, action, snapshot, actor_id)
         VALUES (?, ?, 'validated', ?, ?)`,
        [id, card.revision, JSON.stringify(snapshot), req.user!.id]
      );
      return { message: 'Bulletin validé et figé.' };
    });
    await writeAudit({ actorId: req.user!.id, action: 'report_cards.validate', entityType: 'report_card', entityId: id, details: {} });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Verrouillage (final)
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/:id(\\d+)/lock',
  requirePermission('report_cards.lock'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = await withTransaction(async (conn) => {
      const card = await loadCardForUpdate(conn, id);
      if (card.status !== 'validated') {
        throw badRequest('Seul un bulletin validé peut être verrouillé.');
      }
      await conn.query(`UPDATE report_cards SET status = 'locked', locked_by = ?, locked_at = NOW(),
         updated_by = ? WHERE id = ?`, [req.user!.id, req.user!.id, id]);
      await conn.query(
        `INSERT INTO report_card_revisions (report_card_id, revision, action, actor_id)
         VALUES (?, ?, 'locked', ?)`,
        [id, card.revision, req.user!.id]
      );
      return { message: 'Bulletin verrouillé.' };
    });
    await writeAudit({ actorId: req.user!.id, action: 'report_cards.lock', entityType: 'report_card', entityId: id, details: {} });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Correction d'un bulletin validé/verrouillé : motif obligatoire,
// révision incrémentée, retour en ready (recalcul explicite)
// ---------------------------------------------------------------------------
reportsRouter.post(
  '/:id(\\d+)/corrections',
  requirePermission('report_cards.correct'),
  asyncHandler(async (req, res) => {
    const parsed = correctionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Motif requis.', parsed.error.flatten().fieldErrors);
    }
    const id = Number(req.params.id);
    const result = await withTransaction(async (conn) => {
      const card = await loadCardForUpdate(conn, id);
      if (card.status !== 'validated' && card.status !== 'locked') {
        throw badRequest('Seul un bulletin validé ou verrouillé nécessite une correction formelle.');
      }
      const snapshot = await cardSnapshot(conn, id);
      await conn.query(
        `INSERT INTO report_card_revisions (report_card_id, revision, action, reason, snapshot, actor_id)
         VALUES (?, ?, 'corrected', ?, ?, ?)`,
        [id, card.revision, parsed.data.reason, JSON.stringify(snapshot), req.user!.id]
      );
      await conn.query(
        `UPDATE report_cards SET status = 'ready', revision = revision + 1,
           validated_by = NULL, validated_at = NULL, locked_by = NULL, locked_at = NULL,
           updated_by = ? WHERE id = ?`,
        [req.user!.id, id]
      );
      const fresh = await loadCard(conn, id);
      await refreshCardLines(conn, fresh, req.user!.id);
      return { message: `Bulletin remis en révision (révision ${card.revision + 1}).` };
    });
    await writeAudit({
      actorId: req.user!.id,
      action: 'report_cards.correct',
      entityType: 'report_card',
      entityId: id,
      details: { reason: parsed.data.reason },
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Données d'impression (mêmes valeurs que l'écran)
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/:id(\\d+)/print-data',
  requirePermission('report_cards.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const conn = await getPool().getConnection();
    try {
      const card = await loadCard(conn, id);
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, card.class_id);
      }
      const period = await loadPeriodForCard(conn, card.grading_period_id, card.school_year_id);
      const [settingRows] = await conn.query(
        `SELECT school_name AS schoolName, address, phone, email, document_header AS documentHeader,
                document_footer AS documentFooter
         FROM school_settings WHERE id = 1`
      );
      const settings = (settingRows as Record<string, string | null>[])[0];
      const [studentRows] = await conn.query(
        `SELECT s.matricule, s.last_name, s.first_names, s.birth_date, s.sex,
                c.name AS className, l.name AS levelName, sy.label AS yearLabel,
                gp.name AS periodName, v.full_name AS validatedByName
         FROM report_cards rc
         JOIN students s ON s.id = rc.student_id
         JOIN classes c ON c.id = rc.class_id
         JOIN levels l ON l.id = c.level_id
         JOIN grading_periods gp ON gp.id = rc.grading_period_id
         JOIN school_years sy ON sy.id = rc.school_year_id
         LEFT JOIN users v ON v.id = rc.validated_by
         WHERE rc.id = ?`,
        [id]
      );
      const [lineRows] = await conn.query(
        `SELECT rcl.subject_name, rcl.coefficient, rcl.average, rcl.grading_count,
                sa.comment AS appreciation
         FROM report_card_lines rcl
         LEFT JOIN subject_appreciations sa
           ON sa.student_id = ? AND sa.subject_id = rcl.subject_id
           AND sa.grading_period_id = ?
         WHERE rcl.report_card_id = ? ORDER BY rcl.subject_name, rcl.subject_id`,
        [card.student_id, card.grading_period_id, id]
      );
      const stats = await attendanceStats(conn, card.student_id, card.class_id, period.start_date, period.end_date);
      const [logoRows] = await conn.query('SELECT logo FROM school_settings WHERE id = 1');
      const studentRowList = studentRows as Record<string, string | null>[];
      const student = studentRowList[0];
      if (!student) throw notFound('Bulletin introuvable.');
      res.json({
        data: {
          school: settings,
          logo: (logoRows as { logo: string | null }[])[0]?.logo ?? null,
          student,
          card: {
            status: card.status,
            revision: card.revision,
            generalAverage: card.general_average != null ? Number(card.general_average) : null,
            totalCoefficient: card.total_coefficient != null ? Number(card.total_coefficient) : null,
            subjectsGraded: card.subjects_graded,
            subjectsTotal: card.subjects_total,
            generalComment: card.general_comment,
          },
          lines: (lineRows as Record<string, unknown>[]).map((l) => ({
            ...l,
            coefficient: Number(l.coefficient),
            average: l.average != null ? Number(l.average) : null,
          })),
          attendance: stats,
          printedAt: new Date().toISOString(),
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Résultats annuels : moyenne pondérée sur les périodes (aucune période
// manquante convertie en zéro ; décision non déduite automatiquement)
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/annual-results',
  requirePermission('annual_results.view'),
  asyncHandler(async (req, res) => {
    const parsed = annualResultsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const { schoolYearId, classId, studentId } = parsed.data;
    const conn = await getPool().getConnection();
    try {
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, classId);
      }
      const [periodRows] = await conn.query(
        `SELECT id, name, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate
         FROM grading_periods WHERE school_year_id = ? ORDER BY display_order, id`,
        [schoolYearId]
      );
      const periods = periodRows as { id: number; name: string; endDate: string }[];
      const roster = await periodRoster(conn, classId, periods.length > 0 ? periods[periods.length - 1].endDate : '2999-12-31');
      const targets = studentId ? roster.filter((s) => s.id === studentId) : roster;
      const [decRows] = await conn.query(
        `SELECT student_id, decision, other_label, comment, decided_at
         FROM annual_decisions WHERE school_year_id = ? AND student_id IN (?)`,
        [schoolYearId, targets.length > 0 ? targets.map((t) => t.id) : [0]]
      );
      const decisions = decRows as {
        student_id: number;
        decision: 'promoted' | 'repeats' | 'other' | null;
        other_label: string | null;
        comment: string | null;
        decided_at: Date | null;
      }[];

      const results = [];
      for (const s of targets) {
        const periodAverages: { periodId: number; periodName: string; average: number | null }[] = [];
        let weightedSum = 0;
        let coeffSum = 0;
        for (const p of periods) {
          const computed = await computeCard(conn, s.id, classId, p.id);
          for (const l of computed.lines) {
            if (l.average !== null) {
              weightedSum += l.average * l.coefficient;
              coeffSum += l.coefficient;
            }
          }
          periodAverages.push({ periodId: p.id, periodName: p.name, average: computed.generalAverage });
        }
        const annualAverage = coeffSum > 0 ? Math.round((weightedSum / coeffSum) * 100) / 100 : null;
        const dec = decisions.find((d) => d.student_id === s.id);
        results.push({
          studentId: s.id,
          matricule: s.matricule,
          studentName: `${s.last_name} ${s.first_names}`,
          periodAverages,
          annualAverage,
          decision: dec?.decision ?? null,
          decisionLabel:
            dec?.decision === 'promoted'
              ? 'Passage'
              : dec?.decision === 'repeats'
                ? 'Redoublement'
                : dec?.decision === 'other'
                  ? dec.other_label ?? 'Autre'
                  : 'À déterminer',
          decisionComment: dec?.comment ?? null,
          decidedAt: dec?.decided_at ?? null,
        });
      }
      res.json({
        data: {
          periods: periods.map((p) => ({ id: p.id, name: p.name })),
          results: targets.length === 0 ? results : results,
        },
        meta: {
          rule:
            'Moyenne annuelle = Σ(moyenne matière × coefficient matière sur toutes les périodes) / Σ(coefficients) ; les périodes sans note valide ne sont jamais converties en zéro ; décision non calculée automatiquement.',
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------------
// Décisions annuelles (administration)
// ---------------------------------------------------------------------------
reportsRouter.get(
  '/annual-decisions',
  requirePermission('annual_results.view'),
  asyncHandler(async (req, res) => {
    const yearId = Number(req.query.schoolYearId);
    const classId = Number(req.query.classId);
    if (!Number.isInteger(yearId) || yearId <= 0) throw badRequest('Année scolaire invalide.');
    if (!Number.isInteger(classId) || classId <= 0) throw badRequest('Classe requise.');
    const conn = await getPool().getConnection();
    try {
      if (req.user!.role_code !== 'admin') {
        await assertClassAccess(conn, req.user!, classId);
      }
      const [rows] = await conn.query(
        `SELECT ad.student_id, ad.decision, ad.other_label, ad.comment, ad.decided_at,
                s.matricule, s.last_name, s.first_names, c.name AS className
         FROM annual_decisions ad
         JOIN students s ON s.id = ad.student_id
         JOIN classes c ON c.id = ad.class_id
         WHERE ad.school_year_id = ? AND ad.class_id = ?
         ORDER BY s.last_name, s.first_names`,
        [yearId, classId]
      );
      res.json({ data: rows });
    } finally {
      conn.release();
    }
  })
);

reportsRouter.post(
  '/annual-decisions',
  requirePermission('annual_decisions.manage'),
  asyncHandler(async (req, res) => {
    const parsed = annualDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Décision invalide.', parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;
    if (d.decision === 'other' && (!d.otherLabel || d.otherLabel.length < 2)) {
      throw badRequest('Libellé requis pour une décision « autre ».');
    }
    const result = await withTransaction(async (conn) => {
      const [cls] = await conn.query(
        'SELECT school_year_id FROM classes WHERE id = ? LIMIT 1',
        [d.classId]
      );
      const clsRow = (cls as { school_year_id: number }[])[0];
      if (!clsRow) throw notFound('Classe introuvable.');
      if (clsRow.school_year_id !== d.schoolYearId) {
        throw badRequest('La classe n’appartient pas à cette année scolaire.');
      }
      await conn.query(
        `INSERT INTO annual_decisions
         (student_id, class_id, school_year_id, decision, other_label, comment, decided_by, decided_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE decision = VALUES(decision), other_label = VALUES(other_label),
           comment = VALUES(comment), decided_by = VALUES(decided_by), decided_at = NOW(),
           updated_by = VALUES(created_by)`,
        [d.studentId, d.classId, d.schoolYearId, d.decision, d.otherLabel ?? null, d.comment ?? null, req.user!.id, req.user!.id]
      );
      return { message: 'Décision enregistrée.' };
    });
    await writeAudit({
      actorId: req.user!.id,
      action: 'annual_decisions.set',
      entityType: 'annual_decision',
      entityId: d.studentId,
      details: { decision: d.decision, schoolYearId: d.schoolYearId },
    });
    res.json(result);
  })
);
