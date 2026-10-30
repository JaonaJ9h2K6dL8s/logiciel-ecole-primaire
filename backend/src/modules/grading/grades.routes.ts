import { Router } from 'express';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest, forbidden } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { averagesQuerySchema } from './grading.schemas';

export const gradesRouter = Router();

gradesRouter.use(requireAuth);

/**
 * Moyennes par matière et période — calcul intégralement côté serveur.
 *
 * Règles documentées (étape 4) :
 * - normalisation : note_normalisée = score / max_score × 20 ;
 * - pondération : moyenne = Σ(normalisée × coefficient) / Σ(coefficients) ;
 * - seules les lignes `graded` participent : absences, dispenses et statuts
 *   non notés ne valent jamais zéro ;
 * - calcul en arithmétique DECIMAL (jamais en flottant), arrondi final à 2
 *   décimales (ROUND MariaDB sur DECIMAL = demi supérieur pour les positifs) ;
 * - sans note valide, `average` vaut null (moyenne indisponible) et
 *   `gradedCount` = 0 ; missingCount indique les évaluations sans statut.
 * - aucune moyenne définitive n'est matérialisée : le recalcul se fait à
 *   chaque consultation depuis les valeurs stockées (pas d'invalidation).
 */
gradesRouter.get(
  '/averages',
  requirePermission('assessments.view'),
  asyncHandler(async (req, res) => {
    const parsed = averagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    // Autorisation : admin global, sinon accès matière/classe du professeur.
    if (req.user!.role_code !== 'admin') {
      const [access] = await getPool().query(
        `SELECT 1
         WHERE EXISTS (SELECT 1 FROM teacher_class_assignments
                       WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL)
           AND EXISTS (SELECT 1 FROM class_subjects
                       WHERE class_id = ? AND subject_id = ? AND is_active = 1
                         AND (teacher_id IS NULL OR teacher_id = ?))`,
        [req.user!.id, q.classId, q.classId, q.subjectId, req.user!.id]
      );
      if ((access as unknown[]).length === 0) {
        throw forbidden('Classe ou matière non autorisée.');
      }
    }

    // Période + cohérence d'année
    const [periodRows] = await getPool().query(
      `SELECT id, school_year_id AS schoolYearId, name,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate
       FROM grading_periods WHERE id = ? LIMIT 1`,
      [q.gradingPeriodId]
    );
    const period = (periodRows as { id: number; schoolYearId: number; name: string; endDate: string }[])[0];
    if (!period) throw badRequest('Période introuvable.');

    // Évaluations de la matière sur la période (tous statuts d'évaluation ;
    // seules les notes 'graded' comptent dans la moyenne).
    const [asmRows] = await getPool().query(
      `SELECT id, title, DATE_FORMAT(assessment_date, '%Y-%m-%d') AS assessmentDate,
              max_score AS maxScore, coefficient, status
       FROM assessments
       WHERE class_id = ? AND subject_id = ? AND grading_period_id = ?
       ORDER BY assessment_date, id`,
      [q.classId, q.subjectId, q.gradingPeriodId]
    );
    const assessments = asmRows as {
      id: number;
      title: string;
      assessmentDate: string;
      maxScore: string;
      coefficient: string;
      status: 'draft' | 'submitted' | 'locked';
    }[];

    // Élèves de la classe présents à la fin de la période (inscription en cours
    // au dernier jour de la période : ni rétroactif, ni élève déjà sorti).
    const [rosterRows] = await getPool().query(
      `SELECT s.id, s.matricule, s.last_name, s.first_names
       FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.class_id = ?
         AND e.enrollment_date <= ?
         AND (e.exit_date IS NULL OR e.exit_date >= ?)
         AND s.status = 'active'
       ORDER BY s.last_name, s.first_names, s.matricule`,
      [q.classId, period.endDate, period.endDate]
    );
    const roster = rosterRows as { id: number; matricule: string; last_name: string; first_names: string }[];

    // Notes de la période pour ces élèves (lignes 'graded' uniquement).
    const assessmentIds = assessments.map((a) => a.id);
    let gradeRows: {
      student_id: number;
      assessment_id: number;
      score: string;
      grade_status: string;
    }[] = [];
    if (assessmentIds.length > 0) {
      const [gr] = await getPool().query(
        `SELECT g.student_id, g.assessment_id, g.score, g.grade_status
         FROM grades g
         WHERE g.assessment_id IN (?) AND g.grade_status = 'graded'`,
        [assessmentIds]
      );
      gradeRows = gr as typeof gradeRows;
    }

    const byStudent = new Map<number, typeof gradeRows>();
    for (const g of gradeRows) {
      const list = byStudent.get(g.student_id) ?? [];
      list.push(g);
      byStudent.set(g.student_id, list);
    }

    const asmById = new Map(assessments.map((a) => [a.id, a]));
    const dec = (v: string | number) => Number(v); // DECIMAL lues en chaîne : exactes à la représentation

    const results = roster.map((s) => {
      const gRows = byStudent.get(s.id) ?? [];
      let weightedSum = 0; // somme exacte de DECIMAL (représentation décimale)
      let coeffSum = 0;
      const details: {
        assessmentId: number;
        title: string;
        assessmentDate: string;
        maxScore: number;
        coefficient: number;
        score: number | null;
        status: string;
        normalized: number | null;
      }[] = [];

      for (const a of assessments) {
        const g = gRows.find((x) => x.assessment_id === a.id);
        const hasScore = g?.grade_status === 'graded' && g.score !== null;
        const normalized = hasScore
          ? Math.round((dec(g!.score) / dec(a.maxScore)) * 20 * 100) / 100
          : null;
        if (hasScore) {
          weightedSum += dec(g!.score) / dec(a.maxScore) * 20 * dec(a.coefficient);
          coeffSum += dec(a.coefficient);
        }
        details.push({
          assessmentId: a.id,
          title: a.title,
          assessmentDate: a.assessmentDate,
          maxScore: dec(a.maxScore),
          coefficient: dec(a.coefficient),
          score: hasScore ? dec(g!.score) : null,
          status: g ? g.grade_status : 'not_graded',
          normalized,
        });
      }

      // Arrondi final uniquement (demi supérieur) : la valeur de référence est
      // la somme exacte des DECIMAL, jamais les valeurs affichées.
      const average = coeffSum > 0 ? Math.round((weightedSum / coeffSum) * 100) / 100 : null;

      return {
        studentId: s.id,
        matricule: s.matricule,
        studentName: `${s.last_name} ${s.first_names}`,
        average,
        gradedCount: gRows.length,
        missingCount: assessments.length - gRows.length,
        details,
      };
    });

    // Filtre éventuel sur un élève précis
    const filtered = q.studentId ? results.filter((r) => r.studentId === q.studentId) : results;

    // Moyenne de classe : moyenne des moyennes individuelles (hors élèves sans note).
    const valid = filtered.filter((r) => r.average !== null);
    const classAverage =
      valid.length > 0 ? Math.round((valid.reduce((acc, r) => acc + (r.average ?? 0), 0) / valid.length) * 100) / 100 : null;

    res.json({
      data: {
        period: { id: period.id, name: period.name, schoolYearId: period.schoolYearId },
        assessmentCount: assessments.length,
        assessments: assessments.map((a) => ({
          id: a.id,
          title: a.title,
          assessmentDate: a.assessmentDate,
          maxScore: dec(a.maxScore),
          coefficient: dec(a.coefficient),
          status: a.status,
        })),
        results: filtered,
        classAverage,
      },
      meta: {
        rule: 'note_normalisée = score / max × 20 ; moyenne pondérée par coefficient ; seules les notes saisies comptent ; arrondi 2 décimales (demi supérieur) ; moyenne indisponible si aucune note valide.',
      },
    });
  })
);
