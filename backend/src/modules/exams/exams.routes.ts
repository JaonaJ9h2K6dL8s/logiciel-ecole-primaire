import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { todayInAppTz } from '../../shared/time';
import { teacherAssessmentsCondition } from '../grading/grading.helpers';
import { ASSESSMENT_TYPES } from '../grading/grading.schemas';

/**
 * Module Examens (étape 12) : couche de planification et de vue au-dessus de la
 * table unique `assessments`. Aucune table de notes supplémentaire : le tableau
 * de bord et le calendrier agrègent les évaluations de type épreuve organisée
 * (exam, composition, ds) tout en restant capables d'afficher les autres types.
 *
 * Accès : permission `assessments.view`, avec le même filtrage professeur que
 * la liste des évaluations (teacherAssessmentsCondition). Aucune donnée d'une
 * classe non autorisée ne franchit ces endpoints.
 */
export const examsRouter = Router();

examsRouter.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).');
const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois invalide (AAAA-MM, 01 à 12).');

const dashboardQuerySchema = z.object({
  schoolYearId: z.coerce.number().int().positive().optional(),
  gradingPeriodId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  assessmentType: z.enum(ASSESSMENT_TYPES).optional(),
  fromDate: dateStr.optional(),
  toDate: dateStr.optional(),
});

const calendarQuerySchema = z
  .object({
    classId: z.coerce.number().int().positive('Classe requise.'),
    month: monthStr.optional(),
    fromDate: dateStr.optional(),
    toDate: dateStr.optional(),
  })
  .refine((v) => v.month || (v.fromDate && v.toDate), {
    message: 'Fournir un mois (AAAA-MM) ou une plage de dates (fromDate + toDate).',
  })
  .refine((v) => !(v.fromDate && v.toDate) || v.toDate >= v.fromDate, {
    message: 'La date de fin doit suivre la date de début.',
  });

interface FilterScope {
  whereSql: string;
  params: unknown[];
}

function buildScope(
  user: { id: number; role_code: string },
  q: {
    schoolYearId?: number;
    gradingPeriodId?: number;
    classId?: number;
    subjectId?: number;
    assessmentType?: (typeof ASSESSMENT_TYPES)[number];
    fromDate?: string;
    toDate?: string;
  }
): FilterScope {
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (user.role_code !== 'admin') {
    where.push(teacherAssessmentsCondition(user.id));
    params.push(user.id, user.id, user.id);
  }
  if (q.schoolYearId) {
    where.push('a.school_year_id = ?');
    params.push(q.schoolYearId);
  }
  if (q.gradingPeriodId) {
    where.push('a.grading_period_id = ?');
    params.push(q.gradingPeriodId);
  }
  if (q.classId) {
    where.push('a.class_id = ?');
    params.push(q.classId);
  }
  if (q.subjectId) {
    where.push('a.subject_id = ?');
    params.push(q.subjectId);
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
  return { whereSql: where.join(' AND '), params };
}

// ---------- Classes visibles par l'utilisateur courant (référentiel léger) ----------
/**
 * Année scolaire active + classes visibles, sans exiger school_years.manage ni
 * academics.view : l'admin voit toutes les classes actives de l'année, un
 * professeur uniquement celles qui lui sont affectées (même règle que le reste
 * du module). Utilisé par les filtres des pages /exams.
 */
examsRouter.get(
  '/classes',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const [yearRows] = await getPool().query(
      'SELECT id, label FROM school_years WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
    );
    const year = (yearRows as { id: number; label: string }[])[0] ?? null;

    let classes: unknown[] = [];
    if (year) {
      const scoped =
        req.user!.role_code === 'admin'
          ? 'c.is_active = 1 AND c.school_year_id = ?'
          : `c.is_active = 1 AND c.school_year_id = ? AND c.id IN
             (SELECT class_id FROM teacher_class_assignments
              WHERE teacher_id = ? AND assigned_to IS NULL)`;
      const params = req.user!.role_code === 'admin' ? [year.id] : [year.id, req.user!.id];
      const [rows] = await getPool().query(
        `SELECT c.id, c.name, l.name AS levelName, c.school_year_id AS schoolYearId
         FROM classes c
         JOIN levels l ON l.id = c.level_id
         WHERE ${scoped}
         ORDER BY c.name`,
        params
      );
      classes = rows as unknown[];
    }

    res.json({ data: { activeYear: year, classes } });
  })
);

// ---------- Tableau de bord des examens ----------
examsRouter.get(
  '/dashboard',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const parsed = dashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const { whereSql, params } = buildScope(req.user!, parsed.data);
    const today = todayInAppTz();

    // Indicateurs globaux : total, à venir, passés, notes restant à saisir
    // (épreuve passée ou du jour sans aucune note réellement saisie).
    const [kpiRows] = await getPool().query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(a.assessment_date >= ?), 0) AS upcoming,
              COALESCE(SUM(a.assessment_date < ?), 0) AS past,
              COALESCE(SUM(a.assessment_date <= ? AND NOT EXISTS (
                SELECT 1 FROM grades g
                WHERE g.assessment_id = a.id AND g.grade_status <> 'not_graded')), 0) AS awaitingGrades
       FROM assessments a
       WHERE ${whereSql}`,
      [today, today, today, ...params]
    );
    const kpi = (kpiRows as { total: number; upcoming: number; past: number; awaitingGrades: number }[])[0];

    const [typeRows] = await getPool().query(
      `SELECT a.assessment_type AS type, COUNT(*) AS count
       FROM assessments a WHERE ${whereSql}
       GROUP BY a.assessment_type ORDER BY count DESC`,
      params
    );

    const [upcomingRows] = await getPool().query(
      `SELECT a.id, a.title, a.assessment_type AS assessmentType,
              DATE_FORMAT(a.assessment_date, '%Y-%m-%d') AS assessmentDate,
              TIME_FORMAT(a.start_time, '%H:%i') AS startTime,
              a.duration_minutes AS durationMinutes,
              c.name AS className, sb.name AS subjectName,
              u.full_name AS teacherName, a.status,
              (SELECT COUNT(*) FROM grades g WHERE g.assessment_id = a.id AND g.grade_status <> 'not_graded') AS gradesEntered
       FROM assessments a
       JOIN classes c ON c.id = a.class_id
       JOIN subjects sb ON sb.id = a.subject_id
       JOIN users u ON u.id = a.teacher_id
       WHERE ${whereSql} AND a.assessment_date >= ?
       ORDER BY a.assessment_date ASC, a.start_time ASC, a.id ASC
       LIMIT 10`,
      [...params, today]
    );

    res.json({
      data: {
        total: Number(kpi.total),
        upcoming: Number(kpi.upcoming),
        past: Number(kpi.past),
        awaitingGrades: Number(kpi.awaitingGrades),
        byType: (typeRows as { type: string; count: number }[]).map((r) => ({
          type: r.type,
          count: Number(r.count),
        })),
        upcomingItems: upcomingRows,
      },
      referenceDate: today,
    });
  })
);

// ---------- Calendrier des épreuves d'une classe ----------
interface CalendarItem {
  id: number;
  title: string;
  assessmentType: string;
  assessmentDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  subjectName: string;
  teacherName: string;
  status: string;
}

interface CalendarConflict {
  date: string;
  aId: number;
  bId: number;
  kind: 'overlap' | 'same_day';
  message: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Détection des chevauchements / coexistences par jour (avertissement, non bloquant). */
function computeCalendarConflicts(items: CalendarItem[]): CalendarConflict[] {
  const conflicts: CalendarConflict[] = [];
  const byDate = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const list = byDate.get(it.assessmentDate) ?? [];
    list.push(it);
    byDate.set(it.assessmentDate, list);
  }
  for (const [date, dayItems] of byDate) {
    if (dayItems.length < 2) continue;
    for (let i = 0; i < dayItems.length; i++) {
      for (let j = i + 1; j < dayItems.length; j++) {
        const x = dayItems[i];
        const y = dayItems[j];
        const label = (e: CalendarItem) =>
          `« ${e.title} » (${e.subjectName}${e.startTime ? `, ${e.startTime}` : ''}${
            e.durationMinutes ? `, ${e.durationMinutes} min` : ''
          })`;
        if (x.startTime && x.durationMinutes && y.startTime && y.durationMinutes) {
          const xStart = toMinutes(x.startTime);
          const yStart = toMinutes(y.startTime);
          const xEnd = xStart + x.durationMinutes;
          const yEnd = yStart + y.durationMinutes;
          if (xStart < yEnd && yStart < xEnd) {
            conflicts.push({
              date,
              aId: x.id,
              bId: y.id,
              kind: 'overlap',
              message: `Chevauchement de créneaux le ${date} : ${label(x)} et ${label(y)}.`,
            });
          }
        } else {
          conflicts.push({
            date,
            aId: x.id,
            bId: y.id,
            kind: 'same_day',
            message: `Plusieurs épreuves le même jour (${date}) : ${label(x)} et ${label(y)}.`,
          });
        }
      }
    }
  }
  return conflicts;
}

examsRouter.get(
  '/calendar',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const parsed = calendarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    let fromDate = q.fromDate;
    let toDate = q.toDate;
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      fromDate = `${q.month}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      toDate = `${q.month}-${String(lastDay).padStart(2, '0')}`;
    }

    const { whereSql, params } = buildScope(req.user!, {
      classId: q.classId,
      fromDate,
      toDate,
    });

    const [rows] = await getPool().query(
      `SELECT a.id, a.title, a.assessment_type AS assessmentType,
              DATE_FORMAT(a.assessment_date, '%Y-%m-%d') AS assessmentDate,
              TIME_FORMAT(a.start_time, '%H:%i') AS startTime,
              a.duration_minutes AS durationMinutes,
              sb.name AS subjectName, u.full_name AS teacherName, a.status
       FROM assessments a
       JOIN subjects sb ON sb.id = a.subject_id
       JOIN users u ON u.id = a.teacher_id
       WHERE ${whereSql}
       ORDER BY a.assessment_date ASC, a.start_time ASC, a.id ASC`,
      params
    );
    const items = rows as CalendarItem[];

    res.json({
      data: items,
      conflicts: computeCalendarConflicts(items),
      range: { fromDate, toDate },
    });
  })
);
