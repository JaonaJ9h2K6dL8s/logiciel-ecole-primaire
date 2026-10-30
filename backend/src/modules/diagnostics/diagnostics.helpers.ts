import { getPool } from '../../database/pool';
import { forbidden, notFound } from '../../shared/errors';
import type { RowDataPacket, PoolConnection, Pool } from 'mysql2/promise';

/**
 * Module Évaluations diagnostiques (étape 14).
 * Cloisonnement : un professeur ne voit et n'anime que les tests des classes
 * qui lui sont affectées (teacher_class_assignments, affectation active).
 * L'admin a une vue globale conforme à ses permissions.
 */
export function isAdminRole(role: string): boolean {
  return role === 'admin';
}

export async function assertTestClassAccess(
  conn: PoolConnection | Pool,
  user: { id: number; role_code: string },
  classId: number
): Promise<void> {
  if (isAdminRole(user.role_code)) return;
  const [rows] = await (conn as PoolConnection).query(
    'SELECT 1 FROM teacher_class_assignments WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL LIMIT 1',
    [user.id, classId]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Classe non autorisée pour ce professeur.');
  }
}

/** Condition SQL de visibilité des tests pour un utilisateur non-admin. */
export function teacherScopeCondition(userId: number): string {
  return `(dt.class_id IN (SELECT class_id FROM teacher_class_assignments WHERE teacher_id = ? AND assigned_to IS NULL))`;
}

export interface DiagnosticQuestionRow extends RowDataPacket {
  id: number;
  test_id: number;
  competency_id: number | null;
  display_order: number;
  question_type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'open';
  statement: string;
  points: string;
  options_json: string | null;
  expected_answer: string | null;
}

export interface DiagnosticAttemptRow extends RowDataPacket {
  id: number;
  test_id: number;
  student_id: number;
  status: 'in_progress' | 'submitted';
  score: string | null;
  max_score: string | null;
  percentage: string | null;
  answered_count: number;
  question_count: number;
  level: 'debutant' | 'intermediaire' | 'avance' | 'insufficient_data' | null;
  threshold_intermediate_min: number | null;
  threshold_advanced_min: number | null;
  min_answered_pct: number | null;
  results_json: string | null;
}

/** Normalisation d'une réponse courte : casse, accents et espaces ignorés. */
export function normalizeShort(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Les colonnes JSON de MariaDB sont renvoyées déjà désérialisées par mysql2 :
 * accepter une valeur déjà parsée ou une chaîne JSON.
 */
export function parseJsonSafe<T = unknown>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    // Chaîne simple (colonne JSON déjà désérialisée par mysql2, ex. « neuf ») :
    // renvoyée telle quelle plutôt que perdue.
    return value as T;
  }
}

/**
 * Correction automatique d'une question. Retourne null si la question est de
 * type « open » (correction manuelle exigée) ou si la réponse est absente.
 */
export function autoGrade(
  type: DiagnosticQuestionRow['question_type'],
  expectedRaw: string | null,
  value: unknown
): { correct: boolean } | null {
  if (type === 'open') return null;
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (expectedRaw === null || expectedRaw === undefined) return null;
  const expected = parseJsonSafe(expectedRaw);
  if (expected === null) return null;
  switch (type) {
    case 'single_choice':
      return { correct: typeof value === 'number' && value === expected };
    case 'multiple_choice': {
      if (!Array.isArray(value) || !Array.isArray(expected)) return { correct: false };
      const a = [...(value as unknown[])].map(Number).sort((x, y) => x - y);
      const b = [...(expected as unknown[])].map(Number).sort((x, y) => x - y);
      return { correct: a.length === b.length && a.every((v, i) => v === b[i]) };
    }
    case 'true_false':
      return { correct: value === expected };
    case 'short_answer': {
      if (typeof value !== 'string') return { correct: false };
      const variants = (Array.isArray(expected) ? expected : [expected]).map((v) => normalizeShort(String(v)));
      return { correct: variants.includes(normalizeShort(value)) };
    }
    default:
      return null;
  }
}

export interface CompetencyResult {
  code: string;
  name: string;
  earned: number;
  max: number;
  pct: number | null;
  mastered: boolean | null;
}

export interface AttemptComputation {
  score: number;
  maxScore: number;
  percentage: number | null;
  answeredCount: number;
  level: 'debutant' | 'intermediaire' | 'avance' | 'insufficient_data' | null;
  resultsJson: {
    competencies: CompetencyResult[];
    openPending: number;
    computedAt: string;
  };
}

/**
 * Calcul des résultats d'une tentative. Le niveau n'est attribué que si :
 * - toutes les questions « open » sont corrigées (aucun point en attente), et
 * - le ratio de questions renseignées atteint min_answered_pct (sinon
 *   « insufficient_data » — jamais de niveau sur des données insuffisantes).
 * Une compétence est « maîtrisée » si son taux atteint le seuil intermédiaire.
 */
export function computeAttemptResults(params: {
  questions: DiagnosticQuestionRow[];
  competencies: { id: number; code: string; name: string }[];
  answers: Map<number, { answer_json: string | null; points_earned: string | null }>;
  thresholds: { intermediateMin: number; advancedMin: number; minAnsweredPct: number };
}): AttemptComputation {
  const { questions, competencies, answers, thresholds } = params;
  let score = 0;
  let maxScore = 0;
  let answeredCount = 0;
  let openPending = 0;

  const perCompetency = new Map<number, { earned: number; max: number }>();
  for (const c of competencies) perCompetency.set(c.id, { earned: 0, max: 0 });
  const noCompetency = { earned: 0, max: 0 };

  for (const q of questions) {
    const pts = Number(q.points);
    maxScore += pts;
    const a = answers.get(q.id);
    const hasAnswer = Boolean(a && a.answer_json !== null && a.answer_json !== undefined);
    if (hasAnswer) answeredCount += 1;
    const bucket = q.competency_id !== null && perCompetency.has(q.competency_id) ? perCompetency.get(q.competency_id)! : noCompetency;
    bucket.max += pts;
    if (!a) continue;
    if (a.points_earned !== null && a.points_earned !== undefined) {
      const earned = Number(a.points_earned);
      score += earned;
      bucket.earned += earned;
    } else if (hasAnswer && q.question_type === 'open') {
      openPending += 1;
    }
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : null;
  const totalQuestions = questions.length;
  const answeredPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const insufficient = answeredPct < thresholds.minAnsweredPct;

  let level: AttemptComputation['level'] = null;
  if (insufficient || openPending > 0) {
    level = 'insufficient_data';
  } else if (percentage !== null) {
    level = percentage >= thresholds.advancedMin ? 'avance' : percentage >= thresholds.intermediateMin ? 'intermediaire' : 'debutant';
  }

  const competenciesResults: CompetencyResult[] = competencies.map((c) => {
    const b = perCompetency.get(c.id)!;
    return {
      code: c.code,
      name: c.name,
      earned: Math.round(b.earned * 100) / 100,
      max: Math.round(b.max * 100) / 100,
      pct: b.max > 0 ? Math.round((b.earned / b.max) * 10000) / 100 : null,
      mastered: b.max > 0 && openPending === 0 ? b.earned / b.max * 100 >= thresholds.intermediateMin : null,
    };
  });
  if (noCompetency.max > 0) {
    competenciesResults.push({
      code: '(sans compétence)',
      name: 'Questions non rattachées',
      earned: Math.round(noCompetency.earned * 100) / 100,
      max: Math.round(noCompetency.max * 100) / 100,
      pct: Math.round((noCompetency.earned / noCompetency.max) * 10000) / 100,
      mastered: openPending === 0 ? (noCompetency.earned / noCompetency.max) * 100 >= thresholds.intermediateMin : null,
    });
  }

  return {
    score: Math.round(score * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    percentage,
    answeredCount,
    level,
    resultsJson: {
      competencies: competenciesResults,
      openPending,
      computedAt: new Date().toISOString(),
    },
  };
}

export async function loadTestOr404(conn: PoolConnection | Pool, testId: number) {
  const [rows] = await (conn as PoolConnection).query('SELECT * FROM diagnostic_tests WHERE id = ?', [testId]);
  const t = (rows as RowDataPacket[])[0];
  if (!t) throw notFound('Test diagnostique introuvable.');
  return t as RowDataPacket & {
    id: number;
    title: string;
    class_id: number;
    subject_id: number;
    school_year_id: number;
    level_id: number;
    status: 'draft' | 'published' | 'closed' | 'archived';
    threshold_intermediate_min: number;
    threshold_advanced_min: number;
    min_answered_pct: number;
  };
}
