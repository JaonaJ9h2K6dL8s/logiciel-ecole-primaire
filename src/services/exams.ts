import { api } from './api';

/** Types et helpers du module Examens (étape 12) — couche de vue sur `assessments`. */

export const EXAM_TYPE_LABELS: Record<string, string> = {
  homework: 'Devoir',
  quiz: 'Interrogation',
  exam: 'Examen',
  other: 'Autre',
  composition: 'Composition',
  ds: 'Devoir surveillé',
};

export const EXAM_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumise',
  locked: 'Verrouillée',
};

export interface ExamDashboardData {
  total: number;
  upcoming: number;
  past: number;
  awaitingGrades: number;
  byType: { type: string; count: number }[];
  upcomingItems: ExamUpcomingItem[];
  referenceDate?: string;
}

export interface ExamUpcomingItem {
  id: number;
  title: string;
  assessmentType: string;
  assessmentDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  className: string;
  subjectName: string;
  teacherName: string;
  status: string;
  gradesEntered: number;
}

export interface ExamCalendarItem {
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

export interface ExamCalendarConflict {
  date: string;
  aId: number;
  bId: number;
  kind: 'overlap' | 'same_day';
  message: string;
}

export interface ExamFilters {
  schoolYearId?: string;
  gradingPeriodId?: string;
  classId?: string;
  subjectId?: string;
  assessmentType?: string;
  fromDate?: string;
  toDate?: string;
}

function filterParams(f: ExamFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.schoolYearId) p.set('schoolYearId', f.schoolYearId);
  if (f.gradingPeriodId) p.set('gradingPeriodId', f.gradingPeriodId);
  if (f.classId) p.set('classId', f.classId);
  if (f.subjectId) p.set('subjectId', f.subjectId);
  if (f.assessmentType) p.set('assessmentType', f.assessmentType);
  if (f.fromDate) p.set('fromDate', f.fromDate);
  if (f.toDate) p.set('toDate', f.toDate);
  return p;
}

export async function loadExamDashboard(filters: ExamFilters) {
  const res = await api.get<{ data: ExamDashboardData; referenceDate: string }>(
    `/exams/dashboard?${filterParams(filters).toString()}`
  );
  return res.data;
}

export async function loadExamCalendar(classId: number, month: string) {
  const res = await api.get<{
    data: ExamCalendarItem[];
    conflicts: ExamCalendarConflict[];
    range: { fromDate: string; toDate: string };
  }>(`/exams/calendar?classId=${classId}&month=${month}`);
  return res;
}

/** Mois précédent / suivant au format AAAA-MM. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Libellé du mois (AAAA-MM) en français. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
