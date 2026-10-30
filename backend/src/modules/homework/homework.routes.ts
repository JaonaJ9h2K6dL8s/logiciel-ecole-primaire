import { Router, type Request } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, forbidden, notFound, conflict } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { todayInAppTz, toAppDateString } from '../../shared/time';
import {
  loadHomework,
  assertHomeworkAccess,
  assertHomeworkManage,
  assertClassSubjectManage,
  teacherScopeSql,
  recordHistory,
  answersVisible,
  questionsPointsTotal,
  type Conn,
} from './homework.helpers';
import {
  createHomeworkSchema,
  updateHomeworkSchema,
  questionsSchema,
  assignStudentsSchema,
  submissionSchema,
  integrateSchema,
  listQuerySchema,
  calendarQuerySchema,
} from './homework.schemas';

export const homeworkRouter = Router();

homeworkRouter.use(requireAuth);

/** Vue : consultation (professeurs + admin). */
const requireView = requirePermission('homework.view');
/** Gestion : création, édition, questions, affectations, suivi, correction. */
const requireManage = requirePermission('homework.manage');

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const HOMEWORK_SELECT = `SELECT hw.id, hw.school_year_id, hw.class_id, hw.subject_id, hw.teacher_id,
    hw.title, hw.description, hw.homework_type,
    DATE_FORMAT(hw.publish_date, '%Y-%m-%d') AS publish_date,
    DATE_FORMAT(hw.due_date, '%Y-%m-%d') AS due_date,
    hw.estimated_minutes,
    hw.max_score, hw.status, hw.corrections_published, hw.created_by, hw.created_at, hw.updated_at,
    c.name AS className, l.name AS levelName, s.name AS subjectName, y.label AS yearLabel,
    u.full_name AS teacherName`;

const HOMEWORK_JOIN = ` FROM homework hw
    JOIN classes c ON c.id = hw.class_id
    JOIN levels l ON l.id = c.level_id
    JOIN subjects s ON s.id = hw.subject_id
    JOIN school_years y ON y.id = hw.school_year_id
    LEFT JOIN users u ON u.id = hw.teacher_id`;

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
homeworkRouter.get(
  '/',
  requireView,
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const scope = teacherScopeSql(req.user!);
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [...scope.params];
    if (q.year) {
      where.push('hw.school_year_id = ?');
      params.push(q.year);
    }
    if (q.class) {
      where.push('hw.class_id = ?');
      params.push(q.class);
    }
    if (q.subject) {
      where.push('hw.subject_id = ?');
      params.push(q.subject);
    }
    if (q.status !== 'all') {
      where.push('hw.status = ?');
      params.push(q.status);
    }
    if (q.type !== 'all') {
      where.push('hw.homework_type = ?');
      params.push(q.type);
    }
    if (q.q) {
      where.push('hw.title LIKE ?');
      params.push(`%${q.q}%`);
    }
    const whereSql = where.join(' AND ');
    const [countRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM homework hw WHERE ${whereSql}${scope.join}`,
      params
    );
    const total = n((countRows[0] as Record<string, unknown>)?.total);
    const offset = (q.page - 1) * q.limit;
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${HOMEWORK_SELECT}${HOMEWORK_JOIN} WHERE ${whereSql}${scope.join}
       ORDER BY COALESCE(hw.due_date, hw.created_at) DESC, hw.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.limit, offset]
    );
    res.json({
      data: {
        items: rows,
        pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Options de formulaire (années + classes accessibles)
// ---------------------------------------------------------------------------
/** Admin : toutes les années et toutes les classes actives de l'année demandée.
 *  Professeur : uniquement les années/classes de ses affectations actives,
 *  sans exposer /school-years (school_years.manage) ni /academics/classes
 *  (academics.manage). */
homeworkRouter.get(
  '/form-options',
  requireView,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const admin = user.role_code === 'admin';
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
          [user.id]
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
            [schoolYearId, user.id]
          );
    }
    res.json({ data: { years: (years as unknown[])[0], classes: (classes as unknown[])[0] } });
  })
);

// ---------------------------------------------------------------------------
// Création (brouillon ou publication immédiate)
// ---------------------------------------------------------------------------
homeworkRouter.post(
  '/',
  requireManage,
  asyncHandler(async (req, res) => {
    const q = createHomeworkSchema.parse(req.body);
    const user = req.user!;

    // La classe doit appartenir à l'année scolaire sélectionnée.
    const conn = await getPool().getConnection();
    let classOk = false;
    try {
      const [rows] = await conn.query(
        'SELECT 1 FROM classes WHERE id = ? AND school_year_id = ? LIMIT 1',
        [q.class_id, q.school_year_id]
      );
      classOk = (rows as unknown[]).length > 0;
    } finally {
      conn.release();
    }
    if (!classOk) throw badRequest('Cette classe n’appartient pas à l’année scolaire sélectionnée.');

    // Le professeur doit être affecté à la classe et à la matière.
    await assertClassSubjectManage(getPool(), user, q.class_id, q.subject_id, q.school_year_id);

    const publishDate = q.publish_date ?? (q.publish ? todayInAppTz() : null);
    const id = await withTransaction(async (tx) => {
      const [ins] = await tx.query(
        `INSERT INTO homework (school_year_id, class_id, subject_id, teacher_id, title, description,
           homework_type, publish_date, due_date, estimated_minutes, max_score, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q.school_year_id, q.class_id, q.subject_id, user.id, q.title,
          q.description ?? null, q.homework_type, publishDate, q.due_date ?? null,
          q.estimated_minutes ?? null, q.max_score ?? null,
          q.publish ? 'published' : 'draft', user.id, user.id,
        ]
      );
      const hwId = (ins as { insertId: number }).insertId;
      await recordHistory(tx, hwId, null, null, q.publish ? 'published' : 'draft', 'Création', user.id);
      return hwId;
    });

    await writeAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: 'homework.create',
      entityType: 'homework',
      entityId: id,
      details: { title: q.title, published: q.publish },
    });

    // Notification interne facultative : annonce publiée ciblant la classe.
    if (q.publish && q.notify_class) {
      await createHomeworkAnnouncement(id, user);
    }

    res.status(201).json({ data: { id } });
  })
);

/** Annonce interne de publication (réutilise school_announcements + targets). */
async function createHomeworkAnnouncement(homeworkId: number, user: { id: number; username: string }): Promise<void> {
  const hw = await loadHomework(homeworkId);
  await withTransaction(async (tx) => {
    const [ins] = await tx.query(
      `INSERT INTO school_announcements (title, content, author_id, status, published_at, created_by, updated_by)
       VALUES (?, ?, ?, 'published', NOW(), ?, ?)`,
      [
        `Nouveau devoir : ${hw.title}`.slice(0, 150),
        `Un devoir « ${hw.title} » a été publié${hw.due_date ? ` (à rendre le ${hw.due_date})` : ''}.`,
        user.id, user.id, user.id,
      ]
    );
    const annId = (ins as { insertId: number }).insertId;
    await tx.query(
      `INSERT INTO school_announcement_targets (announcement_id, class_id) VALUES (?, ?)`,
      [annId, hw.class_id]
    );
  });
}

// ---------------------------------------------------------------------------
// Détails
// ---------------------------------------------------------------------------
homeworkRouter.get(
  '/:id(\\d+)',
  requireView,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${HOMEWORK_SELECT}${HOMEWORK_JOIN} WHERE hw.id = ?`,
      [id]
    );
    const hw = (rows as unknown as Record<string, unknown>[])[0];
    if (!hw) throw notFound('Devoir introuvable.');
    await assertHomeworkAccess(getPool(), req.user!, await loadHomework(id));

    const [counts] = await getPool().query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM homework_questions WHERE homework_id = ?) AS questions,
         (SELECT COUNT(*) FROM homework_assignments WHERE homework_id = ?) AS assigned,
         (SELECT COUNT(*) FROM homework_submissions WHERE homework_id = ? AND status IN ('submitted','late','graded')) AS submitted,
         (SELECT COUNT(*) FROM homework_submissions WHERE homework_id = ? AND status = 'graded') AS graded`,
      [id, id, id, id]
    );
    const c = counts[0] as Record<string, unknown>;
    res.json({
      data: {
        ...hw,
        counts: {
          questions: n(c.questions),
          assigned: n(c.assigned),
          submitted: n(c.submitted),
          graded: n(c.graded),
        },
        canManage: req.user!.role_code === 'admin' || hw.created_by === req.user!.id,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Modification (tracée après publication)
// ---------------------------------------------------------------------------
homeworkRouter.patch(
  '/:id(\\d+)',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    if (hw.status === 'archived') {
      throw forbidden('Un devoir archivé ne peut pas être modifié sans réouverture autorisée.');
    }
    if (hw.status === 'closed') {
      throw forbidden('Un devoir clôturé ne peut plus être modifié.');
    }
    const q = updateHomeworkSchema.parse(req.body);

    const pointsTotal = await questionsPointsTotal(getPool(), id);
    if (pointsTotal !== null && q.max_score !== undefined && q.max_score !== null && q.max_score > 0) {
      if (Math.abs(pointsTotal - q.max_score) > 0.01) {
        throw badRequest(
          `Le barème (${q.max_score}) ne correspond pas au total des questions (${pointsTotal}).`
        );
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, string> = {
      title: 'title', description: 'description', homework_type: 'homework_type',
      publish_date: 'publish_date', due_date: 'due_date',
      estimated_minutes: 'estimated_minutes', max_score: 'max_score',
    };
    for (const [key, col] of Object.entries(map)) {
      if (q[key as keyof typeof q] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(q[key as keyof typeof q] ?? null);
      }
    }
    if (fields.length === 0) throw badRequest('Aucune modification fournie.');

    const traced = hw.status === 'published';
    await withTransaction(async (tx) => {
      await tx.query(`UPDATE homework SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
      if (traced) {
        await recordHistory(tx, id, null, 'published', 'published', 'Modification après publication', req.user!.id);
      }
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: traced ? 'homework.edit_published' : 'homework.edit',
      entityType: 'homework',
      entityId: id,
      details: { fields: Object.keys(map).filter((k) => q[k as keyof typeof q] !== undefined) },
    });
    res.json({ data: { id, traced } });
  })
);

// ---------------------------------------------------------------------------
// Transitions de statut : publication, clôture, archivage, réouverture
// ---------------------------------------------------------------------------
const transitionSchema = z.object({ note: z.string().trim().max(255).optional() });

async function transition(
  req: Request,
  from: string[],
  to: string,
  extra?: (hw: import('./homework.helpers').HomeworkRow) => Promise<void>
) {
  const id = Number(req.params.id);
  const hw = await loadHomework(id);
  await assertHomeworkManage(getPool(), req.user!, hw);
  if (!from.includes(hw.status)) {
    throw conflict(`Transition non autorisée : ${hw.status} → ${to}.`);
  }
  const note = transitionSchema.parse(req.body ?? {}).note ?? null;
  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE homework SET status = ?${to === 'published' ? ', publish_date = COALESCE(publish_date, ?)' : ''} WHERE id = ?`,
      to === 'published' ? [to, todayInAppTz(), id] : [to, id]
    );
    await recordHistory(tx, id, null, hw.status, to, note, req.user!.id);
  });
  if (extra) await extra(hw);
  await writeAudit({
    actorId: req.user!.id,
    actorUsername: req.user!.username,
    action: `homework.${to}`,
    entityType: 'homework',
    entityId: id,
  });
  return hw;
}

homeworkRouter.post(
  '/:id(\\d+)/publish',
  requireManage,
  asyncHandler(async (req, res) => {
    const hw = await transition(req, ['draft'], 'published');
    const notify = (req.body as { notify_class?: boolean } | undefined)?.notify_class === true;
    if (notify) await createHomeworkAnnouncement(hw.id, req.user!);
    res.json({ data: { id: hw.id, status: 'published' } });
  })
);

homeworkRouter.post(
  '/:id(\\d+)/close',
  requireManage,
  asyncHandler(async (req, res) => {
    const hw = await transition(req, ['published'], 'closed');
    res.json({ data: { id: hw.id, status: 'closed' } });
  })
);

homeworkRouter.post(
  '/:id(\\d+)/archive',
  requireManage,
  asyncHandler(async (req, res) => {
    const hw = await transition(req, ['closed'], 'archived');
    res.json({ data: { id: hw.id, status: 'archived' } });
  })
);

homeworkRouter.post(
  '/:id(\\d+)/reopen',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    // Réouverture d'un devoir archivé : réservée à l'admin (réouverture autorisée).
    if (req.user!.role_code !== 'admin') {
      throw forbidden('Seul l’administration peut rouvrir un devoir archivé.');
    }
    const hw = await loadHomework(id);
    if (hw.status !== 'archived') throw conflict('Seul un devoir archivé peut être rouvert.');
    await withTransaction(async (tx) => {
      await tx.query(`UPDATE homework SET status = 'closed' WHERE id = ?`, [id]);
      await recordHistory(tx, id, null, 'archived', 'closed', 'Réouverture autorisée', req.user!.id);
    });
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'homework.reopen',
      entityType: 'homework',
      entityId: id,
    });
    res.json({ data: { id, status: 'closed' } });
  })
);

// ---------------------------------------------------------------------------
// Suppression : uniquement brouillon sans affectation ni remise
// ---------------------------------------------------------------------------
homeworkRouter.delete(
  '/:id(\\d+)',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    const [deps] = await getPool().query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM homework_assignments WHERE homework_id = ?) AS assignments,
         (SELECT COUNT(*) FROM homework_submissions WHERE homework_id = ?) AS submissions`,
      [id, id]
    );
    const d = deps[0] as Record<string, unknown>;
    if (hw.status !== 'draft' || n(d.assignments) > 0 || n(d.submissions) > 0) {
      throw conflict(
        'Un devoir publié ou avec historique ne peut pas être supprimé : archivez-le plutôt.'
      );
    }
    await getPool().query('DELETE FROM homework WHERE id = ?', [id]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'homework.delete_draft',
      entityType: 'homework',
      entityId: id,
      details: { title: hw.title },
    });
    res.json({ data: { id } });
  })
);

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
homeworkRouter.get(
  '/:id(\\d+)/questions',
  requireView,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkAccess(getPool(), req.user!, hw);
    const showAnswers = answersVisible(req.user!, hw);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id, display_order, question_type, statement, instructions, points, options_json
       ${showAnswers ? ', expected_answer, pedagogical_explanation' : ''}
       FROM homework_questions WHERE homework_id = ? ORDER BY display_order, id`,
      [id]
    );
    res.json({
      data: {
        questions: rows,
        answersVisible: showAnswers,
        pointsTotal: await questionsPointsTotal(getPool(), id),
      },
    });
  })
);

homeworkRouter.put(
  '/:id(\\d+)/questions',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    if (hw.status === 'closed' || hw.status === 'archived') {
      throw forbidden('Les questions d’un devoir clôturé ou archivé ne peuvent plus être modifiées.');
    }
    const q = questionsSchema.parse(req.body);
    if (hw.max_score !== null && Number(hw.max_score) > 0) {
      const withPoints = q.questions.filter((x) => x.points !== null && x.points !== undefined);
      const total = withPoints.reduce((acc, x) => acc + Number(x.points), 0);
      if (withPoints.length > 0 && Math.abs(total - Number(hw.max_score)) > 0.01) {
        throw badRequest(
          `Le total des points (${Math.round(total * 100) / 100}) doit correspondre au barème (${Number(hw.max_score)}).`
        );
      }
    }
    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM homework_questions WHERE homework_id = ?', [id]);
      let order = 1;
      for (const item of q.questions) {
        await tx.query(
          `INSERT INTO homework_questions (homework_id, display_order, question_type, statement,
             instructions, points, options_json, expected_answer, pedagogical_explanation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, order, item.question_type, item.statement,
            item.instructions ?? null, item.points ?? null,
            item.options ? JSON.stringify(item.options) : null,
            item.expected_answer ?? null, item.pedagogical_explanation ?? null,
          ]
        );
        order += 1;
      }
    });
    res.json({ data: { id, count: q.questions.length } });
  })
);

homeworkRouter.post(
  '/:id(\\d+)/publish-corrections',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    if (hw.status === 'draft') throw conflict('Publiez le devoir avant de publier les corrections.');
    if (hw.corrections_published === 1) throw conflict('Les corrections sont déjà publiées.');
    await withTransaction(async (tx) => {
      await tx.query('UPDATE homework SET corrections_published = 1 WHERE id = ?', [id]);
      await recordHistory(tx, id, null, hw.status, hw.status, 'Publication des corrections', req.user!.id);
    });
    res.json({ data: { id, corrections_published: 1 } });
  })
);

// ---------------------------------------------------------------------------
// Affectations aux élèves
// ---------------------------------------------------------------------------

/** Élèves éligibles (inscriptions actives de la classe/année du devoir). */
homeworkRouter.get(
  '/:id(\\d+)/candidates',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT s.id, s.matricule, s.last_name, s.first_names
       FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.school_year_id = ? AND e.class_id = ? AND e.status = 'active'
       ORDER BY s.last_name, s.first_names, s.matricule`,
      [hw.school_year_id, hw.class_id]
    );
    res.json({ data: rows });
  })
);

homeworkRouter.post(
  '/:id(\\d+)/assign',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    if (hw.status === 'archived') throw forbidden('Un devoir archivé ne peut pas recevoir d’affectations.');
    const q = assignStudentsSchema.parse(req.body);

    // Inscriptions actives uniquement, dans la classe et l'année du devoir.
    const [valid] = await getPool().query<RowDataPacket[]>(
      `SELECT e.student_id, s.last_name, s.first_names
       FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.school_year_id = ? AND e.class_id = ? AND e.status = 'active'
         AND e.student_id IN (${q.student_ids.map(() => '?').join(',')})`,
      [hw.school_year_id, hw.class_id, ...q.student_ids]
    );
    const validIds = (valid as { student_id: number }[]).map((r) => Number(r.student_id));
    const invalid = q.student_ids.filter((sid) => !validIds.includes(sid));
    if (validIds.length === 0) {
      throw badRequest('Aucun élève valide : les élèves doivent être inscrits activement dans la classe du devoir.');
    }

    let inserted = 0;
    await withTransaction(async (tx) => {
      for (const sid of validIds) {
        // Éviter les affectations identiques (clé unique) et journaliser les nouvelles.
        const [exists] = await tx.query(
          'SELECT 1 FROM homework_assignments WHERE homework_id = ? AND student_id = ? LIMIT 1',
          [id, sid]
        );
        if ((exists as unknown[]).length > 0) continue;
        await tx.query(
          `INSERT INTO homework_assignments (homework_id, student_id, class_id, assigned_by)
           VALUES (?, ?, ?, ?)`,
          [id, sid, hw.class_id, req.user!.id]
        );
        await recordHistory(tx, id, sid, null, 'assigned', 'Affectation', req.user!.id);
        inserted += 1;
      }
    });
    res.json({ data: { inserted, skipped: validIds.length - inserted, invalid } });
  })
);

/** Roster : élèves affectés + état de remise (ou tous les élèves actifs si rien d'affecté). */
homeworkRouter.get(
  '/:id(\\d+)/roster',
  requireView,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkAccess(getPool(), req.user!, hw);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT s.id AS studentId, s.matricule, s.last_name, s.first_names,
              ha.assigned_at AS assignedAt,
              hs.status AS submissionStatus, hs.submitted_at AS submittedAt,
              hs.feedback, hs.indicative_score AS indicativeScore
       FROM homework_assignments ha
       JOIN students s ON s.id = ha.student_id
       LEFT JOIN homework_submissions hs ON hs.homework_id = ha.homework_id AND hs.student_id = ha.student_id
       WHERE ha.homework_id = ?
       ORDER BY s.last_name, s.first_names, s.matricule`,
      [id]
    );
    res.json({ data: rows });
  })
);

// ---------------------------------------------------------------------------
// Remises manuelles et corrections
// ---------------------------------------------------------------------------
homeworkRouter.post(
  '/:id(\\d+)/submissions',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    if (hw.status === 'archived') throw forbidden('Un devoir archivé n’accepte plus de remises.');
    const q = submissionSchema.parse(req.body);

    // L'élève doit être affecté au devoir (destinataires explicites).
    const [asg] = await getPool().query(
      'SELECT 1 FROM homework_assignments WHERE homework_id = ? AND student_id = ? LIMIT 1',
      [id, q.student_id]
    );
    if ((asg as unknown[]).length === 0) {
      throw badRequest('Cet élève n’est pas affecté à ce devoir.');
    }

    const submittedAt = q.submitted_at ? new Date(q.submitted_at) : null;
    let status = q.status;
    // Retard automatique : remise enregistrée après la date limite (jour, fuseau app).
    if (status === 'submitted' && hw.due_date && submittedAt) {
      const day = toAppDateString(submittedAt);
      if (day > hw.due_date) status = 'late';
    }
    const effectiveSubmittedAt =
      status === 'submitted' || status === 'late' || status === 'graded'
        ? submittedAt ?? new Date()
        : submittedAt;
    const isGraded = status === 'graded';

    await withTransaction(async (tx) => {
      const [existing] = await tx.query(
        `SELECT id, status FROM homework_submissions WHERE homework_id = ? AND student_id = ? LIMIT 1`,
        [id, q.student_id]
      );
      const prev = (existing as { id: number; status: string }[])[0];
      if (prev) {
        await tx.query(
          `UPDATE homework_submissions SET status = ?, submitted_at = ?, recorded_by = ?, comment = ?,
             feedback = ?, indicative_score = ?, graded_by = ?, graded_at = ?, updated_by = ?
           WHERE id = ?`,
          [
            status, effectiveSubmittedAt, req.user!.id, q.comment ?? null,
            q.feedback ?? null, q.indicative_score ?? null,
            isGraded ? req.user!.id : null,
            isGraded ? new Date() : null,
            req.user!.id,
            prev.id,
          ]
        );
      } else {
        await tx.query(
          `INSERT INTO homework_submissions (homework_id, student_id, status, submitted_at, recorded_by,
             comment, feedback, indicative_score, graded_by, graded_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, q.student_id, status, effectiveSubmittedAt, req.user!.id,
            q.comment ?? null, q.feedback ?? null, q.indicative_score ?? null,
            isGraded ? req.user!.id : null,
            isGraded ? new Date() : null,
            req.user!.id,
          ]
        );
      }
      await recordHistory(tx, id, q.student_id, prev?.status ?? null, status, q.comment ?? null, req.user!.id);
    });
    res.json({ data: { homeworkId: id, studentId: q.student_id, status } });
  })
);

/** Historique des statuts d'un élève pour un devoir (fiche individuelle). */
homeworkRouter.get(
  '/:id(\\d+)/student/:studentId(\\d+)',
  requireView,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const hw = await loadHomework(id);
    await assertHomeworkAccess(getPool(), req.user!, hw);
    const [submission] = await getPool().query<RowDataPacket[]>(
      `SELECT hs.*, s.matricule, s.last_name, s.first_names, u.full_name AS recorderName
       FROM homework_submissions hs
       JOIN students s ON s.id = hs.student_id
       LEFT JOIN users u ON u.id = hs.recorded_by
       WHERE hs.homework_id = ? AND hs.student_id = ? LIMIT 1`,
      [id, studentId]
    );
    const [history] = await getPool().query<RowDataPacket[]>(
      `SELECT hsh.old_status, hsh.new_status, hsh.note, hsh.changed_at, u.username AS changedBy
       FROM homework_status_history hsh LEFT JOIN users u ON u.id = hsh.changed_by
       WHERE hsh.homework_id = ? AND hsh.student_id = ? ORDER BY hsh.changed_at, hsh.id`,
      [id, studentId]
    );
    res.json({
      data: {
        submission: (submission as Record<string, unknown>[])[0] ?? null,
        history,
      },
    });
  })
);

/** Suivi agrégé par classe (statistiques de remise). */
homeworkRouter.get(
  '/:id(\\d+)/tracking',
  requireView,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkAccess(getPool(), req.user!, hw);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT s.id AS studentId, s.matricule, s.last_name, s.first_names,
              COALESCE(hs.status, 'todo') AS status
       FROM homework_assignments ha
       JOIN students s ON s.id = ha.student_id
       LEFT JOIN homework_submissions hs ON hs.homework_id = ha.homework_id AND hs.student_id = ha.student_id
       WHERE ha.homework_id = ?`,
      [id]
    );
    const students = (rows as unknown as { studentId: number; matricule: string; last_name: string; first_names: string; status: string }[])
      .map((r) => ({ studentId: r.studentId, matricule: r.matricule, lastName: r.last_name, firstName: r.first_names, status: r.status }));
    const counts: Record<string, number> = {
      todo: 0, started: 0, submitted: 0, late: 0, graded: 0, not_submitted: 0,
    };
    for (const st of students) if (st.status in counts) counts[st.status] += 1;
    const assigned = students.length;
    const submittedCount = counts.submitted + counts.late + counts.graded;
    const submissionRate = assigned > 0 ? Math.round((submittedCount / assigned) * 10000) / 100 : null;
    res.json({
      data: {
        homework: { id: hw.id, title: hw.title, due_date: hw.due_date, status: hw.status },
        assigned,
        counts,
        submittedCount,
        lateCount: counts.late,
        notSubmittedCount: counts.todo + counts.started + counts.not_submitted,
        submissionRate,
        students,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Calendrier (fuseau Indian/Antananarivo côté serveur)
// ---------------------------------------------------------------------------
homeworkRouter.get(
  '/calendar',
  requireView,
  asyncHandler(async (req, res) => {
    const q = calendarQuerySchema.parse(req.query);
    const scope = teacherScopeSql(req.user!);
    const now = new Date();
    const month = q.month ?? now.getMonth() + 1;
    const yearNum = q.year ?? now.getFullYear();
    const firstDay = `${yearNum}-${String(month).padStart(2, '0')}-01`;
    const lastDayNum = new Date(Date.UTC(yearNum, month, 0)).getUTCDate();
    const lastDay = `${yearNum}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
    const where: string[] = ['hw.due_date BETWEEN ? AND ?', "hw.status IN ('published','closed')"];
    const params: unknown[] = [firstDay, lastDay, ...scope.params];
    if (q.class) {
      where.push('hw.class_id = ?');
      params.push(q.class);
    }
    if (q.subject) {
      where.push('hw.subject_id = ?');
      params.push(q.subject);
    }
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${HOMEWORK_SELECT}${HOMEWORK_JOIN} WHERE ${where.join(' AND ')}${scope.join}
       ORDER BY hw.due_date, hw.class_id, hw.title`,
      params
    );
    const items = rows as unknown as Record<string, unknown>[];
    // Détection de charge : plusieurs devoirs le même jour pour la même classe.
    const perDayClass = new Map<string, number>();
    for (const it of items) {
      const key = `${String(it.due_date).slice(0, 10)}|${String(it.class_id)}`;
      perDayClass.set(key, (perDayClass.get(key) ?? 0) + 1);
    }
    const days = new Map<string, unknown[]>();
    for (const it of items) {
      const day = String(it.due_date).slice(0, 10);
      const key = `${day}|${String(it.class_id)}`;
      const list = days.get(day) ?? [];
      list.push({ ...it, sameDayClassCount: perDayClass.get(key) ?? 1, overload: (perDayClass.get(key) ?? 1) >= 3 });
      days.set(day, list);
    }
    res.json({
      data: {
        month: firstDay.slice(0, 7),
        today: todayInAppTz(),
        days: Array.from(days.entries()).map(([day, homeworks]) => ({ day, homeworks })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Intégration aux notes officielles (module existant des évaluations)
// ---------------------------------------------------------------------------
homeworkRouter.post(
  '/:id(\\d+)/integrate',
  requireManage,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hw = await loadHomework(id);
    await assertHomeworkManage(getPool(), req.user!, hw);
    if (hw.status !== 'published' && hw.status !== 'closed') {
      throw conflict('Seul un devoir publié ou clôturé peut être intégré aux notes officielles.');
    }
    const q = integrateSchema.parse(req.body);

    // Période de l'année scolaire du devoir.
    const [gp] = await getPool().query(
      'SELECT id FROM grading_periods WHERE id = ? AND school_year_id = ? LIMIT 1',
      [q.grading_period_id, hw.school_year_id]
    );
    if ((gp as unknown[]).length === 0) {
      throw badRequest('Période inconnue pour l’année scolaire de ce devoir.');
    }

    // Anti-doublon : une seule évaluation liée par devoir.
    const [dup] = await getPool().query(
      'SELECT id FROM assessments WHERE homework_id = ? LIMIT 1',
      [id]
    );
    if ((dup as unknown[]).length > 0) {
      throw conflict('Ce devoir a déjà été intégré aux notes officielles.');
    }

    const maxScore = q.max_score ?? (hw.max_score !== null ? Number(hw.max_score) : 20);
    const title = q.title ?? hw.title;
    const coefficient = q.coefficient ?? 1;

    const assessmentId = await withTransaction(async (tx) => {
      const [ins] = await tx.query(
        `INSERT INTO assessments (class_id, subject_id, school_year_id, grading_period_id, title,
           assessment_type, assessment_date, max_score, coefficient, teacher_id, status, created_by, homework_id)
         VALUES (?, ?, ?, ?, ?, 'homework', ?, ?, ?, ?, 'draft', ?, ?)`,
        [hw.class_id, hw.subject_id, hw.school_year_id, q.grading_period_id, title,
         q.assessment_date, maxScore, coefficient, req.user!.id, req.user!.id, id]
      );
      const asmtId = (ins as { insertId: number }).insertId;

      // Notes indicatives des remises corrigées → notes officielles (brouillon).
      const [graded] = await tx.query(
        `SELECT student_id, indicative_score FROM homework_submissions
         WHERE homework_id = ? AND status = 'graded' AND indicative_score IS NOT NULL`,
        [id]
      );
      for (const row of graded as { student_id: number; indicative_score: string | number }[]) {
        await tx.query(
          `INSERT INTO grades (assessment_id, student_id, score, grade_status, created_by)
           VALUES (?, ?, ?, 'graded', ?)
           ON DUPLICATE KEY UPDATE score = VALUES(score), created_by = VALUES(created_by)`,
          [asmtId, row.student_id, Number(row.indicative_score), req.user!.id]
        );
      }
      await recordHistory(tx, id, null, hw.status, hw.status, `Intégrée aux notes officielles (évaluation #${asmtId})`, req.user!.id);
      return asmtId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'homework.integrate',
      entityType: 'homework',
      entityId: id,
      details: { assessmentId, gradingPeriodId: q.grading_period_id },
    });
    res.status(201).json({ data: { assessmentId } });
  })
);
