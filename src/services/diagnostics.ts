import { api } from './api';

/** Types et helpers du module Évaluations diagnostiques (étape 14). */

export const DIAGNOSTIC_QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'open',
] as const;
export type DiagnosticQuestionType = (typeof DIAGNOSTIC_QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<DiagnosticQuestionType, string> = {
  single_choice: 'Choix unique',
  multiple_choice: 'Choix multiples',
  true_false: 'Vrai ou faux',
  short_answer: 'Réponse courte',
  open: 'Question ouverte',
};

export const TEST_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  closed: 'Clôturé',
  archived: 'Archivé',
};

export const LEVEL_LABELS: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  insufficient_data: 'Données insuffisantes',
};

export const LEVEL_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'default'> = {
  avance: 'success',
  intermediaire: 'primary',
  debutant: 'warning',
  insufficient_data: 'default',
};

export interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

export interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  levelId: number;
  schoolYearId: number;
}

export interface ClassSubject {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  isActive: boolean;
}

export interface DiagnosticTestRow {
  id: number;
  title: string;
  description: string | null;
  schoolYearId: number;
  levelId: number;
  classId: number;
  subjectId: number;
  createdBy: number;
  durationMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  status: 'draft' | 'published' | 'closed' | 'archived';
  thresholdIntermediateMin: number;
  thresholdAdvancedMin: number;
  minAnsweredPct: number;
  createdAt: string;
  className: string;
  levelName: string;
  subjectName: string;
  authorName: string;
  questionCount?: number;
  submittedCount?: number;
  studentCount?: number;
}

export interface DiagnosticCompetency {
  id?: number;
  code: string;
  name: string;
  displayOrder?: number;
}

export interface DiagnosticQuestion {
  id?: number;
  competencyId?: number | null;
  competencyCode?: string | null;
  competencyName?: string | null;
  displayOrder: number;
  questionType: DiagnosticQuestionType;
  statement: string;
  points: number | string;
  options: string[] | null;
  expected: unknown;
}

export interface DiagnosticTestDetail {
  test: DiagnosticTestRow;
  competencies: DiagnosticCompetency[];
  questions: DiagnosticQuestion[];
}

export interface DiagnosticListFilters {
  schoolYearId?: string;
  classId?: string;
  subjectId?: string;
  status?: string;
}

export interface CompetencyResult {
  code: string;
  name: string;
  earned: number;
  max: number;
  pct: number | null;
  mastered: boolean | null;
}

export interface AttemptResultData {
  score: number;
  maxScore: number;
  percentage: number | null;
  answeredCount: number;
  level: string | null;
  resultsJson: {
    competencies: CompetencyResult[];
    openPending: number;
    computedAt: string;
  };
}

export interface AttemptAnswer {
  id: number;
  questionId: number;
  statement: string;
  questionType: DiagnosticQuestionType;
  points: number | string;
  competencyCode: string | null;
  competencyName: string | null;
  answer: unknown;
  expected: unknown;
  options: string[] | null;
  isCorrect: number | null;
  pointsEarned: string | null;
  manuallyGraded: number;
}

export interface AttemptDetail {
  attempt: {
    id: number;
    testId: number;
    testTitle: string;
    studentId: number;
    studentName: string;
    matricule: string;
    status: 'in_progress' | 'submitted';
    score: string | null;
    maxScore: string | null;
    percentage: string | null;
    answeredCount: number;
    questionCount: number | null;
    level: string | null;
    results: { competencies: CompetencyResult[]; openPending: number } | null;
    submittedAt: string | null;
  };
  answers: AttemptAnswer[];
  missingQuestions: {
    questionId: number;
    statement: string;
    points: string;
    questionType?: DiagnosticQuestionType;
    optionsJson?: string | null;
  }[];
  progression: {
    id: number;
    testId: number;
    title: string;
    score: string | null;
    maxScore: string | null;
    percentage: string | null;
    level: string | null;
    submittedAt: string | null;
  }[];
}

export interface ClassResults {
  roster: {
    studentId: number;
    matricule: string;
    studentName: string;
    attemptId: number | null;
    status: string | null;
    score: string | null;
    maxScore: string | null;
    percentage: string | null;
    level: string | null;
  }[];
  competencies: {
    code: string;
    name: string;
    pct: number | null;
    masteredCount: number;
    attempts: number;
  }[];
  difficulties: {
    questionId: number;
    statement: string;
    competencyCode: string | null;
    answeredCount: number;
    correctCount: number;
    successRatio: string | number;
  }[];
}

function listParams(f: DiagnosticListFilters): string {
  const p = new URLSearchParams();
  if (f.schoolYearId) p.set('schoolYearId', f.schoolYearId);
  if (f.classId) p.set('classId', f.classId);
  if (f.subjectId) p.set('subjectId', f.subjectId);
  if (f.status) p.set('status', f.status);
  return p.toString();
}

export async function loadDiagnosticTests(filters: DiagnosticListFilters) {
  const res = await api.get<{ data: DiagnosticTestRow[] }>(`/diagnostics?${listParams(filters)}`);
  return res.data;
}

export async function loadDiagnosticTest(id: number) {
  const res = await api.get<{ data: DiagnosticTestDetail }>(`/diagnostics/${id}`);
  return res.data;
}

export async function loadAttemptDetail(id: number) {
  const res = await api.get<{ data: AttemptDetail }>(`/diagnostics/attempts/${id}`);
  return res.data;
}

export async function loadClassResults(testId: number) {
  const res = await api.get<{ data: ClassResults }>(`/diagnostics/${testId}/class-results`);
  return res.data;
}

export async function loadStudentProgress(studentId: number, subjectId?: number) {
  const suffix = subjectId ? `?subjectId=${subjectId}` : '';
  const res = await api.get<{ data: AttemptDetail['progression'] }>(
    `/diagnostics/students/${studentId}/progress${suffix}`
  );
  return res.data;
}

/** Années + classes accessibles pour les formulaires diagnostics (professeur : ses affectations). */
export async function loadFormOptions(schoolYearId?: number) {
  const qs = schoolYearId ? `?schoolYearId=${schoolYearId}` : '';
  const res = await api.get<{ data: { years: SchoolYear[]; classes: ClassRow[] } }>(`/diagnostics/form-options${qs}`);
  return res.data;
}

export async function loadSubjects(classId: number) {
  const res = await api.get<{ data: ClassSubject[] }>(`/subjects/class-assignments?classId=${classId}`);
  return res.data.filter((cs) => cs.isActive);
}

/** Date scolaire du jour (AAAA-MM-JJ) dans le fuseau Indian/Antananarivo. */
export function todayAppTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' });
}
