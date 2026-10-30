import { Router } from 'express';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { todayInAppTz, minutesInAppTz } from '../../shared/time';
import {
  createSessionSchema,
  sessionListQuerySchema,
  putRecordsSchema,
  reconciliationQuerySchema,
} from './attendance.schemas';
import {
  assertClassAccess,
  accessibleClassFilter,
  rosterForSession,
  loadSessionForUser,
  validateRecordInputs,
} from './attendance.helpers';

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

function isDupEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// ---------- Classes accessibles pour l'appel ----------
attendanceRouter.get(
  '/my-classes',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const access = await accessibleClassFilter(getPool(), req.user!, 'c.id');
    const [rows] = await getPool().query(
      `SELECT c.id, c.name, c.school_year_id AS schoolYearId,
              l.name AS levelName, sy.label AS schoolYearLabel
       FROM classes c
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = c.school_year_id
       WHERE c.is_active = 1 AND sy.is_active = 1 AND ${access.sql}
       ORDER BY l.order_index, c.name`,
      access.params
    );
    res.json({ data: rows });
  })
);

// ---------- Liste des séances ----------
attendanceRouter.get(
  '/sessions',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const parsed = sessionListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const access = await accessibleClassFilter(getPool(), req.user!, 's.class_id');

    const where: string[] = [access.sql];
    const params: unknown[] = [...access.params];
    if (q.date) {
      where.push('s.session_date = ?');
      params.push(q.date);
    }
    if (q.dateFrom) {
      where.push('s.session_date >= ?');
      params.push(q.dateFrom);
    }
    if (q.dateTo) {
      where.push('s.session_date <= ?');
      params.push(q.dateTo);
    }
    if (q.classId) {
      where.push('s.class_id = ?');
      params.push(q.classId);
    }
    if (q.status) {
      where.push('s.status = ?');
      params.push(q.status);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM attendance_sessions s WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const offset = (q.page - 1) * q.pageSize;
    const [rows] = await getPool().query(
      `SELECT s.id, s.class_id AS classId, c.name AS className, l.name AS levelName,
              s.school_year_id AS schoolYearId, sy.label AS schoolYearLabel,
              s.session_date AS sessionDate, s.slot, s.status,
              u.full_name AS teacherName,
              (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS recordCount,
              (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'PRESENT') AS presentCount,
              (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'ABSENT') AS absentCount,
              (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'LATE') AS lateCount,
              (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'EXCUSED') AS excusedCount
       FROM attendance_sessions s
       JOIN classes c ON c.id = s.class_id
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = s.school_year_id
       LEFT JOIN users u ON u.id = s.teacher_id
       WHERE ${whereSql}
       ORDER BY s.session_date DESC, s.slot DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

// ---------- Détail d'une séance (avec feuille d'appel) ----------
attendanceRouter.get(
  '/sessions/:id',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const result = await withTransaction(async (conn) => {
      const session = await loadSessionForUser(conn, req.user!, id);
      const roster = await rosterForSession(conn, session.class_id, session.school_year_id, session.session_date);
      const [recordRows] = await conn.query(
        `SELECT student_id AS studentId, status, comment, created_by AS createdBy,
                updated_by AS updatedBy, created_at AS createdAt, updated_at AS updatedAt
         FROM attendance_records WHERE session_id = ?`,
        [id]
      );
      return { session, roster, records: recordRows };
    });

    res.json({ data: result });
  })
);

// ---------- Création d'une séance ----------
attendanceRouter.post(
  '/sessions',
  requirePermission('attendance.manage'),
  asyncHandler(async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const sessionId = await withTransaction(async (conn) => {
      const [classRows] = await conn.query(
        `SELECT c.id, c.school_year_id AS schoolYearId, c.is_active, c.name,
                DATE_FORMAT(sy.start_date, '%Y-%m-%d') AS startDate,
                DATE_FORMAT(sy.end_date, '%Y-%m-%d') AS endDate
         FROM classes c JOIN school_years sy ON sy.id = c.school_year_id
         WHERE c.id = ? LIMIT 1`,
        [body.classId]
      );
      const cls = (classRows as { id: number; schoolYearId: number; is_active: number; name: string; startDate: string; endDate: string }[])[0];
      if (!cls) throw notFound('Classe introuvable.');
      if (!cls.is_active) throw conflict('Cette classe est inactive.');

      if (body.sessionDate < String(cls.startDate).slice(0, 10) || body.sessionDate > String(cls.endDate).slice(0, 10)) {
        throw badRequest('La date de séance doit être comprise dans l’année scolaire de la classe.');
      }

      await assertClassAccess(conn, req.user!, body.classId);

      try {
        const [ins] = await conn.query(
          `INSERT INTO attendance_sessions (class_id, school_year_id, session_date, slot, teacher_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [body.classId, cls.schoolYearId, body.sessionDate, body.slot, req.user!.id, req.user!.id]
        );
        return (ins as { insertId: number }).insertId;
      } catch (err) {
        if (isDupEntry(err)) {
          throw conflict('Un appel existe déjà pour cette classe, cette date et cette séance.');
        }
        throw err;
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'attendance.sessions.create',
      entityType: 'attendance_session',
      entityId: sessionId,
      details: { classId: body.classId, sessionDate: body.sessionDate, slot: body.slot },
      ip: req.ip ?? null,
    });

    res.status(201).json({ data: { id: sessionId }, message: 'Séance d’appel créée.' });
  })
);

// ---------- Saisie / mise à jour des statuts (upsert, pas de ligne en double) ----------
attendanceRouter.put(
  '/sessions/:id/records',
  requirePermission('attendance.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = putRecordsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;
    validateRecordInputs(body.records);

    await withTransaction(async (conn) => {
      const session = await loadSessionForUser(conn, req.user!, id);
      if (session.status === 'submitted' && !req.user!.permissions.includes('attendance.correct')) {
        throw conflict('Appel déjà validé. La correction requiert la permission attendance.correct.');
      }

      // Les élèves saisis doivent être inscrits dans la classe à la date de la séance.
      const roster = await rosterForSession(conn, session.class_id, session.school_year_id, session.session_date);
      const rosterIds = new Set(roster.map((s) => s.id));
      const invalid = body.records.filter((r) => !rosterIds.has(r.studentId)).map((r) => r.studentId);
      if (invalid.length > 0) {
        throw badRequest('Élève(s) non inscrit(s) dans cette classe à la date de la séance.', { studentIds: invalid });
      }

      for (const r of body.records) {
        await conn.query(
          `INSERT INTO attendance_records (session_id, student_id, status, comment, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), comment = VALUES(comment), updated_by = VALUES(updated_by)`,
          [id, r.studentId, r.status, r.comment?.trim() || null, req.user!.id, req.user!.id]
        );
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'attendance.records.update',
      entityType: 'attendance_session',
      entityId: id,
      details: { count: body.records.length },
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Feuille d’appel enregistrée.' });
  })
);

// ---------- Validation finale de l'appel ----------
attendanceRouter.post(
  '/sessions/:id/submit',
  requirePermission('attendance.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const session = await loadSessionForUser(conn, req.user!, id);
      if (session.status === 'submitted') throw conflict('Cet appel est déjà validé.');
      const [recordRows] = await conn.query(
        'SELECT COUNT(*) AS n FROM attendance_records WHERE session_id = ?',
        [id]
      );
      if ((recordRows as { n: number }[])[0].n === 0) {
        throw badRequest('Impossible de valider un appel sans aucun statut saisi.');
      }
      await conn.query(`UPDATE attendance_sessions SET status = 'submitted', updated_by = ? WHERE id = ?`, [
        req.user!.id,
        id,
      ]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'attendance.sessions.submit',
      entityType: 'attendance_session',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Appel validé.' });
  })
);

// ---------- Réouverture d'un appel validé (permission corrective dédiée) ----------
attendanceRouter.post(
  '/sessions/:id/reopen',
  requirePermission('attendance.correct'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    await withTransaction(async (conn) => {
      const session = await loadSessionForUser(conn, req.user!, id);
      if (session.status === 'draft') throw conflict('Cet appel n’est pas validé.');
      await conn.query(`UPDATE attendance_sessions SET status = 'draft', updated_by = ? WHERE id = ?`, [
        req.user!.id,
        id,
      ]);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'attendance.sessions.reopen',
      entityType: 'attendance_session',
      entityId: id,
      ip: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Appel rouvert pour correction.' });
  })
);

// ---------- Rapprochement pointage / appel (lecture seule) ----------
attendanceRouter.get(
  '/reconciliation',
  requirePermission('attendance.reconcile'),
  asyncHandler(async (req, res) => {
    const parsed = reconciliationQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;

    // Horaires de référence des séances (facultatifs) : sans eux, les
    // comparaisons horaires sont signalées comme impossibles, jamais devinées.
    const [settingsRows] = await getPool().query(
      'SELECT slot_start_times AS slotStartTimes FROM school_settings WHERE id = 1'
    );
    const rawSlotTimes = (settingsRows as { slotStartTimes: string | null }[])[0]?.slotStartTimes;
    let slotTimes: Record<string, string> = {};
    let slotTimesConfigured = false;
    if (rawSlotTimes) {
      try {
        slotTimes = typeof rawSlotTimes === 'string' ? JSON.parse(rawSlotTimes) : rawSlotTimes;
        slotTimesConfigured = Object.keys(slotTimes).length > 0;
      } catch {
        slotTimes = {};
      }
    }

    // Séances validées du jour (brouillons exclus : données potentiellement incomplètes)
    const sessionWhere: string[] = ['s.session_date = ?', `s.status = 'submitted'`];
    const sessionParams: unknown[] = [q.date];
    if (q.classId) {
      sessionWhere.push('s.class_id = ?');
      sessionParams.push(q.classId);
    }
    const [sessionRows] = await getPool().query(
      `SELECT s.id, s.class_id AS classId, c.name AS className, s.slot
       FROM attendance_sessions s JOIN classes c ON c.id = s.class_id
       WHERE ${sessionWhere.join(' AND ')}`,
      sessionParams
    );
    const sessions = sessionRows as { id: number; classId: number; className: string; slot: number }[];
    if (sessions.length === 0) {
      return res.json({
        data: [],
        pagination: { page: q.page, pageSize: q.pageSize, total: 0 },
        meta: { slotTimesConfigured, sessionsCompared: 0 },
      });
    }

    // Statuts d'appel du jour
    const sessionIds = sessions.map((s) => s.id);
    const [recordRows] = await getPool().query(
      `SELECT r.session_id AS sessionId, r.student_id AS studentId, r.status,
              s.last_name, s.first_names, s.matricule
       FROM attendance_records r JOIN students s ON s.id = r.student_id
       WHERE r.session_id IN (?)`,
      [sessionIds]
    );
    const records = recordRows as {
      sessionId: number;
      studentId: number;
      status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      last_name: string;
      first_names: string;
      matricule: string;
    }[];

    // Pointages valides du jour
    const punchWhere: string[] = ['p.school_date = ?', `p.status = 'valid'`];
    const punchParams: unknown[] = [q.date];
    if (q.studentId) {
      punchWhere.push('p.student_id = ?');
      punchParams.push(q.studentId);
    }
    const [punchRows] = await getPool().query(
      `SELECT p.student_id AS studentId, p.event_type AS eventType, p.occurred_at AS occurredAt
       FROM entry_punches p WHERE ${punchWhere.join(' AND ')}
       ORDER BY p.occurred_at`,
      punchParams
    );
    const punches = punchRows as { studentId: number; eventType: 'ARRIVAL' | 'EXIT'; occurredAt: string }[];

    // Instants en minutes locales (heure malgache), quel que soit le type renvoyé
    // par le driver (Date JS ou chaîne "YYYY-MM-DD HH:MM:SS").
    const toMinutes = (v: Date | string): number => minutesInAppTz(v);
    const slotStartMinutes = (slot: number): number | null => {
      const t = slotTimes[String(slot)];
      if (!t) return null;
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };

    const studentFilter = (studentId: number) => !q.studentId || studentId === q.studentId;

    type Alert = {
      type: string;
      certainty: 'elevee' | 'moyenne' | 'faible';
      reason: string;
      studentId: number;
      studentName: string;
      matricule: string;
      classId: number | null;
      className: string | null;
      sessionId: number | null;
      slot: number | null;
      details: Record<string, unknown>;
    };
    const alerts: Alert[] = [];
    const seen = new Set<string>();

    for (const rec of records) {
      if (!studentFilter(rec.studentId)) continue;
      const session = sessions.find((s) => s.id === rec.sessionId)!;
      const key = (type: string) => `${type}:${rec.studentId}:${session.id}`;
      const arrivals = punches.filter((p) => p.studentId === rec.studentId && p.eventType === 'ARRIVAL');
      const exits = punches.filter((p) => p.studentId === rec.studentId && p.eventType === 'EXIT');
      const isAbsentLike = rec.status === 'ABSENT' || rec.status === 'EXCUSED';
      const student = { studentId: rec.studentId, studentName: `${rec.last_name} ${rec.first_names}`, matricule: rec.matricule };

      if (isAbsentLike && arrivals.length > 0 && !seen.has(key('ARRIVAL_BUT_ABSENT'))) {
        seen.add(key('ARRIVAL_BUT_ABSENT'));
        alerts.push({
          type: 'ARRIVAL_BUT_ABSENT',
          certainty: 'elevee',
          reason:
            rec.status === 'ABSENT'
              ? 'Arrivée enregistrée à l’entrée mais élève déclaré absent en classe : données contradictoires à vérifier.'
              : 'Arrivée enregistrée à l’entrée mais absence justifiée déclarée en classe : à vérifier.',
          classId: session.classId,
          className: session.className,
          sessionId: session.id,
          slot: session.slot,
          details: { recordStatus: rec.status, arrivalCount: arrivals.length, lastArrival: arrivals[arrivals.length - 1]?.occurredAt },
          ...student,
        });
      }

      if (rec.status === 'PRESENT' || rec.status === 'LATE') {
        if (arrivals.length === 0 && !seen.has(key('PRESENT_WITHOUT_ARRIVAL'))) {
          seen.add(key('PRESENT_WITHOUT_ARRIVAL'));
          alerts.push({
            type: 'PRESENT_WITHOUT_ARRIVAL',
            certainty: 'faible',
            reason:
              'Élève déclaré présent en classe sans pointage d’arrivée correspondant. L’absence de pointage n’est pas une preuve : à vérifier.',
            classId: session.classId,
            className: session.className,
            sessionId: session.id,
            slot: session.slot,
            details: { recordStatus: rec.status },
            ...student,
          });
        }
        const startMin = slotStartMinutes(session.slot);
        if (startMin !== null && rec.status === 'PRESENT' && arrivals.length > 0) {
          const lastArrival = arrivals[arrivals.length - 1];
          const arrMin = toMinutes(String(lastArrival.occurredAt));
          if (!Number.isNaN(arrMin) && arrMin > startMin && !seen.has(key('LATE_ARRIVAL_PRESENT'))) {
            seen.add(key('LATE_ARRIVAL_PRESENT'));
            alerts.push({
              type: 'LATE_ARRIVAL_PRESENT',
              certainty: 'moyenne',
              reason: `Arrivée enregistrée après l’heure de référence de la séance ${session.slot}, mais déclaré présent (et non en retard).`,
              classId: session.classId,
              className: session.className,
              sessionId: session.id,
              slot: session.slot,
              details: { arrivalAt: lastArrival.occurredAt, slotStart: slotTimes[String(session.slot)] },
              ...student,
            });
          }
        }
        const startMin2 = slotStartMinutes(session.slot);
        if (startMin2 !== null) {
          const lateExit = exits.find((p) => {
            const m = toMinutes(String(p.occurredAt));
            return !Number.isNaN(m) && m >= startMin2;
          });
          if (lateExit && !seen.has(key('EXIT_DURING_SESSION'))) {
            seen.add(key('EXIT_DURING_SESSION'));
            alerts.push({
              type: 'EXIT_DURING_SESSION',
              certainty: 'moyenne',
              reason: `Sortie enregistrée pendant la plage de la séance ${session.slot} alors que l’élève est déclaré présent. Heure de fin de séance inconnue : à vérifier.`,
              classId: session.classId,
              className: session.className,
              sessionId: session.id,
              slot: session.slot,
              details: { exitAt: lateExit.occurredAt, recordStatus: rec.status },
              ...student,
            });
          }
        }
      }

      if (rec.status === 'ABSENT' && arrivals.length === 0 && exits.length === 0 && !seen.has(key('ABSENT_NO_ARRIVAL'))) {
        seen.add(key('ABSENT_NO_ARRIVAL'));
        alerts.push({
          type: 'ABSENT_NO_ARRIVAL',
          certainty: 'faible',
          reason:
            'Élève absent en classe sans aucun pointage. Aucune conclusion possible sur sa présence dans l’établissement : à vérifier.',
          classId: session.classId,
          className: session.className,
          sessionId: session.id,
          slot: session.slot,
          details: { recordStatus: rec.status },
          ...student,
        });
      }
    }

    const filtered = q.type ? alerts.filter((a) => a.type === q.type) : alerts;
    const order: Record<string, number> = { elevee: 0, moyenne: 1, faible: 2 };
    filtered.sort((a, b) => (order[a.certainty] - order[b.certainty]) || a.className!.localeCompare(b.className!) || a.studentName.localeCompare(b.studentName));

    const total = filtered.length;
    const offset = (q.page - 1) * q.pageSize;
    res.json({
      data: filtered.slice(offset, offset + q.pageSize),
      pagination: { page: q.page, pageSize: q.pageSize, total },
      meta: {
        slotTimesConfigured,
        sessionsCompared: sessions.length,
        note: slotTimesConfigured
          ? undefined
          : 'Horaires de référence des séances non configurés : les comparaisons horaires (retard, sortie pendant la séance) ne sont pas évaluées.',
      },
    });
  })
);
