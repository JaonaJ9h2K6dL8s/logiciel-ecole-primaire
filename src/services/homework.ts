import { api } from './api';

/** Types et helpers partagés du module devoirs (étape 10). */

export const HOMEWORK_TYPES = [
  'homework',
  'classwork',
  'exam_revision',
  'group_work',
  'reading',
  'corrected_exercise',
  'practice_sheet',
  'optional',
] as const;
export type HomeworkType = (typeof HOMEWORK_TYPES)[number];

export const HOMEWORK_TYPE_LABELS: Record<HomeworkType, string> = {
  homework: 'Devoir à la maison',
  classwork: 'Exercice en classe',
  exam_revision: 'Révision examen',
  group_work: 'Travail de groupe',
  reading: 'Lecture',
  corrected_exercise: 'Exercice corrigé',
  practice_sheet: "Fiche d'entraînement",
  optional: 'Devoir facultatif',
};

export const HOMEWORK_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

export const HOMEWORK_STATUS_LABELS: Record<HomeworkStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  closed: 'Clôturé',
  archived: 'Archivé',
};

export const SUBMISSION_STATUSES = ['todo', 'started', 'submitted', 'late', 'graded', 'not_submitted'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  todo: 'À faire',
  started: 'Commencé',
  submitted: 'Remis',
  late: 'En retard',
  graded: 'Corrigé',
  not_submitted: 'Non remis',
};

export const QUESTION_TYPES = [
  'free_text',
  'calculation',
  'short_answer',
  'mcq',
  'true_false',
  'fill_blank',
  'multi_part',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  free_text: 'Réponse libre',
  calculation: 'Calcul',
  short_answer: 'Question courte',
  mcq: 'QCM',
  true_false: 'Vrai ou faux',
  fill_blank: 'Texte à compléter',
  multi_part: 'Exercice à sous-questions',
};

export interface HomeworkRow {
  id: number;
  school_year_id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  title: string;
  description: string | null;
  homework_type: HomeworkType;
  publish_date: string | null;
  due_date: string | null;
  estimated_minutes: number | null;
  max_score: string | null;
  status: HomeworkStatus;
  corrections_published: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  className: string;
  levelName: string;
  subjectName: string;
  yearLabel: string;
  teacherName: string | null;
}

export interface HomeworkListResponse {
  data: { items: HomeworkRow[]; pagination: { page: number; limit: number; total: number; pages: number } };
}

export interface HomeworkDetail extends HomeworkRow {
  counts: { questions: number; assigned: number; submitted: number; graded: number };
  canManage: boolean;
}

export interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
}

export interface ClassRow {
  id: number;
  name: string;
  levelName: string;
  schoolYearId: number;
}

export interface ClassSubject {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  isActive: boolean;
}

export interface GradingPeriod {
  id: number;
  schoolYearId: number;
  name: string;
}

export interface StudentRow {
  id: number;
  matricule: string;
  last_name: string;
  first_names: string;
  currentClassName?: string | null;
}

/** Date scolaire du jour (AAAA-MM-JJ) calculée dans le fuseau Indian/Antananarivo. */
export function todayAppTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' });
}

/** Un devoir est-il en retard d'affichage (date limite dépassée, non clôturé) ? */
export function isOverdue(hw: Pick<HomeworkRow, 'due_date' | 'status'>): boolean {
  return hw.status === 'published' && hw.due_date !== null && hw.due_date < todayAppTz();
}

/**
 * Années + classes accessibles pour les formulaires devoirs.
 * Professeur : uniquement ses affectations (endpoint dédié, côté serveur).
 * Remplace /school-years et /academics/classes, réservés à la gestion admin.
 */
export async function loadFormOptions(schoolYearId?: number) {
  const qs = schoolYearId ? `?schoolYearId=${schoolYearId}` : '';
  const res = await api.get<{ data: { years: SchoolYear[]; classes: ClassRow[] } }>(`/homework/form-options${qs}`);
  return res.data;
}

export async function loadSubjects(classId: number) {
  const res = await api.get<{ data: ClassSubject[] }>(`/subjects/class-assignments?classId=${classId}`);
  return res.data.filter((cs) => cs.isActive);
}

export async function loadPeriods(schoolYearId: number) {
  const res = await api.get<{ data: GradingPeriod[] }>(`/grading-periods?schoolYearId=${schoolYearId}`);
  return res.data;
}
