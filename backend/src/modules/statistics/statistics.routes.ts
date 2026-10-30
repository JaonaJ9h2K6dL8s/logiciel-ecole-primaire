import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../database/pool';
import { asyncHandler, notFound, badRequest } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { todayInAppTz } from '../../shared/time';
import {
  listYears,
  resolveYear,
  resolvePeriod,
  listPeriods,
  defaultRange,
  rate,
  scopedClassIds,
  scopeSql,
  activeEnrollmentJoin,
} from './statistics.helpers';
import {
  overviewQuerySchema,
  attendanceQuerySchema,
  periodQuerySchema,
  activityQuerySchema,
  yearQuerySchema,
} from './statistics.schemas';

export const statisticsRouter = Router();

statisticsRouter.use(requireAuth, requirePermission('statistics.view'));

/** Coercition numérique : les SUM/AVG DECIMAL arrivent en chaînes via mysql2. */
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
const CARD_STATUSES = ['draft', 'ready', 'validated', 'locked', 'cancelled'] as const;

function statusCounts(rows: { status: string; n: unknown }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of STATUSES) out[s] = 0;
  for (const r of rows) out[r.status] = n(r.n);
  return out;
}

function cardStatusCounts(rows: { status: string; n: unknown }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of CARD_STATUSES) out[s] = 0;
  for (const r of rows) if (r.status in out) out[r.status] = n(r.n);
  return out;
}

// ---------------------------------------------------------------------------
// Années disponibles (sélecteur du centre de pilotage)
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/years',
  asyncHandler(async (_req, res) => {
    res.json({ data: await listYears() });
  })
);

// ---------------------------------------------------------------------------
// Vue d'ensemble : effectifs, journée en cours, bulletins, activité
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const q = overviewQuerySchema.parse(req.query);
    const year = await resolveYear(q.year);
    if (!year) throw notFound('Aucune année scolaire trouvée.');
    const date = q.date ?? todayInAppTz();
    const classIds = await scopedClassIds(year.id, req.user!);

    const [enrolledRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT student_id) AS n FROM enrollments
       WHERE school_year_id = ? AND status = 'active'${scopeSql(classIds, 'class_id')}`,
      [year.id]
    );
    const [byLevelRows] = await getPool().query<RowDataPacket[]>(
      `SELECT l.name AS level, COUNT(DISTINCT e.student_id) AS n
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN levels l ON l.id = c.level_id
       WHERE e.school_year_id = ? AND e.status = 'active'${scopeSql(classIds, 'c.id')}
       GROUP BY l.id, l.name, l.order_index
       ORDER BY l.order_index, l.name`,
      [year.id]
    );
    const [punchRows] = await getPool().query<RowDataPacket[]>(
      `SELECT
         SUM(ep.event_type = 'ARRIVAL') AS arrivals,
         SUM(ep.event_type = 'EXIT') AS exits,
         COUNT(DISTINCT CASE WHEN ep.event_type = 'ARRIVAL' THEN ep.student_id END) AS distinctStudents
       FROM entry_punches ep${activeEnrollmentJoin(classIds, 'en', 'ep')}
       WHERE ep.school_year_id = ? AND ep.school_date = ? AND ep.status = 'valid'`,
      [year.id, date]
    );
    const [callRows] = await getPool().query<RowDataPacket[]>(
      `SELECT ar.status, COUNT(*) AS n
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.school_year_id = ? AND s.session_date = ?${scopeSql(classIds, 's.class_id')}
       GROUP BY ar.status`,
      [year.id, date]
    );
    const [sessionRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS sessions, COUNT(DISTINCT class_id) AS classes
       FROM attendance_sessions
       WHERE school_year_id = ? AND session_date = ?${scopeSql(classIds, 'class_id')}`,
      [year.id, date]
    );
    const [enrollmentStatusRows] = await getPool().query<RowDataPacket[]>(
      `SELECT status, COUNT(DISTINCT student_id) AS n
       FROM enrollments WHERE school_year_id = ?${scopeSql(classIds, 'class_id')}
       GROUP BY status`,
      [year.id]
    );

    const period = await resolvePeriod(year.id);
    let reportCards: Record<string, number> | null = null;
    if (period) {
      const [rcRows] = await getPool().query<RowDataPacket[]>(
        `SELECT status, COUNT(*) AS n FROM report_cards
         WHERE school_year_id = ? AND grading_period_id = ?${scopeSql(classIds, 'class_id')}
         GROUP BY status`,
        [year.id, period.id]
      );
      reportCards = cardStatusCounts(rcRows as unknown as { status: string; n: unknown }[]);
    }

    const [eventRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM school_events
       WHERE status IN ('draft','planned') AND start_at >= NOW()
         AND start_at < DATE_ADD(NOW(), INTERVAL 30 DAY)`
    );
    const [followupRows] = await getPool().query<RowDataPacket[]>(
      `SELECT
         SUM(p.followup_status = 'todo') AS todo,
         SUM(p.followup_status = 'ongoing') AS ongoing,
         SUM(p.followup_status IN ('todo','ongoing') AND p.followup_due_date IS NOT NULL AND p.followup_due_date < CURDATE()) AS overdue
       FROM parent_contact_logs p${activeEnrollmentJoin(classIds, 'en2', 'p')}
       WHERE p.school_year_id = ?`,
      [year.id]
    );

    const attendanceCounts = statusCounts(callRows as unknown as { status: string; n: unknown }[]);
    const recorded = STATUSES.reduce((acc, s) => acc + attendanceCounts[s], 0);
    const punch = punchRows[0] ?? {};
    const followup = followupRows[0] ?? {};

    res.json({
      data: {
        year,
        asOfDate: date,
        enrollment: {
          active: n((enrolledRows[0] as Record<string, unknown>)?.n),
          byStatus: Object.fromEntries(
            (enrollmentStatusRows as unknown as { status: string; n: unknown }[]).map((r) => [r.status, n(r.n)])
          ),
          byLevel: (byLevelRows as unknown as { level: string; n: unknown }[]).map((r) => ({
            level: r.level,
            count: n(r.n),
          })),
        },
        today: {
          punches: {
            arrivals: n(punch.arrivals),
            exits: n(punch.exits),
            distinctStudents: n(punch.distinctStudents),
          },
          attendance: {
            sessions: n((sessionRows[0] as Record<string, unknown>)?.sessions),
            classes: n((sessionRows[0] as Record<string, unknown>)?.classes),
            byStatus: attendanceCounts,
            recorded,
          },
        },
        currentPeriod: period,
        reportCards,
        activity: {
          eventsNext30Days: n((eventRows[0] as Record<string, unknown>)?.n),
          followups: {
            todo: n(followup.todo),
            ongoing: n(followup.ongoing),
            overdue: n(followup.overdue),
          },
        },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Effectifs : par classe, par niveau, évolution inter-années
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/enrollment',
  asyncHandler(async (req, res) => {
    const q = yearQuerySchema.parse(req.query);
    const year = await resolveYear(q.year);
    if (!year) throw notFound('Aucune année scolaire trouvée.');
    const classIds = await scopedClassIds(year.id, req.user!);

    const [byClassRows] = await getPool().query<RowDataPacket[]>(
      `SELECT c.id AS classId, c.name AS className, l.name AS level, c.capacity,
              COUNT(DISTINCT e.student_id) AS active
       FROM classes c
       JOIN levels l ON l.id = c.level_id
       LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'active'
       WHERE c.school_year_id = ?${scopeSql(classIds, 'c.id')}
       GROUP BY c.id, c.name, l.name, l.order_index, c.capacity
       ORDER BY l.order_index, c.name`,
      [year.id]
    );
    const [byLevelRows] = await getPool().query<RowDataPacket[]>(
      `SELECT l.name AS level, COUNT(DISTINCT e.student_id) AS active
       FROM levels l
       JOIN classes c ON c.level_id = l.id AND c.school_year_id = ?
       LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'active'
       WHERE 1 = 1${scopeSql(classIds, 'c.id')}
       GROUP BY l.id, l.name, l.order_index
       ORDER BY l.order_index, l.name`,
      [year.id]
    );
    const yearScopeJoin =
      classIds === null
        ? ''
        : ' JOIN teacher_class_assignments tca ON tca.school_year_id = y.id' +
          ' AND tca.teacher_id = ? AND tca.assigned_to IS NULL AND tca.class_id = e.class_id';
    const [byYearRows] = await getPool().query<RowDataPacket[]>(
      `SELECT y.id AS yearId, y.label,
              COUNT(DISTINCT e.student_id) AS students,
              y.is_active AS isActive
       FROM school_years y
       LEFT JOIN enrollments e ON e.school_year_id = y.id AND e.status <> 'withdrawn'${yearScopeJoin}
       GROUP BY y.id, y.label, y.start_date, y.is_active
       ORDER BY y.start_date, y.id`,
      classIds === null ? [] : [req.user!.id]
    );
    const [statusRows] = await getPool().query<RowDataPacket[]>(
      `SELECT status, COUNT(DISTINCT student_id) AS n
       FROM enrollments WHERE school_year_id = ?${scopeSql(classIds, 'class_id')}
       GROUP BY status`,
      [year.id]
    );

    res.json({
      data: {
        year,
        byStatus: Object.fromEntries(
          (statusRows as unknown as { status: string; n: unknown }[]).map((r) => [r.status, n(r.n)])
        ),
        byClass: (byClassRows as unknown as Record<string, unknown>[]).map((r) => ({
          classId: n(r.classId),
          className: r.className,
          level: r.level,
          capacity: r.capacity === null ? null : n(r.capacity),
          active: n(r.active),
          fillRate: r.capacity === null ? null : rate(n(r.active), n(r.capacity)),
        })),
        byLevel: (byLevelRows as unknown as Record<string, unknown>[]).map((r) => ({
          level: r.level,
          active: n(r.active),
        })),
        byYear: (byYearRows as unknown as Record<string, unknown>[]).map((r) => ({
          yearId: n(r.yearId),
          label: r.label,
          isActive: n(r.isActive) === 1,
          students: n(r.students),
        })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Assiduité : appels en classe et pointages sur une plage de dates
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const q = attendanceQuerySchema.parse(req.query);
    const year = await resolveYear(q.year);
    if (!year) throw notFound('Aucune année scolaire trouvée.');
    const { from, to } = defaultRange(year, q.from, q.to);
    if (from > to) throw badRequest('La date de début doit précéder la date de fin.');
    const classIds = await scopedClassIds(year.id, req.user!);

    const [summaryRows] = await getPool().query<RowDataPacket[]>(
      `SELECT ar.status, COUNT(*) AS n
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.school_year_id = ? AND s.session_date BETWEEN ? AND ?${scopeSql(classIds, 's.class_id')}
       GROUP BY ar.status`,
      [year.id, from, to]
    );
    const [sessionRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS sessions, COUNT(DISTINCT class_id) AS classes,
              COUNT(DISTINCT session_date) AS days
       FROM attendance_sessions
       WHERE school_year_id = ? AND session_date BETWEEN ? AND ?${scopeSql(classIds, 'class_id')}`,
      [year.id, from, to]
    );
    const [byClassRows] = await getPool().query<RowDataPacket[]>(
      `SELECT c.id AS classId, c.name AS className, l.name AS level,
              COUNT(DISTINCT s.id) AS sessions,
              SUM(ar.status = 'PRESENT') AS present,
              SUM(ar.status = 'ABSENT') AS absent,
              SUM(ar.status = 'LATE') AS late,
              SUM(ar.status = 'EXCUSED') AS excused,
              COUNT(ar.id) AS recorded
       FROM attendance_sessions s
       JOIN classes c ON c.id = s.class_id
       JOIN levels l ON l.id = c.level_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id
       WHERE s.school_year_id = ? AND s.session_date BETWEEN ? AND ?${scopeSql(classIds, 'c.id')}
       GROUP BY c.id, c.name, l.name, l.order_index
       ORDER BY absent DESC, late DESC, c.name`,
      [year.id, from, to]
    );
    const [dailyRows] = await getPool().query<RowDataPacket[]>(
      `SELECT s.session_date AS sessionDate, DATE_FORMAT(s.session_date, "%Y-%m-%d") AS date,
              SUM(ar.status = 'PRESENT') AS present,
              SUM(ar.status = 'ABSENT') AS absent,
              SUM(ar.status = 'LATE') AS late,
              SUM(ar.status = 'EXCUSED') AS excused
       FROM attendance_sessions s
       LEFT JOIN attendance_records ar ON ar.session_id = s.id
       WHERE s.school_year_id = ? AND s.session_date BETWEEN ? AND ?${scopeSql(classIds, 's.class_id')}
       GROUP BY s.session_date
       ORDER BY s.session_date`,
      [year.id, from, to]
    );
    const [punchRows] = await getPool().query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(ep.school_date, "%Y-%m-%d") AS date,
              SUM(ep.event_type = 'ARRIVAL') AS arrivals,
              SUM(ep.event_type = 'EXIT') AS exits,
              COUNT(DISTINCT CASE WHEN ep.event_type = 'ARRIVAL' THEN ep.student_id END) AS students
       FROM entry_punches ep${activeEnrollmentJoin(classIds, 'en', 'ep')}
       WHERE ep.school_year_id = ? AND ep.school_date BETWEEN ? AND ? AND ep.status = 'valid'
       GROUP BY ep.school_date
       ORDER BY ep.school_date`,
      [year.id, from, to]
    );

    const counts = statusCounts(summaryRows as unknown as { status: string; n: unknown }[]);
    const recorded = STATUSES.reduce((acc, s) => acc + counts[s], 0);
    const sess = sessionRows[0] as Record<string, unknown> | undefined;

    res.json({
      data: {
        year,
        range: { from, to },
        summary: {
          sessions: n(sess?.sessions),
          classes: n(sess?.classes),
          days: n(sess?.days),
          byStatus: counts,
          recorded,
          rates: {
            present: rate(counts.PRESENT, recorded),
            absent: rate(counts.ABSENT, recorded),
            late: rate(counts.LATE, recorded),
            excused: rate(counts.EXCUSED, recorded),
          },
        },
        byClass: (byClassRows as unknown as Record<string, unknown>[]).map((r) => ({
          classId: n(r.classId),
          className: r.className,
          level: r.level,
          sessions: n(r.sessions),
          present: n(r.present),
          absent: n(r.absent),
          late: n(r.late),
          excused: n(r.excused),
          recorded: n(r.recorded),
        })),
        daily: (dailyRows as unknown as Record<string, unknown>[]).map((r) => ({
          date: r.date,
          present: n(r.present),
          absent: n(r.absent),
          late: n(r.late),
          excused: n(r.excused),
        })),
        punchDaily: (punchRows as unknown as Record<string, unknown>[]).map((r) => ({
          date: r.date,
          arrivals: n(r.arrivals),
          exits: n(r.exits),
          distinctStudents: n(r.students),
        })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Résultats : taux de réussite par période, classe et matière
// (source officielle : bulletins — general_average et lignes par matière)
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/grades',
  asyncHandler(async (req, res) => {
    const q = periodQuerySchema.parse(req.query);
    const year = await resolveYear(q.year);
    if (!year) throw notFound('Aucune année scolaire trouvée.');

    const periods = await listPeriods(year.id);
    if (q.period && !periods.some((p) => p.id === q.period)) {
      throw badRequest('Période inconnue pour cette année scolaire.');
    }
    const period = await resolvePeriod(year.id, q.period);
    const classIds = await scopedClassIds(year.id, req.user!);
    const rcScope = scopeSql(classIds, 'rc.class_id');

    const [byPeriodRows] = await getPool().query<RowDataPacket[]>(
      `SELECT gp.id AS periodId, gp.name AS periodName,
              COUNT(rc.id) AS cards,
              SUM(rc.general_average IS NOT NULL) AS gradedCards,
              AVG(rc.general_average) AS average,
              SUM(rc.general_average >= 10) AS success
       FROM grading_periods gp
       LEFT JOIN report_cards rc ON rc.grading_period_id = gp.id AND rc.status <> 'cancelled'${rcScope}
       WHERE gp.school_year_id = ?
       GROUP BY gp.id, gp.name, gp.display_order
       ORDER BY gp.display_order`,
      [year.id]
    );

    const byClass = period
      ? ((
          await getPool().query<RowDataPacket[]>(
            `SELECT c.id AS classId, c.name AS className, l.name AS level,
                    COUNT(rc.id) AS cards,
                    SUM(rc.general_average IS NOT NULL) AS gradedCards,
                    AVG(rc.general_average) AS average,
                    SUM(rc.general_average >= 10) AS success
             FROM classes c
             JOIN levels l ON l.id = c.level_id
             LEFT JOIN report_cards rc ON rc.class_id = c.id
                  AND rc.grading_period_id = ? AND rc.status <> 'cancelled'
             WHERE c.school_year_id = ?${scopeSql(classIds, 'c.id')}
             GROUP BY c.id, c.name, l.name, l.order_index
             ORDER BY l.order_index, c.name`,
            [period.id, year.id]
          )
        )[0] as unknown as Record<string, unknown>[])
      : [];

    const bySubject = period
      ? ((
          await getPool().query<RowDataPacket[]>(
            `SELECT sub.id AS subjectId, rcl.subject_name AS subjectName,
                    COUNT(rcl.average) AS gradedLines,
                    AVG(rcl.average) AS average,
                    SUM(rcl.average >= 10) AS success
             FROM report_card_lines rcl
             JOIN report_cards rc ON rc.id = rcl.report_card_id
             JOIN subjects sub ON sub.id = rcl.subject_id
             WHERE rc.school_year_id = ? AND rc.grading_period_id = ? AND rc.status <> 'cancelled'${rcScope}
             GROUP BY sub.id, rcl.subject_name
             ORDER BY rcl.subject_name`,
            [year.id, period.id]
          )
        )[0] as unknown as Record<string, unknown>[])
      : [];

    res.json({
      data: {
        year,
        periods,
        selectedPeriod: period,
        byPeriod: (byPeriodRows as unknown as Record<string, unknown>[]).map((r) => ({
          periodId: n(r.periodId),
          periodName: r.periodName,
          cards: n(r.cards),
          gradedCards: n(r.gradedCards),
          average: r.average === null ? null : Math.round(n(r.average) * 100) / 100,
          successRate: rate(n(r.success), n(r.gradedCards)),
        })),
        byClass: byClass.map((r) => ({
          classId: n(r.classId),
          className: r.className,
          level: r.level,
          cards: n(r.cards),
          gradedCards: n(r.gradedCards),
          average: r.average === null ? null : Math.round(n(r.average) * 100) / 100,
          successRate: rate(n(r.success), n(r.gradedCards)),
        })),
        bySubject: bySubject.map((r) => ({
          subjectId: n(r.subjectId),
          subjectName: r.subjectName,
          gradedLines: n(r.gradedLines),
          average: r.average === null ? null : Math.round(n(r.average) * 100) / 100,
          successRate: rate(n(r.success), n(r.gradedLines)),
        })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Bulletins : avancement par période et par classe
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/report-cards',
  asyncHandler(async (req, res) => {
    const q = periodQuerySchema.parse(req.query);
    const year = await resolveYear(q.year);
    if (!year) throw notFound('Aucune année scolaire trouvée.');

    const periods = await listPeriods(year.id);
    if (q.period && !periods.some((p) => p.id === q.period)) {
      throw badRequest('Période inconnue pour cette année scolaire.');
    }
    const period = await resolvePeriod(year.id, q.period);
    const classIds = await scopedClassIds(year.id, req.user!);
    const rcScope = scopeSql(classIds, 'rc.class_id');

    const [byPeriodRows] = await getPool().query<RowDataPacket[]>(
      `SELECT gp.id AS periodId, gp.name AS periodName,
              COUNT(rc.id) AS total,
              SUM(rc.status = 'draft') AS draft,
              SUM(rc.status = 'ready') AS ready,
              SUM(rc.status = 'validated') AS validated,
              SUM(rc.status = 'locked') AS locked,
              SUM(rc.status = 'cancelled') AS cancelled
       FROM grading_periods gp
       LEFT JOIN report_cards rc ON rc.grading_period_id = gp.id${rcScope}
       WHERE gp.school_year_id = ?
       GROUP BY gp.id, gp.name, gp.display_order
       ORDER BY gp.display_order`,
      [year.id]
    );

    const byClass = period
      ? ((
          await getPool().query<RowDataPacket[]>(
            `SELECT c.id AS classId, c.name AS className, l.name AS level,
                    (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e
                     WHERE e.class_id = c.id AND e.status = 'active') AS enrolled,
                    COUNT(rc.id) AS cards,
                    SUM(rc.status = 'draft') AS draft,
                    SUM(rc.status = 'ready') AS ready,
                    SUM(rc.status = 'validated') AS validated,
                    SUM(rc.status = 'locked') AS locked,
                    SUM(rc.status = 'cancelled') AS cancelled
             FROM classes c
             JOIN levels l ON l.id = c.level_id
             LEFT JOIN report_cards rc ON rc.class_id = c.id AND rc.grading_period_id = ?
             WHERE c.school_year_id = ?${scopeSql(classIds, 'c.id')}
             GROUP BY c.id, c.name, l.name, l.order_index
             ORDER BY l.order_index, c.name`,
            [period.id, year.id]
          )
        )[0] as unknown as Record<string, unknown>[])
      : [];

    res.json({
      data: {
        year,
        periods,
        selectedPeriod: period,
        byPeriod: (byPeriodRows as unknown as Record<string, unknown>[]).map((r) => ({
          periodId: n(r.periodId),
          periodName: r.periodName,
          total: n(r.total),
          ...cardStatusCounts(
            (['draft', 'ready', 'validated', 'locked', 'cancelled'] as const).map((s) => ({
              status: s,
              n: r[s],
            }))
          ),
        })),
        byClass: byClass.map((r) => {
          const enrolled = n(r.enrolled);
          const cards = n(r.cards);
          const cancelled = n(r.cancelled);
          return {
            classId: n(r.classId),
            className: r.className,
            level: r.level,
            enrolled,
            cards,
            draft: n(r.draft),
            ready: n(r.ready),
            validated: n(r.validated),
            locked: n(r.locked),
            cancelled,
            missing: Math.max(0, enrolled - (cards - cancelled)),
          };
        }),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Activité : événements à venir et suivis parents à traiter
// ---------------------------------------------------------------------------
statisticsRouter.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const q = activityQuerySchema.parse(req.query);
    // Les suivis concernent des élèves : cloisonnés par classe du professeur.
    // Les événements sont propres à l'établissement : visibles par tous.
    const activeYear = await resolveYear();
    const classIds = activeYear ? await scopedClassIds(activeYear.id, req.user!) : null;
    const fJoin = activeEnrollmentJoin(classIds, 'en', 'p');
    const fScope = scopeSql(classIds, 'en.class_id');

    const [events] = await getPool().query<RowDataPacket[]>(
      `SELECT e.id, e.title, cat.name AS category, cat.color, e.start_at AS startAt,
              e.end_at AS endAt, e.location, e.status
       FROM school_events e
       JOIN school_event_categories cat ON cat.id = e.category_id
       WHERE e.status IN ('draft','planned') AND e.start_at >= NOW()
       ORDER BY e.start_at
       LIMIT ?`,
      [q.limit]
    );
    const [followups] = await getPool().query<RowDataPacket[]>(
      `SELECT p.id, s.first_names AS firstNames, s.last_name AS lastName,
              p.occurred_at AS occurredAt, p.subject, p.channel,
              p.followup_status AS followupStatus,
              DATE_FORMAT(p.followup_due_date, "%Y-%m-%d") AS followupDueDate,
              p.action_decided AS actionDecided
       FROM parent_contact_logs p
       JOIN students s ON s.id = p.student_id${fJoin}
       WHERE p.followup_status IN ('todo','ongoing')${fScope}
       ORDER BY (p.followup_due_date IS NULL), p.followup_due_date, p.id DESC
       LIMIT ?`,
      [q.limit]
    );
    const [counts] = await getPool().query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM school_events
          WHERE status IN ('draft','planned') AND start_at >= NOW()
            AND start_at < DATE_ADD(NOW(), INTERVAL 30 DAY)) AS eventsNext30,
         (SELECT COUNT(*) FROM parent_contact_logs p${fJoin}
          WHERE p.followup_status = 'todo'${fScope}) AS todo,
         (SELECT COUNT(*) FROM parent_contact_logs p${fJoin}
          WHERE p.followup_status = 'ongoing'${fScope}) AS ongoing,
         (SELECT COUNT(*) FROM parent_contact_logs p${fJoin}
          WHERE p.followup_status IN ('todo','ongoing') AND p.followup_due_date IS NOT NULL
            AND p.followup_due_date < CURDATE()${fScope}) AS overdue`
    );
    const c = counts[0] as Record<string, unknown>;
    const today = todayInAppTz();

    res.json({
      data: {
        events: (events as unknown as Record<string, unknown>[]).map((e) => ({
          id: n(e.id),
          title: e.title,
          category: e.category,
          color: e.color,
          startAt: e.startAt,
          endAt: e.endAt,
          location: e.location,
          status: e.status,
        })),
        followups: (followups as unknown as Record<string, unknown>[]).map((f) => ({
          id: n(f.id),
          studentName: `${f.lastName ?? ''} ${f.firstNames ?? ''}`.trim(),
          occurredAt: f.occurredAt,
          subject: f.subject,
          channel: f.channel,
          followupStatus: f.followupStatus,
          followupDueDate: f.followupDueDate,
          actionDecided: f.actionDecided,
          overdue: f.followupDueDate !== null && String(f.followupDueDate).slice(0, 10) < today,
        })),
        counts: {
          eventsNext30: n(c.eventsNext30),
          followupsTodo: n(c.todo),
          followupsOngoing: n(c.ongoing),
          followupsOverdue: n(c.overdue),
        },
      },
    });
  })
);
