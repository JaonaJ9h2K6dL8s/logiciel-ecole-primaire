import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../database/pool';
import { notFound } from '../../shared/errors';

export interface TariffRow extends RowDataPacket {
  id: number;
  school_year_id: number;
  level_id: number | null;
  class_id: number | null;
  fee_category: string;
  name: string;
  amount: number;
  frequency: string;
  applies_from: string | null;
  applies_to: string | null;
  is_active: number;
  description: string | null;
  created_by: number;
  yearLabel: string;
  levelName: string | null;
  className: string | null;
}

export interface StudentFeeRow extends RowDataPacket {
  id: number;
  student_id: number;
  school_year_id: number;
  class_id: number | null;
  tariff_id: number | null;
  fee_category: string;
  name: string;
  amount: number;
  due_date: string | null;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  paid_amount: number;
  batch_id: string | null;
  notes: string | null;
  created_at: string;
  matricule?: string;
  lastName?: string;
  firstName?: string;
  className?: string | null;
  yearLabel?: string;
}

export const TARIFF_SELECT = `SELECT t.id, t.school_year_id, t.level_id, t.class_id, t.fee_category,
    t.name, t.amount, t.frequency,
    DATE_FORMAT(t.applies_from, '%Y-%m-%d') AS applies_from,
    DATE_FORMAT(t.applies_to, '%Y-%m-%d') AS applies_to,
    t.is_active, t.description, t.created_by, t.created_at,
    y.label AS yearLabel, l.name AS levelName, c.name AS className
  FROM fee_tariffs t
  JOIN school_years y ON y.id = t.school_year_id
  LEFT JOIN levels l ON l.id = t.level_id
  LEFT JOIN classes c ON c.id = t.class_id`;

export const STUDENT_FEE_SELECT = `SELECT sf.id, sf.student_id, sf.school_year_id, sf.class_id, sf.tariff_id,
    sf.fee_category, sf.name, sf.amount,
    DATE_FORMAT(sf.due_date, '%Y-%m-%d') AS due_date,
    sf.status, sf.paid_amount, sf.batch_id, sf.notes, sf.created_at,
    s.matricule, s.last_name AS lastName, s.first_names AS firstName,
    c.name AS className, y.label AS yearLabel
  FROM student_fees sf
  JOIN students s ON s.id = sf.student_id
  LEFT JOIN classes c ON c.id = sf.class_id
  JOIN school_years y ON y.id = sf.school_year_id`;

export async function loadTariff(id: number): Promise<TariffRow> {
  const [rows] = await getPool().query<TariffRow[]>(
    `${TARIFF_SELECT} WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) throw notFound('Tarif introuvable.');
  return rows[0];
}

export async function loadStudentFee(id: number): Promise<StudentFeeRow> {
  const [rows] = await getPool().query<StudentFeeRow[]>(
    `${STUDENT_FEE_SELECT} WHERE sf.id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) throw notFound('Frais introuvable.');
  return rows[0];
}

/** Élèves cibles d'un tarif : inscriptions actives de l'année, filtrées par classe ou niveau. */
export function tariffTargetSql(tariff: { school_year_id: number; level_id: number | null; class_id: number | null }): {
  sql: string;
  params: unknown[];
} {
  const conds: string[] = ['e.school_year_id = ?', "e.status = 'active'"];
  const params: unknown[] = [tariff.school_year_id];
  if (tariff.class_id != null) {
    conds.push('e.class_id = ?');
    params.push(tariff.class_id);
  } else if (tariff.level_id != null) {
    conds.push('e.class_id IN (SELECT id FROM classes WHERE level_id = ?)');
    params.push(tariff.level_id);
  }
  return {
    sql: `SELECT e.student_id, e.class_id FROM enrollments e WHERE ${conds.join(' AND ')}`,
    params,
  };
}
