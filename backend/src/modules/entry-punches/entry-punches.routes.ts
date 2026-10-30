import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, notFound, conflict } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { serverNow, toAppDateString } from '../../shared/time';
import {
  createPunchSchema,
  punchListQuerySchema,
  correctionSchema,
} from './entry-punches.schemas';

export const entryPunchesRouter = Router();

entryPunchesRouter.use(requireAuth);

interface PunchRow {
  id: number;
  student_id: number;
  school_year_id: number;
  event_type: 'ARRIVAL' | 'EXIT';
  occurred_at: Date;
  recorded_at: Date;
  punched_by: number;
  device_label: string | null;
  idempotency_key: string;
  correlation_id: string | null;
  school_date: string;
  status: 'valid' | 'corrected';
  corrects_punch_id: number | null;
}

function serializePunch(row: PunchRow) {
  return {
    id: row.id,
    studentId: row.student_id,
    schoolYearId: row.school_year_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    punchedBy: row.punched_by,
    deviceLabel: row.device_label,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    schoolDate: toAppDateString(row.school_date),
    status: row.status,
    correctsPunchId: row.corrects_punch_id,
  };
}

function isDupEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// ---------- Options de classes pour les filtres de pointage ----------
entryPunchesRouter.get(
  '/class-options',
  requirePermission('entry_punches.view'),
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT c.id, c.name, l.name AS levelName, l.order_index AS orderIndex
       FROM classes c
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = c.school_year_id
       WHERE c.is_active = 1 AND sy.is_active = 1
       ORDER BY l.order_index, c.name`
    );
    res.json({ data: rows });
  })
);

// ---------- Recherche d'élèves pointables (agent d'accueil) ----------
// Limitée aux élèves actifs avec une inscription active dans l'année scolaire active.
const punchStudentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  classId: z.coerce.number().int().positive().optional(),
  levelId: z.coerce.number().int().positive().optional(),
});

entryPunchesRouter.get(
  '/punchable-students',
  requirePermission('entry_punches.view'),
  asyncHandler(async (req, res) => {
    const parsed = punchStudentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    const [yearRows] = await getPool().query(
      'SELECT id, label FROM school_years WHERE is_active = 1 LIMIT 1'
    );
    const year = (yearRows as { id: number; label: string }[])[0];
    if (!year) throw conflict('Aucune année scolaire active.');

    const where: string[] = [
      `e.school_year_id = ${Number(year.id)}`,
      `e.status = 'active'`,
      `s.status = 'active'`,
    ];
    const params: unknown[] = [];
    if (q.search) {
      where.push('(s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ?)');
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    if (q.classId) {
      where.push('e.class_id = ?');
      params.push(q.classId);
    }
    if (q.levelId) {
      where.push('c.level_id = ?');
      params.push(q.levelId);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN classes c ON c.id = e.class_id
       WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const offset = (q.page - 1) * q.pageSize;
    const [rows] = await getPool().query(
      `SELECT s.id, s.matricule, s.last_name, s.first_names, s.status,
              c.id AS classId, c.name AS className, l.name AS levelName
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN classes c ON c.id = e.class_id
       JOIN levels l ON l.id = c.level_id
       WHERE ${whereSql}
       ORDER BY s.last_name, s.first_names, s.matricule
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset]
    );

    res.json({
      data: rows,
      schoolYear: { id: year.id, label: year.label },
      pagination: { page: q.page, pageSize: q.pageSize, total },
    });
  })
);

// ---------- Liste / historique des pointages ----------
entryPunchesRouter.get(
  '/',
  requirePermission('entry_punches.view'),
  asyncHandler(async (req, res) => {
    const parsed = punchListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (q.date) {
      where.push('p.school_date = ?');
      params.push(q.date);
    }
    if (q.dateFrom) {
      where.push('p.school_date >= ?');
      params.push(q.dateFrom);
    }
    if (q.dateTo) {
      where.push('p.school_date <= ?');
      params.push(q.dateTo);
    }
    if (q.studentId) {
      where.push('p.student_id = ?');
      params.push(q.studentId);
    }
    if (q.classId) {
      // Classe de l'inscription active de l'élève (rattachement administratif actuel)
      where.push(`p.student_id IN (
        SELECT e.student_id FROM enrollments e
        WHERE e.class_id = ? AND e.status = 'active'
      )`);
      params.push(q.classId);
    }
    if (q.eventType) {
      where.push('p.event_type = ?');
      params.push(q.eventType);
    }
    if (q.status) {
      where.push('p.status = ?');
      params.push(q.status);
    }
    if (q.search) {
      where.push('(s.matricule LIKE ? OR s.last_name LIKE ? OR s.first_names LIKE ?)');
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total
       FROM entry_punches p JOIN students s ON s.id = p.student_id
       WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const offset = (q.page - 1) * q.pageSize;
    const [rows] = await getPool().query(
      `SELECT p.id, p.student_id AS studentId, p.event_type AS eventType,
              p.occurred_at AS occurredAt, p.recorded_at AS recordedAt,
              DATE_FORMAT(p.school_date, '%Y-%m-%d') AS schoolDate, p.status, p.device_label AS deviceLabel,
              p.corrects_punch_id AS correctsPunchId,
              s.matricule, s.last_name, s.first_names,
              c.name AS className,
              u.full_name AS punchedByName
       FROM entry_punches p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
       JOIN users u ON u.id = p.punched_by
       WHERE ${whereSql}
       ORDER BY p.occurred_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

// ---------- Détail d'un pointage + corrections ----------
entryPunchesRouter.get(
  '/:id',
  requirePermission('entry_punches.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const [rows] = await getPool().query(
      `SELECT p.*, u.full_name AS punchedByName
       FROM entry_punches p JOIN users u ON u.id = p.punched_by
       WHERE p.id = ?`,
      [id]
    );
    const row = (rows as (PunchRow & { punchedByName: string })[])[0];
    if (!row) throw notFound('Pointage introuvable.');

    const [corrRows] = await getPool().query(
      `SELECT c.id, c.reason, c.old_values AS oldValues, c.new_values AS newValues,
              c.created_at AS createdAt, u.full_name AS correctedByName
       FROM entry_punch_corrections c JOIN users u ON u.id = c.corrected_by
       WHERE c.punch_id = ? OR c.replacement_punch_id = ?
       ORDER BY c.created_at`,
      [id, id]
    );

    res.json({ data: { ...serializePunch(row), punchedByName: row.punchedByName, corrections: corrRows } });
  })
);

// ---------- Création d'un pointage (arrivée / sortie) ----------
entryPunchesRouter.post(
  '/',
  requirePermission('entry_punches.manage'),
  asyncHandler(async (req, res) => {
    const parsed = createPunchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const result = await withTransaction(async (conn) => {
      // Sérialisation par élève : verrou sur la ligne student pour rendre la
      // vérification de transition fiable même en cas de requêtes concurrentes.
      const [studentRows] = await conn.query(
        `SELECT id, status FROM students WHERE id = ? FOR UPDATE`,
        [body.studentId]
      );
      const student = (studentRows as { id: number; status: string }[])[0];
      if (!student) throw notFound('Élève introuvable.');
      if (student.status !== 'active') {
        throw conflict('Cet élève n’est pas actif (dossier parti ou archivé).');
      }

      // Idempotence : une clé déjà traitée renvoie l'événement d'origine.
      const [existingRows] = await conn.query(
        `SELECT * FROM entry_punches WHERE idempotency_key = ? LIMIT 1`,
        [body.idempotencyKey]
      );
      const existing = (existingRows as PunchRow[])[0];
      if (existing) {
        return { alreadyProcessed: true as const, punch: existing };
      }

      // Année scolaire active + inscription active obligatoires.
      const [yearRows] = await conn.query('SELECT id FROM school_years WHERE is_active = 1 LIMIT 1');
      const year = (yearRows as { id: number }[])[0];
      if (!year) throw conflict('Aucune année scolaire active : pointage refusé.');

      const [enrollRows] = await conn.query(
        `SELECT id FROM enrollments
         WHERE student_id = ? AND school_year_id = ? AND status = 'active' LIMIT 1`,
        [body.studentId, year.id]
      );
      if ((enrollRows as unknown[]).length === 0) {
        throw conflict('Aucune inscription active pour cet élève dans l’année scolaire en cours.');
      }

      // Transition : dernier événement valide de la journée scolaire.
      // L'heure et la date viennent exclusivement du serveur.
      const occurredAt = serverNow();
      const [lastRows] = await conn.query(
        `SELECT event_type FROM entry_punches
         WHERE student_id = ? AND school_date = DATE(?) AND status = 'valid'
         ORDER BY occurred_at DESC, id DESC
         LIMIT 1 FOR UPDATE`,
        [body.studentId, occurredAt]
      );
      const last = (lastRows as { event_type: 'ARRIVAL' | 'EXIT' }[])[0];
      if (body.eventType === 'ARRIVAL' && last?.event_type === 'ARRIVAL') {
        throw conflict('Arrivée déjà enregistrée pour cet élève aujourd’hui, sans sortie intermédiaire.');
      }
      if (body.eventType === 'EXIT') {
        if (!last) {
          throw conflict('Sortie refusée : aucune arrivée enregistrée aujourd’hui pour cet élève.');
        }
        if (last.event_type === 'EXIT') {
          throw conflict('Sortie déjà enregistrée pour cet élève aujourd’hui.');
        }
      }

      const correlationId = body.correlationId ?? crypto.randomUUID();
      try {
        const [ins] = await conn.query(
          `INSERT INTO entry_punches
             (student_id, school_year_id, event_type, occurred_at, recorded_at,
              punched_by, device_label, idempotency_key, correlation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            body.studentId,
            year.id,
            body.eventType,
            occurredAt,
            occurredAt,
            req.user!.id,
            body.deviceLabel ?? null,
            body.idempotencyKey,
            correlationId,
          ]
        );
        const insertId = (ins as { insertId: number }).insertId;
        const [createdRows] = await conn.query('SELECT * FROM entry_punches WHERE id = ?', [insertId]);
        return { alreadyProcessed: false as const, punch: (createdRows as PunchRow[])[0] };
      } catch (err) {
        if (isDupEntry(err)) {
          // Course sur la clé d'idempotence : renvoyer l'original.
          const [dupRows] = await conn.query(
            'SELECT * FROM entry_punches WHERE idempotency_key = ? LIMIT 1',
            [body.idempotencyKey]
          );
          return { alreadyProcessed: true as const, punch: (dupRows as PunchRow[])[0] };
        }
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'entry_punches.create',
      entityType: 'entry_punch',
      entityId: result.punch.id,
      details: { eventType: result.punch.event_type, alreadyProcessed: result.alreadyProcessed },
      ip: req.ip ?? null,
    });

    res.status(result.alreadyProcessed ? 200 : 201).json({
      data: serializePunch(result.punch),
      alreadyProcessed: result.alreadyProcessed,
      message: result.alreadyProcessed
        ? 'Événement déjà traité (clé d’idempotence identique).'
        : result.punch.event_type === 'ARRIVAL'
          ? 'Arrivée enregistrée.'
          : 'Sortie enregistrée.',
    });
  })
);

// ---------- Correction administrative d'un pointage ----------
entryPunchesRouter.post(
  '/:id/corrections',
  requirePermission('entry_punches.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = correctionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    let newOccurredAt: Date | null = null;
    if (body.occurredAt) {
      newOccurredAt = new Date(body.occurredAt);
      if (Number.isNaN(newOccurredAt.getTime())) throw badRequest('Heure corrigée invalide.');
      if (newOccurredAt.getTime() > Date.now()) {
        throw badRequest('L’heure corrigée ne peut pas être dans le futur.');
      }
    }

    const replacementId = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM entry_punches WHERE id = ? FOR UPDATE', [id]);
      const original = (rows as PunchRow[])[0];
      if (!original) throw notFound('Pointage introuvable.');
      if (original.status !== 'valid') {
        throw conflict('Ce pointage a déjà été corrigé. Corrigez la ligne de remplacement.');
      }

      const newEventType = body.eventType ?? original.event_type;
      const occurredAt = newOccurredAt ?? original.occurred_at;
      const recordedAt = serverNow();

      // L'original n'est jamais modifié ni supprimé : il passe à 'corrected'
      // et une nouvelle ligne validée est créée, reliée à l'original.
      await conn.query(`UPDATE entry_punches SET status = 'corrected' WHERE id = ?`, [id]);

      const [ins] = await conn.query(
        `INSERT INTO entry_punches
           (student_id, school_year_id, event_type, occurred_at, recorded_at,
            punched_by, device_label, idempotency_key, correlation_id, corrects_punch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          original.student_id,
          original.school_year_id,
          newEventType,
          occurredAt,
          recordedAt,
          req.user!.id,
          original.device_label,
          `corr-${id}`,
          original.correlation_id,
          id,
        ]
      );
      const newId = (ins as { insertId: number }).insertId;

      await conn.query(
        `INSERT INTO entry_punch_corrections
           (punch_id, replacement_punch_id, corrected_by, reason, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          newId,
          req.user!.id,
          body.reason,
          JSON.stringify({ eventType: original.event_type, occurredAt: original.occurred_at }),
          JSON.stringify({ eventType: newEventType, occurredAt }),
        ]
      );
      return newId;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'entry_punches.correct',
      entityType: 'entry_punch',
      entityId: `${id}:${replacementId}`,
      details: { reason: body.reason },
      ip: req.ip ?? null,
    });

    const [createdRows] = await getPool().query('SELECT * FROM entry_punches WHERE id = ?', [replacementId]);
    res.status(201).json({
      data: serializePunch((createdRows as PunchRow[])[0]),
      message: 'Pointage corrigé. Les valeurs d’origine sont conservées.',
    });
  })
);
