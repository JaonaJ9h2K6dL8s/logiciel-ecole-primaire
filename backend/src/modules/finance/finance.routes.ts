import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { todayInAppTz } from '../../shared/time';
import { writeAudit } from '../../shared/audit';
import { amountInWordsMGA } from './finance.money';
import {
  cancelRequestSchema,
  paymentCreateSchema,
  reasonSchema,
  rejectCancellationSchema,
  studentFeeCreateSchema,
  tariffCreateSchema,
  tariffUpdateSchema,
  type PaymentMethod,
} from './finance.schemas';
import {
  loadStudentFee,
  loadTariff,
  STUDENT_FEE_SELECT,
  tariffTargetSql,
  TARIFF_SELECT,
  type StudentFeeRow,
  type TariffRow,
} from './finance.helpers';

export const financeRouter = Router();

financeRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

function yearParam(req: { query: Record<string, unknown> }): Promise<number> {
  const q = z.coerce.number().int().positive();
  const parsed = q.safeParse(req.query.year);
  if (parsed.success) return Promise.resolve(parsed.data);
  return getPool()
    .query<RowDataPacket[]>("SELECT id FROM school_years WHERE is_active = 1 ORDER BY id DESC LIMIT 1")
    .then(([rows]) => {
      if ((rows as unknown[]).length === 0) throw badRequest('Aucune année scolaire active.');
      return Number((rows as RowDataPacket[])[0].id);
    });
}

function paginate(req: { query: Record<string, unknown> }): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function optInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  const v = Number(value);
  return Number.isInteger(v) && v > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Options de formulaire pour les utilisateurs non-admin (années + classes)
// ---------------------------------------------------------------------------

financeRouter.get(
  '/form-options',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const [years] = await getPool().query<RowDataPacket[]>(
      'SELECT id, label, is_active AS isActive FROM school_years ORDER BY start_date DESC'
    );
    const yearId = req.query.schoolYearId ? Number(req.query.schoolYearId) : null;
    const params: unknown[] = [];
    let classSql = `SELECT c.id, c.name, c.school_year_id AS schoolYearId, l.name AS levelName
       FROM classes c JOIN levels l ON l.id = c.level_id`;
    if (yearId && Number.isInteger(yearId) && yearId > 0) {
      classSql += ' WHERE c.school_year_id = ?';
      params.push(yearId);
    }
    classSql += ' ORDER BY l.order_index, c.name';
    const [classes] = await getPool().query<RowDataPacket[]>(classSql, params);
    res.json({
      data: {
        years: years as RowDataPacket[],
        classes: classes as RowDataPacket[],
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Recherche d'élèves pour les formulaires financiers (finance.view) :
// évite d'exposer /students (students.manage) aux utilisateurs finance.
// ---------------------------------------------------------------------------
financeRouter.get(
  '/students/search',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const schoolYearId = Number(req.query.schoolYearId);
    if (!Number.isInteger(schoolYearId) || schoolYearId <= 0) {
      throw badRequest('Année scolaire requise.');
    }
    if (q.length < 2) {
      res.json({ data: [] });
      return;
    }
    const like = `%${q}%`;
    const [rows] = await getPool().query(
      `SELECT s.id, s.matricule, s.last_name AS lastName, s.first_names AS firstNames,
              c.name AS currentClassName
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN classes c ON c.id = e.class_id
       WHERE e.school_year_id = ? AND e.status IN ('active', 'transferred')
         AND (s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ?)
       ORDER BY s.last_name, s.first_names
       LIMIT 15`,
      [schoolYearId, like, like, like]
    );
    res.json({ data: rows });
  })
);

// ---------------------------------------------------------------------------
// Tarifs (finance.fees.manage pour les écritures, finance.view pour la lecture)
// ---------------------------------------------------------------------------

financeRouter.get(
  '/tariffs',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const year = await yearParam(req);
    const conds = ['t.school_year_id = ?'];
    const params: unknown[] = [year];
    const active = req.query.active;
    if (active === 'true' || active === '1') conds.push('t.is_active = 1');
    if (active === 'false' || active === '0') conds.push('t.is_active = 0');
    const category = optInt(req.query.category); // non numérique : filtre catégorie texte
    void category;
    if (typeof req.query.category === 'string' && req.query.category !== 'all') {
      conds.push('t.fee_category = ?');
      params.push(req.query.category);
    }
    const classId = optInt(req.query.class);
    if (classId) {
      conds.push('(t.class_id = ? OR t.level_id IN (SELECT level_id FROM classes WHERE id = ?))');
      params.push(classId, classId);
    }
    const [rows] = await getPool().query<TariffRow[]>(
      `${TARIFF_SELECT} WHERE ${conds.join(' AND ')} ORDER BY t.fee_category, t.name`,
      params
    );
    res.json({ data: rows });
  })
);

financeRouter.post(
  '/tariffs',
  requirePermission('finance.fees.manage'),
  asyncHandler(async (req, res) => {
    const q = tariffCreateSchema.parse(req.body);
    try {
      const [result] = await getPool().query(
        `INSERT INTO fee_tariffs
           (school_year_id, level_id, class_id, fee_category, name, amount, frequency,
            applies_from, applies_to, is_active, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q.school_year_id,
          q.level_id ?? null,
          q.class_id ?? null,
          q.fee_category,
          q.name,
          q.amount,
          q.frequency,
          q.applies_from ?? null,
          q.applies_to ?? null,
          q.is_active ? 1 : 0,
          q.description ?? null,
          req.user!.id,
        ]
      );
      const id = (result as { insertId: number }).insertId;
      await writeAudit({
        actorId: req.user!.id, actorUsername: req.user!.username,
        action: 'finance.tariff.create', entityType: 'fee_tariff', entityId: id,
        details: { name: q.name, amount: q.amount },
      });
      res.status(201).json({ data: { id } });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw conflict('Un tarif identique existe déjà pour ce nom, cette catégorie et ce périmètre.');
      }
      throw err;
    }
  })
);

financeRouter.patch(
  '/tariffs/:id(\\d+)',
  requirePermission('finance.fees.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const tariff = await loadTariff(id);
    const q = tariffUpdateSchema.parse(req.body);
    const merged = {
      level_id: q.level_id !== undefined ? q.level_id : tariff.level_id,
      class_id: q.class_id !== undefined ? q.class_id : tariff.class_id,
      fee_category: q.fee_category ?? tariff.fee_category,
      name: q.name ?? tariff.name,
      amount: q.amount ?? n(tariff.amount),
      frequency: q.frequency ?? tariff.frequency,
      applies_from: q.applies_from !== undefined ? q.applies_from : tariff.applies_from,
      applies_to: q.applies_to !== undefined ? q.applies_to : tariff.applies_to,
      is_active: q.is_active !== undefined ? (q.is_active ? 1 : 0) : tariff.is_active,
      description: q.description !== undefined ? q.description : tariff.description,
    };
    if ((merged.level_id != null && merged.class_id != null)) {
      throw badRequest('Un tarif concerne un niveau OU une classe, pas les deux.');
    }
    await getPool().query(
      `UPDATE fee_tariffs SET level_id = ?, class_id = ?, fee_category = ?, name = ?, amount = ?,
         frequency = ?, applies_from = ?, applies_to = ?, is_active = ?, description = ?
       WHERE id = ?`,
      [
        merged.level_id ?? null, merged.class_id ?? null, merged.fee_category, merged.name,
        merged.amount, merged.frequency, merged.applies_from || null, merged.applies_to || null,
        merged.is_active ? 1 : 0, merged.description ?? null, id,
      ]
    );
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.tariff.update', entityType: 'fee_tariff', entityId: id,
      details: { before: { amount: n(tariff.amount), name: tariff.name }, after: { amount: merged.amount, name: merged.name } },
    });
    res.json({ data: { id, note: 'Les frais déjà émis ne sont pas modifiés par ce changement de tarif.' } });
  })
);

/** Aperçu de génération en lot : nombre d'élèves concernés, doublons existants. */
financeRouter.post(
  '/tariffs/:id(\\d+)/preview',
  requirePermission('finance.charges.manage'),
  asyncHandler(async (req, res) => {
    const tariff = await loadTariff(Number(req.params.id));
    const { sql, params } = tariffTargetSql(tariff);
    const [targets] = await getPool().query<RowDataPacket[]>(sql, params);
    const studentIds = (targets as { student_id: number }[]).map((r) => r.student_id);
    let already = 0;
    if (studentIds.length > 0) {
      const [existing] = await getPool().query<RowDataPacket[]>(
        `SELECT student_id FROM student_fees
         WHERE tariff_id = ? AND status <> 'cancelled' AND student_id IN (${studentIds.map(() => '?').join(',')})`,
        [tariff.id, ...studentIds]
      );
      already = (existing as unknown[]).length;
    }
    res.json({
      data: {
        tariff: { id: tariff.id, name: tariff.name, amount: n(tariff.amount), yearLabel: tariff.yearLabel },
        totalStudents: studentIds.length,
        alreadyBilled: already,
        toCreate: studentIds.length - already,
      },
    });
  })
);

/** Génération en lot : aperçu → confirmation côté client → transaction unique. */
financeRouter.post(
  '/tariffs/:id(\\d+)/generate',
  requirePermission('finance.charges.manage'),
  asyncHandler(async (req, res) => {
    const tariff = await loadTariff(Number(req.params.id));
    const { sql, params } = tariffTargetSql(tariff);
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let created = 0;
    let skipped = 0;
    await withTransaction(async (tx) => {
      const [targets] = await tx.query<RowDataPacket[]>(sql, params);
      const students = targets as { student_id: number; class_id: number }[];
      if (students.length === 0) return;
      const ids = students.map((s) => s.student_id);
      const [existing] = await tx.query<RowDataPacket[]>(
        `SELECT student_id FROM student_fees
         WHERE tariff_id = ? AND status <> 'cancelled' AND student_id IN (${ids.map(() => '?').join(',')})`,
        [tariff.id, ...ids]
      );
      const already = new Set((existing as { student_id: number }[]).map((r) => r.student_id));
      for (const s of students) {
        if (already.has(s.student_id)) {
          skipped += 1;
          continue;
        }
        await tx.query(
          `INSERT INTO student_fees
             (student_id, school_year_id, class_id, tariff_id, fee_category, name, amount, due_date, batch_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.student_id, tariff.school_year_id, s.class_id, tariff.id, tariff.fee_category,
            tariff.name, n(tariff.amount), tariff.applies_from ?? null, batchId, req.user!.id,
          ]
        );
        created += 1;
      }
    });
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.tariff.generate', entityType: 'fee_tariff', entityId: tariff.id,
      details: { created, skipped, batchId },
    });
    res.json({ data: { created, skipped, batchId } });
  })
);

// ---------------------------------------------------------------------------
// Frais dus des élèves
// ---------------------------------------------------------------------------

financeRouter.get(
  '/student-fees',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const year = await yearParam(req);
    const { page, pageSize, offset } = paginate(req);
    const conds = ['sf.school_year_id = ?'];
    const params: unknown[] = [year];
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    if (status === 'pending' || status === 'partial' || status === 'paid' || status === 'cancelled') {
      conds.push('sf.status = ?');
      params.push(status);
    } else if (status === 'unpaid') {
      conds.push("sf.status IN ('pending','partial')");
    }
    if (typeof req.query.category === 'string' && req.query.category !== 'all') {
      conds.push('sf.fee_category = ?');
      params.push(req.query.category);
    }
    const classId = optInt(req.query.class);
    if (classId) {
      conds.push('sf.class_id = ?');
      params.push(classId);
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      conds.push('(s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ? OR sf.name LIKE ?)');
      const like = `%${req.query.q.trim()}%`;
      params.push(like, like, like, like);
    }
    const whereSql = conds.join(' AND ');
    const [countRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM student_fees sf JOIN students s ON s.id = sf.student_id WHERE ${whereSql}`,
      params
    );
    const total = n((countRows as { total: number }[])[0].total);
    const [rows] = await getPool().query<StudentFeeRow[]>(
      `${STUDENT_FEE_SELECT} WHERE ${whereSql}
       ORDER BY sf.created_at DESC, sf.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      data: rows,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  })
);

/** Frais individuel : l'élève doit avoir une inscription active pour l'année. */
financeRouter.post(
  '/student-fees',
  requirePermission('finance.charges.manage'),
  asyncHandler(async (req, res) => {
    const q = studentFeeCreateSchema.parse(req.body);
    const [enr] = await getPool().query<RowDataPacket[]>(
      `SELECT class_id FROM enrollments
       WHERE student_id = ? AND school_year_id = ? AND status = 'active' LIMIT 1`,
      [q.student_id, q.school_year_id]
    );
    if ((enr as unknown[]).length === 0) {
      throw badRequest("Cet élève n'a pas d'inscription active pour cette année scolaire.");
    }
    const classId = q.class_id ?? Number((enr as { class_id: number }[])[0].class_id);
    const [result] = await getPool().query(
      `INSERT INTO student_fees
         (student_id, school_year_id, class_id, fee_category, name, amount, due_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        q.student_id, q.school_year_id, classId, q.fee_category, q.name, q.amount,
        q.due_date ?? null, q.notes ?? null, req.user!.id,
      ]
    );
    const id = (result as { insertId: number }).insertId;
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.fee.create', entityType: 'student_fee', entityId: id,
      details: { studentId: q.student_id, amount: q.amount, name: q.name },
    });
    res.status(201).json({ data: { id } });
  })
);

/** Annulation d'un frais émis : uniquement si aucun paiement confirmé n'existe. */
financeRouter.post(
  '/student-fees/:id(\\d+)/cancel',
  requirePermission('finance.charges.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const q = reasonSchema.parse(req.body);
    const fee = await loadStudentFee(id);
    if (fee.status === 'cancelled') throw conflict('Ce frais est déjà annulé.');
    if (n(fee.paid_amount) > 0) {
      throw conflict(
        'Des paiements confirmés existent sur ce frais : annulez d’abord les paiements via la procédure d’annulation.'
      );
    }
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE student_fees SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ? WHERE id = ? AND paid_amount = 0`,
        [req.user!.id, id]
      );
    });
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.fee.cancel', entityType: 'student_fee', entityId: id,
      details: { reason: q.reason },
    });
    res.json({ data: { id, status: 'cancelled' } });
  })
);

/** Situation financière complète d'un élève (matricule, classe, soldes, historique). */
financeRouter.get(
  '/students/:studentId(\\d+)/statement',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const studentId = Number(req.params.studentId);
    const year = await yearParam(req);
    const [studentRows] = await getPool().query<RowDataPacket[]>(
      `SELECT s.id, s.matricule, s.last_name, s.first_names, c.name AS className, y.label AS yearLabel
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.school_year_id = ? AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
       CROSS JOIN school_years y ON y.id = ?
       WHERE s.id = ? LIMIT 1`,
      [year, year, studentId]
    );
    if ((studentRows as unknown[]).length === 0) throw notFound('Élève introuvable.');
    const student = (studentRows as RowDataPacket[])[0];
    const [fees] = await getPool().query<StudentFeeRow[]>(
      `${STUDENT_FEE_SELECT} WHERE sf.student_id = ? AND sf.school_year_id = ?
       ORDER BY sf.created_at, sf.id`,
      [studentId, year]
    );
    const [payments] = await getPool().query<RowDataPacket[]>(
      `SELECT p.id, p.amount, p.method, p.reference, p.payer_name, p.comment, p.status,
              p.recorded_at, u.full_name AS recordedByName,
              (SELECT receipt_number FROM finance_receipts r WHERE r.payment_id = p.id) AS receiptNumber,
              sf.name AS feeName
       FROM finance_payments p
       JOIN student_fees sf ON sf.id = p.student_fee_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.student_id = ? AND sf.school_year_id = ?
       ORDER BY p.recorded_at, p.id`,
      [studentId, year]
    );
    const activeFees = fees.filter((f) => f.status !== 'cancelled');
    const totalDue = activeFees.reduce((acc, f) => acc + n(f.amount), 0);
    const totalPaid = activeFees.reduce((acc, f) => acc + n(f.paid_amount), 0);
    res.json({
      data: {
        student,
        fees,
        payments,
        totals: { totalDue, totalPaid, balance: totalDue - totalPaid },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

financeRouter.post(
  '/payments',
  requirePermission('finance.payments.record'),
  asyncHandler(async (req, res) => {
    const q = paymentCreateSchema.parse(req.body);
    const recordedAt = new Date();

    const result = await withTransaction(async (tx) => {
      // Anti double-soumission : clé d'idempotence unique fournie par le client.
      if (q.idempotency_key) {
        const [dup] = await tx.query<RowDataPacket[]>(
          'SELECT id FROM finance_payments WHERE idempotency_key = ? LIMIT 1',
          [q.idempotency_key]
        );
        if ((dup as unknown[]).length > 0) {
          return { duplicate: true, paymentId: Number((dup as { id: number }[])[0].id) };
        }
      }
      // Verrou de la ligne de frais : garantit la cohérence du solde en concurrence.
      const [feeRows] = await tx.query<RowDataPacket[]>(
        `SELECT id, student_id, amount, paid_amount, status FROM student_fees WHERE id = ? FOR UPDATE`,
        [q.student_fee_id]
      );
      if ((feeRows as unknown[]).length === 0) throw notFound('Frais introuvable.');
      const fee = (feeRows as { id: number; student_id: number; amount: number; paid_amount: number; status: string }[])[0];
      if (fee.status === 'cancelled') throw conflict('Ce frais est annulé : aucun paiement possible.');
      const remaining = n(fee.amount) - n(fee.paid_amount);
      if (q.amount > remaining) {
        throw badRequest(
          `Montant supérieur au solde restant (${remaining.toLocaleString('fr-FR')} Ar). Aucun paiement excédentaire n'est accepté.`
        );
      }

      const [payResult] = await tx.query(
        `INSERT INTO finance_payments
           (student_fee_id, student_id, amount, method, reference, payer_name, comment, idempotency_key, recorded_by, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q.student_fee_id, fee.student_id, q.amount, q.method, q.reference ?? null,
          q.payer_name ?? null, q.comment ?? null, q.idempotency_key ?? null,
          req.user!.id, recordedAt,
        ]
      );
      const paymentId = (payResult as { insertId: number }).insertId;

      // Mise à jour du solde dans la même transaction (jamais de modification directe du solde).
      const newPaid = n(fee.paid_amount) + q.amount;
      await tx.query(
        `UPDATE student_fees SET paid_amount = ?, status = IF(? >= amount, 'paid', 'partial') WHERE id = ?`,
        [newPaid, newPaid, fee.id]
      );

      // Reçu : numéro unique généré côté serveur, séquence verrouillée par année.
      const year = recordedAt.getFullYear();
      await tx.query(
        'INSERT INTO finance_receipt_sequences (year, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1',
        [year]
      );
      const [seqRows] = await tx.query<RowDataPacket[]>(
        'SELECT last_number FROM finance_receipt_sequences WHERE year = ?',
        [year]
      );
      const seqNum = n((seqRows as { last_number: number }[])[0].last_number);
      const receiptNumber = `REC-${year}-${String(seqNum).padStart(6, '0')}`;

      const [snapRows] = await tx.query<RowDataPacket[]>(
        `SELECT s.matricule, CONCAT(s.last_name, ' ', s.first_names) AS studentName,
                c.name AS className, y.label AS yearLabel, sch.school_name, sf.name AS feeName
         FROM student_fees sf
         JOIN students s ON s.id = sf.student_id
         LEFT JOIN classes c ON c.id = sf.class_id
         JOIN school_years y ON y.id = sf.school_year_id
         CROSS JOIN school_settings sch ON sch.id = 1
         WHERE sf.id = ?`,
        [fee.id]
      );
      const info = (snapRows as {
        matricule: string; studentName: string; className: string | null;
        yearLabel: string; school_name: string; feeName: string;
      }[])[0];
      const balanceAfter = n(fee.amount) - newPaid;

      await tx.query(
        `INSERT INTO finance_receipts
           (payment_id, receipt_number, school_name, student_name, matricule, class_name, year_label,
            fee_name, payer_name, amount, amount_in_words, method, reference, balance_after, agent_name, issued_by, issued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId, receiptNumber, info.school_name, info.studentName, info.matricule,
          info.className, info.yearLabel, info.feeName, q.payer_name ?? null,
          q.amount, amountInWordsMGA(q.amount), q.method, q.reference ?? null,
          balanceAfter, req.user!.full_name, req.user!.id, recordedAt,
        ]
      );
      return { duplicate: false, paymentId, receiptNumber, balanceAfter };
    });

    if (result.duplicate) {
      // Re-soumission identique : renvoyer le paiement d'origine, pas d'erreur.
      res.json({ data: { paymentId: result.paymentId, duplicate: true } });
      return;
    }
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.payment.record', entityType: 'finance_payment', entityId: result.paymentId,
      details: { amount: q.amount, method: q.method, studentFeeId: q.student_fee_id, receipt: result.receiptNumber },
    });
    res.status(201).json({
      data: {
        paymentId: result.paymentId,
        receiptNumber: result.receiptNumber,
        balanceAfter: result.balanceAfter,
        duplicate: false,
      },
    });
  })
);

financeRouter.get(
  '/payments',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const year = await yearParam(req);
    const { page, pageSize, offset } = paginate(req);
    const conds = ['sf.school_year_id = ?'];
    const params: unknown[] = [year];
    if (typeof req.query.status === 'string' && (req.query.status === 'confirmed' || req.query.status === 'cancelled')) {
      conds.push('p.status = ?');
      params.push(req.query.status);
    }
    if (typeof req.query.method === 'string' && req.query.method !== 'all') {
      conds.push('p.method = ?');
      params.push(req.query.method);
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      conds.push('(s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ? OR p.reference LIKE ? OR p.payer_name LIKE ?)');
      const like = `%${req.query.q.trim()}%`;
      params.push(like, like, like, like, like);
    }
    if (typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      conds.push('p.recorded_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      conds.push('p.recorded_at <= ?');
      params.push(`${req.query.to} 23:59:59`);
    }
    const whereSql = conds.join(' AND ');
    const [countRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM finance_payments p
       JOIN students s ON s.id = p.student_id
       JOIN student_fees sf ON sf.id = p.student_fee_id WHERE ${whereSql}`,
      params
    );
    const total = n((countRows as { total: number }[])[0].total);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT p.id, p.student_fee_id, p.student_id, p.amount, p.method, p.reference, p.payer_name,
              p.comment, p.status, p.recorded_at, p.cancelled_at,
              s.matricule, s.last_name, s.first_names, sf.name AS feeName, c.name AS className,
              u.full_name AS recordedByName,
              (SELECT receipt_number FROM finance_receipts r WHERE r.payment_id = p.id) AS receiptNumber
       FROM finance_payments p
       JOIN students s ON s.id = p.student_id
       JOIN student_fees sf ON sf.id = p.student_fee_id
       LEFT JOIN classes c ON c.id = sf.class_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE ${whereSql}
       ORDER BY p.recorded_at DESC, p.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      data: rows,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  })
);

// ---------------------------------------------------------------------------
// Annulations de paiement (demande → approbation par un autre utilisateur)
// ---------------------------------------------------------------------------

financeRouter.post(
  '/payments/:id(\\d+)/cancel-request',
  requirePermission('finance.payments.cancel.request'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const q = cancelRequestSchema.parse(req.body);
    const [payRows] = await getPool().query<RowDataPacket[]>(
      'SELECT id, status FROM finance_payments WHERE id = ? LIMIT 1',
      [id]
    );
    if ((payRows as unknown[]).length === 0) throw notFound('Paiement introuvable.');
    if ((payRows as { status: string }[])[0].status !== 'confirmed') {
      throw conflict('Ce paiement est déjà annulé.');
    }
    const [pending] = await getPool().query<RowDataPacket[]>(
      "SELECT id FROM finance_payment_cancellations WHERE payment_id = ? AND status = 'pending' LIMIT 1",
      [id]
    );
    if ((pending as unknown[]).length > 0) {
      throw conflict('Une demande d’annulation est déjà en attente pour ce paiement.');
    }
    const [result] = await getPool().query(
      `INSERT INTO finance_payment_cancellations (payment_id, reason, requested_by, replacement_payment_id)
       VALUES (?, ?, ?, ?)`,
      [id, q.reason, req.user!.id, q.replacement_payment_id ?? null]
    );
    const requestId = (result as { insertId: number }).insertId;
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.payment.cancel.request', entityType: 'payment_cancellation', entityId: requestId,
      details: { paymentId: id, reason: q.reason },
    });
    res.status(201).json({ data: { requestId } });
  })
);

financeRouter.get(
  '/cancel-requests',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const conds: string[] = [];
    const params: unknown[] = [];
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      conds.push('c.status = ?');
      params.push(status);
    }
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT c.id, c.payment_id, c.reason, c.status, c.requested_at, c.approved_at, c.rejection_reason,
              c.replacement_payment_id,
              ru.full_name AS requestedByName, au.full_name AS approvedByName,
              p.amount, p.method, p.recorded_at,
              s.matricule, s.last_name, s.first_names
       FROM finance_payment_cancellations c
       JOIN finance_payments p ON p.id = c.payment_id
       JOIN students s ON s.id = p.student_id
       LEFT JOIN users ru ON ru.id = c.requested_by
       LEFT JOIN users au ON au.id = c.approved_by
       ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
       ORDER BY c.requested_at DESC, c.id DESC
       LIMIT 200`,
      params
    );
    res.json({ data: rows });
  })
);

financeRouter.post(
  '/cancel-requests/:id(\\d+)/approve',
  requirePermission('finance.payments.cancel.approve'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const requesterId = await withTransaction(async (tx) => {
      // Séparation des tâches : interdiction d'auto-approbation.
      const [reqRows] = await tx.query<RowDataPacket[]>(
        'SELECT id, payment_id, requested_by, status FROM finance_payment_cancellations WHERE id = ? FOR UPDATE',
        [id]
      );
      if ((reqRows as unknown[]).length === 0) throw notFound("Demande d'annulation introuvable.");
      const cxl = (reqRows as { payment_id: number; requested_by: number; status: string }[])[0];
      if (cxl.status !== 'pending') throw conflict('Cette demande a déjà été traitée.');
      if (cxl.requested_by === req.user!.id) {
        throw forbidden('Auto-approbation interdite : l’annulation doit être autorisée par un autre utilisateur.');
      }
      const [payRows] = await tx.query<RowDataPacket[]>(
        'SELECT id, student_fee_id, amount, status FROM finance_payments WHERE id = ? FOR UPDATE',
        [cxl.payment_id]
      );
      const pay = (payRows as { student_fee_id: number; amount: number; status: string }[])[0];
      if (pay.status !== 'confirmed') throw conflict('Ce paiement est déjà annulé.');

      // Contre-écriture : solde recalculé dans la même transaction.
      const [feeRows] = await tx.query<RowDataPacket[]>(
        'SELECT id, amount, paid_amount, status FROM student_fees WHERE id = ? FOR UPDATE',
        [pay.student_fee_id]
      );
      const fee = (feeRows as { id: number; amount: number; paid_amount: number }[])[0];
      const newPaid = Math.max(0, n(fee.paid_amount) - n(pay.amount));
      const newStatus = newPaid === 0 ? 'pending' : newPaid < n(fee.amount) ? 'partial' : 'paid';
      await tx.query('UPDATE student_fees SET paid_amount = ?, status = ? WHERE id = ?', [newPaid, newStatus, fee.id]);
      await tx.query(
        "UPDATE finance_payments SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ? WHERE id = ?",
        [req.user!.id, cxl.payment_id]
      );
      await tx.query(
        "UPDATE finance_payment_cancellations SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?",
        [req.user!.id, id]
      );
      return cxl.requested_by;
    });
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.payment.cancel.approve', entityType: 'payment_cancellation', entityId: id,
      details: { requestedBy: requesterId },
    });
    res.json({ data: { id, status: 'approved' } });
  })
);

financeRouter.post(
  '/cancel-requests/:id(\\d+)/reject',
  requirePermission('finance.payments.cancel.approve'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const q = rejectCancellationSchema.parse(req.body);
    await withTransaction(async (tx) => {
      const [reqRows] = await tx.query<RowDataPacket[]>(
        'SELECT id, requested_by, status FROM finance_payment_cancellations WHERE id = ? FOR UPDATE',
        [id]
      );
      if ((reqRows as unknown[]).length === 0) throw notFound("Demande d'annulation introuvable.");
      const cxl = (reqRows as { requested_by: number; status: string }[])[0];
      if (cxl.status !== 'pending') throw conflict('Cette demande a déjà été traitée.');
      if (cxl.requested_by === req.user!.id) {
        throw forbidden('Auto-traitement interdit : la demande doit être traitée par un autre utilisateur.');
      }
      await tx.query(
        "UPDATE finance_payment_cancellations SET status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_reason = ? WHERE id = ?",
        [req.user!.id, q.reason, id]
      );
    });
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.payment.cancel.reject', entityType: 'payment_cancellation', entityId: id,
      details: { reason: q.reason },
    });
    res.json({ data: { id, status: 'rejected' } });
  })
);

// ---------------------------------------------------------------------------
// Reçus
// ---------------------------------------------------------------------------

financeRouter.get(
  '/receipts',
  requirePermission('finance.receipts.view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = paginate(req);
    const conds: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      conds.push('(r.receipt_number LIKE ? OR r.student_name LIKE ? OR r.matricule LIKE ?)');
      const like = `%${req.query.q.trim()}%`;
      params.push(like, like, like);
    }
    if (typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      conds.push('r.issued_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      conds.push('r.issued_at <= ?');
      params.push(`${req.query.to} 23:59:59`);
    }
    const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [countRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM finance_receipts r ${whereSql}`,
      params
    );
    const total = n((countRows as { total: number }[])[0].total);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT r.id, r.receipt_number, r.student_name, r.matricule, r.class_name, r.year_label,
              r.fee_name, r.amount, r.method, r.issued_at, r.reprint_count,
              p.status AS paymentStatus
       FROM finance_receipts r
       JOIN finance_payments p ON p.id = r.payment_id
       ${whereSql}
       ORDER BY r.issued_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      data: rows,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  })
);

financeRouter.get(
  '/receipts/:id(\\d+)',
  requirePermission('finance.receipts.view'),
  asyncHandler(async (req, res) => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT r.*, p.status AS paymentStatus, p.comment AS paymentComment
       FROM finance_receipts r
       JOIN finance_payments p ON p.id = r.payment_id
       WHERE r.id = ? LIMIT 1`,
      [Number(req.params.id)]
    );
    if ((rows as unknown[]).length === 0) throw notFound('Reçu introuvable.');
    res.json({ data: (rows as RowDataPacket[])[0] });
  })
);

/** Réimpression : tracée (compteur + audit), mention DUPLICATA affichée par l'interface.
 *  Permission finance.receipts.view conformément au libellé documenté en migration 027
 *  (« Consulter et réimprimer les reçus ») ; la réimpression est auditée. */
financeRouter.post(
  '/receipts/:id(\\d+)/reprint',
  requirePermission('finance.receipts.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await getPool().query(
      'UPDATE finance_receipts SET reprint_count = reprint_count + 1, last_reprint_at = NOW(), last_reprint_by = ? WHERE id = ?',
      [req.user!.id, id]
    );
    if ((result as { affectedRows: number }).affectedRows === 0) throw notFound('Reçu introuvable.');
    await writeAudit({
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'finance.receipt.reprint', entityType: 'finance_receipt', entityId: id,
    });
    res.json({ data: { id, duplicated: true } });
  })
);

// ---------------------------------------------------------------------------
// Impayés
// ---------------------------------------------------------------------------

financeRouter.get(
  '/arrears',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const year = await yearParam(req);
    const { page, pageSize, offset } = paginate(req);
    const overdueOnly = req.query.overdue === 'true' || req.query.overdue === '1';
    const partialOnly = req.query.partial === 'true' || req.query.partial === '1';
    const conds = [
      'sf.school_year_id = ?',
      "sf.status IN ('pending','partial')",
    ];
    const params: unknown[] = [year];
    if (overdueOnly) {
      conds.push('sf.due_date IS NOT NULL AND sf.due_date < ?');
      params.push(todayInAppTz());
    }
    if (partialOnly) {
      conds.push('sf.status = ? AND sf.paid_amount > 0');
      params.push('partial');
    }
    const classId = optInt(req.query.class);
    if (classId) {
      conds.push('sf.class_id = ?');
      params.push(classId);
    }
    if (typeof req.query.category === 'string' && req.query.category !== 'all') {
      conds.push('sf.fee_category = ?');
      params.push(req.query.category);
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      conds.push('(s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ?)');
      const like = `%${req.query.q.trim()}%`;
      params.push(like, like, like);
    }
    const whereSql = conds.join(' AND ');
    const today = todayInAppTz();
    const [countRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM student_fees sf JOIN students s ON s.id = sf.student_id WHERE ${whereSql}`,
      params
    );
    const total = n((countRows as { total: number }[])[0].total);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT sf.id, sf.student_id, s.matricule, s.last_name, s.first_names, sf.name AS feeName,
              sf.fee_category, sf.amount, sf.paid_amount, sf.status,
              DATE_FORMAT(sf.due_date, '%Y-%m-%d') AS due_date,
              (sf.amount - sf.paid_amount) AS balance,
              c.name AS className,
              (sf.due_date IS NOT NULL AND sf.due_date < ?) AS isOverdue,
              (SELECT g.phone_main FROM student_guardians sg
                 JOIN guardians g ON g.id = sg.guardian_id
                 WHERE sg.student_id = s.id
                 ORDER BY sg.is_primary_contact DESC, sg.guardian_id ASC LIMIT 1) AS guardianPhone
       FROM student_fees sf
       JOIN students s ON s.id = sf.student_id
       LEFT JOIN classes c ON c.id = sf.class_id
       WHERE ${whereSql}
       ORDER BY (sf.due_date IS NOT NULL AND sf.due_date < ?) DESC, sf.due_date ASC, s.last_name ASC LIMIT ? OFFSET ?`,
      [today, ...params, today, pageSize, offset]
    );
    res.json({
      data: rows,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  })
);

// ---------------------------------------------------------------------------
// Tableau de bord financier
// ---------------------------------------------------------------------------

financeRouter.get(
  '/dashboard',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const year = await yearParam(req);
    const today = todayInAppTz();
    const monthStart = `${today.slice(0, 7)}-01`;

    const [agg] = await getPool().query<RowDataPacket[]>(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM student_fees WHERE school_year_id = ? AND status <> 'cancelled') AS billed,
         (SELECT COALESCE(SUM(sf.amount - sf.paid_amount), 0) FROM student_fees sf
            WHERE sf.school_year_id = ? AND sf.status IN ('pending','partial')) AS outstanding,
         (SELECT COALESCE(SUM(p.amount), 0) FROM finance_payments p
            JOIN student_fees sf ON sf.id = p.student_fee_id
            WHERE sf.school_year_id = ? AND p.status = 'confirmed') AS collected,
         (SELECT COALESCE(SUM(p.amount), 0) FROM finance_payments p
            JOIN student_fees sf ON sf.id = p.student_fee_id
            WHERE sf.school_year_id = ? AND p.status = 'confirmed' AND p.recorded_at >= CURDATE()) AS todayCollected,
         (SELECT COALESCE(SUM(p.amount), 0) FROM finance_payments p
            JOIN student_fees sf ON sf.id = p.student_fee_id
            WHERE sf.school_year_id = ? AND p.status = 'confirmed' AND p.recorded_at >= ?) AS monthCollected,
         (SELECT COUNT(*) FROM student_fees sf
            WHERE sf.school_year_id = ? AND sf.status IN ('pending','partial')
              AND sf.due_date IS NOT NULL AND sf.due_date < CURDATE()) AS overdueCount`,
      [year, year, year, year, year, monthStart, year]
    );
    const [methods] = await getPool().query<RowDataPacket[]>(
      `SELECT p.method, SUM(p.amount) AS total, COUNT(*) AS count
       FROM finance_payments p JOIN student_fees sf ON sf.id = p.student_fee_id
       WHERE sf.school_year_id = ? AND p.status = 'confirmed'
       GROUP BY p.method ORDER BY total DESC`,
      [year]
    );
    const [byClass] = await getPool().query<RowDataPacket[]>(
      `SELECT COALESCE(c.name, 'Sans classe') AS className, SUM(sf.amount - sf.paid_amount) AS balance,
              COUNT(*) AS feeCount
       FROM student_fees sf LEFT JOIN classes c ON c.id = sf.class_id
       WHERE sf.school_year_id = ? AND sf.status IN ('pending','partial')
       GROUP BY sf.class_id ORDER BY balance DESC LIMIT 20`,
      [year]
    );
    const [evolution] = await getPool().query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(p.recorded_at, '%Y-%m') AS ym, SUM(p.amount) AS total
       FROM finance_payments p JOIN student_fees sf ON sf.id = p.student_fee_id
       WHERE sf.school_year_id = ? AND p.status = 'confirmed' AND p.recorded_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY ym ORDER BY ym`,
      [year]
    );
    const a = (agg as Record<string, number>[])[0];
    res.json({
      data: {
        year,
        billed: n(a.billed),
        collected: n(a.collected),
        outstanding: n(a.outstanding),
        todayCollected: n(a.todayCollected),
        monthCollected: n(a.monthCollected),
        overdueCount: n(a.overdueCount),
        methods: (methods as { method: PaymentMethod; total: string; count: number }[]).map((m) => ({
          method: m.method,
          total: n(m.total),
          count: m.count,
        })),
        arrearsByClass: (byClass as { className: string; balance: string; feeCount: number }[]).map((r) => ({
          className: r.className,
          balance: n(r.balance),
          feeCount: r.feeCount,
        })),
        evolution: (evolution as { ym: string; total: string }[]).map((r) => ({ ym: r.ym, total: n(r.total) })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Rapports financiers
// ---------------------------------------------------------------------------

financeRouter.get(
  '/reports',
  requirePermission('finance.reports.view'),
  asyncHandler(async (req, res) => {
    const year = await yearParam(req);
    const groupBy = typeof req.query.groupBy === 'string' ? req.query.groupBy : 'month';
    const conds = ["p.status = 'confirmed'", 'sf.school_year_id = ?'];
    const params: unknown[] = [year];
    if (typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      conds.push('p.recorded_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      conds.push('p.recorded_at <= ?');
      params.push(`${req.query.to} 23:59:59`);
    }
    let dim: string;
    if (groupBy === 'method') dim = 'p.method';
    else if (groupBy === 'class') dim = "COALESCE(c.name, 'Sans classe')";
    else if (groupBy === 'category') dim = 'sf.fee_category';
    else dim = "DATE_FORMAT(p.recorded_at, '%Y-%m')";
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${dim} AS label, SUM(p.amount) AS total, COUNT(*) AS count
       FROM finance_payments p
       JOIN student_fees sf ON sf.id = p.student_fee_id
       LEFT JOIN classes c ON c.id = sf.class_id
       WHERE ${conds.join(' AND ')}
       GROUP BY label ORDER BY total DESC`,
      params
    );
    res.json({
      data: {
        groupBy: groupBy === 'method' || groupBy === 'class' || groupBy === 'category' ? groupBy : 'month',
        rows: (rows as { label: string; total: string; count: number }[]).map((r) => ({
          label: r.label,
          total: n(r.total),
          count: r.count,
        })),
      },
    });
  })
);
