import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../database/pool';
import { todayInAppTz } from '../../shared/time';
import type { SessionUser } from '../../shared/session';

export interface YearRef {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: number;
}

export interface PeriodRef {
  id: number;
  name: string;
  displayOrder: number;
  startDate: string;
  endDate: string;
}

const YEAR_COLS =
  'id, label, DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate, is_active AS isActive';

export async function listYears(): Promise<YearRef[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${YEAR_COLS} FROM school_years ORDER BY start_date DESC, id DESC`
  );
  return rows as unknown as YearRef[];
}

export async function resolveYear(yearId?: number): Promise<YearRef | null> {
  if (yearId) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${YEAR_COLS} FROM school_years WHERE id = ? LIMIT 1`,
      [yearId]
    );
    return (rows as unknown as YearRef[])[0] ?? null;
  }
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT ${YEAR_COLS} FROM school_years WHERE is_active = 1 LIMIT 1`
  );
  return (rows as unknown as YearRef[])[0] ?? null;
}

/**
 * Période sélectionnée : explicite si fournie (et appartenant à l'année),
 * sinon la dernière période commencée à la date du jour, sinon la première
 * période de l'année. NULL si l'année n'a aucune période configurée.
 */
export async function resolvePeriod(yearId: number, periodId?: number): Promise<PeriodRef | null> {
  const cols =
    'id, name, display_order AS displayOrder, DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate';
  if (periodId) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${cols} FROM grading_periods WHERE id = ? AND school_year_id = ? LIMIT 1`,
      [periodId, yearId]
    );
    return (rows as unknown as PeriodRef[])[0] ?? null;
  }
  const [started] = await getPool().query<RowDataPacket[]>(
    `SELECT ${cols} FROM grading_periods
     WHERE school_year_id = ? AND start_date <= ?
     ORDER BY start_date DESC, display_order DESC LIMIT 1`,
    [yearId, todayInAppTz()]
  );
  const startedRow = (started as unknown as PeriodRef[])[0];
  if (startedRow) return startedRow;
  const [first] = await getPool().query<RowDataPacket[]>(
    `SELECT ${cols} FROM grading_periods
     WHERE school_year_id = ? ORDER BY start_date ASC, display_order ASC LIMIT 1`,
    [yearId]
  );
  return (first as unknown as PeriodRef[])[0] ?? null;
}

export async function listPeriods(yearId: number): Promise<PeriodRef[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, name, display_order AS displayOrder, DATE_FORMAT(start_date, "%Y-%m-%d") AS startDate, DATE_FORMAT(end_date, "%Y-%m-%d") AS endDate
     FROM grading_periods WHERE school_year_id = ?
     ORDER BY display_order, start_date`,
    [yearId]
  );
  return rows as unknown as PeriodRef[];
}

/**
 * Plage d'assiduité : les bornes explicites sont respectées telles quelles ;
 * sinon 30 derniers jours (ou depuis le début d'année), bornés par l'année.
 */
export function defaultRange(year: YearRef, from?: string, to?: string): { from: string; to: string } {
  const today = todayInAppTz();
  const defaultEnd = today < year.endDate ? today : year.endDate;
  const end = to ?? defaultEnd;
  const defaultStart = addDays(end, -29);
  const start = from ?? (defaultStart > year.startDate ? defaultStart : year.startDate);
  return { from: start, to: end };
}

/** Ajoute n jours à une date AAAA-MM-JJ (arithmétique UTC, sans fuseau navigateur). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Taux en pourcentage (2 décimales), NULL si dénominateur nul — jamais 0 inventé. */
export function rate(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 10000) / 100;
}

/**
 * Cloisonnement professeur (règle métier identique à assertClassAccess des
 * bulletins) : IDs des classes affectées au professeur pour l'année
 * sélectionnée, affectations en cours uniquement (assigned_to IS NULL).
 * NULL pour l'administrateur = aucun filtre. Un professeur sans affectation
 * reçoit [-1] : aucune donnée ne lui est divulguée.
 */
export async function scopedClassIds(yearId: number, user: SessionUser): Promise<number[] | null> {
  if (user.role_code === 'admin') return null;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT DISTINCT class_id FROM teacher_class_assignments
     WHERE teacher_id = ? AND school_year_id = ? AND assigned_to IS NULL`,
    [user.id, yearId]
  );
  const ids = (rows as unknown as { class_id: number }[]).map((r) => Number(r.class_id));
  return ids.length > 0 ? ids : [-1];
}

/**
 * Fragment SQL de filtrage par classes. Les IDs proviennent de la base
 * (entiers), jamais d'une entrée utilisateur : interpolation sûre.
 */
export function scopeSql(classIds: number[] | null, expr: string): string {
  if (classIds === null) return '';
  return ` AND ${expr} IN (${classIds.join(',')})`;
}

/**
 * Jointure inscription active sur un bloc dont la table principale est
 * aliasée `mainAlias`, pour restreindre pointages/suivis aux classes du
 * professeur. Aucune jointure pour l'administrateur (comportement inchangé).
 */
export function activeEnrollmentJoin(
  classIds: number[] | null,
  joinAlias: string,
  mainAlias: string
): string {
  if (classIds === null) return '';
  return (
    ` JOIN enrollments ${joinAlias} ON ${joinAlias}.student_id = ${mainAlias}.student_id` +
    ` AND ${joinAlias}.school_year_id = ${mainAlias}.school_year_id AND ${joinAlias}.status = 'active'` +
    ` AND ${joinAlias}.class_id IN (${classIds.join(',')})`
  );
}
