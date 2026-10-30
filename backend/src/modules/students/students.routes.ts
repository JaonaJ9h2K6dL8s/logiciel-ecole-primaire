import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../database/pool';
import { asyncHandler, badRequest, notFound, conflict } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { nextStudentMatricule } from '../../shared/matricule';
import {
  createStudentSchema,
  updateStudentSchema,
  guardianSchema,
  linkGuardianSchema,
  updateLinkSchema,
  enrollmentSchema,
} from './students.schemas';
import { assertClassEnrollable, createEnrollment, buildStudentsQuery } from './enrollments.service';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  schoolYearId: z.coerce.number().int().positive().optional(),
  levelId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'departed', 'archived']).optional(),
  sortBy: z.string().max(30).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const studentsRouter = Router();

studentsRouter.use(requireAuth, requirePermission('students.manage'));

// ---------- Liste des élèves ----------
studentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const { joins, whereSql, params, orderBy } = buildStudentsQuery({
      search: q.search,
      schoolYearId: q.schoolYearId ?? null,
      levelId: q.levelId ?? null,
      classId: q.classId ?? null,
      status: q.status ?? null,
      sortBy: q.sortBy ?? null,
      sortDir: q.sortDir ?? null,
    });

    const [countRows] = await getPool().query(
      `SELECT COUNT(DISTINCT s.id) AS total FROM students s ${joins} WHERE ${whereSql}`,
      params
    );
    const total = (countRows as { total: number }[])[0].total;

    const [rows] = await getPool().query(
      `SELECT s.id, s.matricule, s.last_name, s.first_names, s.birth_date, s.sex, s.status,
              s.created_at,
              ce.class_id AS currentClassId, c.name AS currentClassName, l.name AS currentLevelName,
              sy.id AS currentYearId, sy.label AS currentYearLabel,
              g.id AS primaryGuardianId, CONCAT(g.last_name, ' ', g.first_names) AS primaryGuardianName,
              g.phone_main AS primaryGuardianPhone
       FROM students s ${joins}
       WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );

    res.json({ data: rows, pagination: { page: q.page, pageSize: q.pageSize, total } });
  })
);

// ---------- Création d'un élève (élève + responsables + inscription en une transaction) ----------
studentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const { student, guardians, enrollment } = parsed.data;

    const created = await withTransaction(async (conn) => {
      const matricule = await nextStudentMatricule(conn);
      const [r] = await conn.query(
        `INSERT INTO students (matricule, last_name, first_names, birth_date, sex, address, entry_date, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          matricule,
          student.lastName,
          student.firstNames,
          student.birthDate ?? null,
          student.sex ?? null,
          student.address ?? null,
          student.entryDate ?? null,
          student.status ?? 'active',
          req.user!.id,
          req.user!.id,
        ]
      );
      const studentId = (r as { insertId: number }).insertId;

      // Responsables : soit liés par id, soit créés à la volée
      const guardianIds: number[] = [];
      for (const g of guardians ?? []) {
        let guardianId = g.guardianId;
        if (guardianId) {
          const [exists] = await conn.query('SELECT id FROM guardians WHERE id = ?', [guardianId]);
          if ((exists as unknown[]).length === 0) throw badRequest(`Responsable #${guardianId} inconnu.`);
        } else if (g.fields) {
          if (!g.fields.lastName || !g.fields.firstNames || !g.fields.phoneMain) {
            throw badRequest('Nom, prénom et téléphone principal sont obligatoires pour un nouveau responsable.');
          }
          const [gr] = await conn.query(
            `INSERT INTO guardians (last_name, first_names, relationship, phone_main, phone_secondary, email, address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              g.fields.lastName,
              g.fields.firstNames,
              g.fields.relationship ?? 'other',
              g.fields.phoneMain,
              g.fields.phoneSecondary ?? null,
              g.fields.email ?? null,
              g.fields.address ?? null,
            ]
          );
          guardianId = (gr as { insertId: number }).insertId;
        } else {
          throw badRequest('Responsable incomplet : fournissez un responsable existant ou ses coordonnées.');
        }

        const isPrimary = g.link?.isPrimaryContact ?? guardianIds.length === 0;
        await conn.query(
          `INSERT INTO student_guardians (student_id, guardian_id, relationship_label, is_primary_contact, is_legal_guardian, contact_allowed, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            studentId,
            guardianId,
            g.link?.relationshipLabel ?? null,
            isPrimary ? 1 : 0,
            g.link?.isLegalGuardian ?? false ? 1 : 0,
            g.link?.contactAllowed ?? true ? 1 : 0,
            g.link?.notes ?? null,
          ]
        );
        guardianIds.push(guardianId);
      }

      let enrollResult: number | null = null;
      if (enrollment) {
        await assertClassEnrollable(conn, enrollment.classId);
        const result = await createEnrollment(conn, {
          actorId: req.user!.id,
          actorUsername: req.user!.username,
          studentId,
          classId: enrollment.classId,
          enrollmentDate: enrollment.enrollmentDate,
          ip: req.ip,
        });
        enrollResult = result.enrollmentId;
      }

      return { studentId, matricule, guardianIds, enrollmentId: enrollResult };
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'students.create',
      entityType: 'student',
      entityId: created.studentId,
      details: { matricule: created.matricule, lastName: student.lastName, firstNames: student.firstNames },
      ip: req.ip ?? null,
    });

    res.status(201).json(created);
  })
);

// ---------- Fiche détaillée ----------
studentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const [rows] = await getPool().query(
      `SELECT s.id, s.matricule, s.last_name, s.first_names, s.birth_date, s.sex, s.address,
              s.entry_date, s.status, s.created_at, s.updated_at,
              cu.username AS createdByName, uu.username AS updatedByName
       FROM students s
       LEFT JOIN users cu ON cu.id = s.created_by
       LEFT JOIN users uu ON uu.id = s.updated_by
       WHERE s.id = ?`,
      [id]
    );
    const student = (rows as Record<string, unknown>[])[0];
    if (!student) throw notFound('Élève introuvable.');

    const [enrollments] = await getPool().query(
      `SELECT e.id, e.enrollment_date AS enrollmentDate, e.status, e.exit_date AS exitDate, e.exit_reason AS exitReason,
              c.name AS className, l.name AS levelName, sy.label AS schoolYearLabel,
              sy.id AS schoolYearId, e.created_at AS createdAt
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = e.school_year_id
       WHERE e.student_id = ?
       ORDER BY e.enrollment_date DESC, e.id DESC`,
      [id]
    );

    const [guardianRows] = await getPool().query(
      `SELECT sg.guardian_id AS guardianId, sg.relationship_label AS relationshipLabel,
              sg.is_primary_contact AS isPrimaryContact, sg.is_legal_guardian AS isLegalGuardian,
              sg.contact_allowed AS contactAllowed, sg.notes,
              g.last_name AS lastName, g.first_names AS firstNames, g.relationship, g.phone_main AS phoneMain,
              g.phone_secondary AS phoneSecondary, g.email, g.address, g.status
       FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.student_id = ?
       ORDER BY sg.is_primary_contact DESC, g.last_name`,
      [id]
    );

    res.json({
      data: {
        student,
        currentEnrollment: (enrollments as Record<string, unknown>[]).find((e) => e.status === 'active') ?? null,
        enrollments,
        guardians: guardianRows,
      },
    });
  })
);

// ---------- Modification ----------
studentsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = updateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const v = parsed.data;

    const [rows] = await getPool().query('SELECT id FROM students WHERE id = ?', [id]);
    if ((rows as unknown[]).length === 0) throw notFound('Élève introuvable.');

    // Construction dynamique : champ absent = inchangé ; null explicite = effacé
    const sets: string[] = ['updated_by = ?'];
    const params: unknown[] = [req.user!.id];
    if (v.lastName !== undefined) {
      sets.push('last_name = ?');
      params.push(v.lastName);
    }
    if (v.firstNames !== undefined) {
      sets.push('first_names = ?');
      params.push(v.firstNames);
    }
    if (v.birthDate !== undefined) {
      sets.push('birth_date = ?');
      params.push(v.birthDate);
    }
    if (v.sex !== undefined) {
      sets.push('sex = ?');
      params.push(v.sex);
    }
    if (v.address !== undefined) {
      sets.push('address = ?');
      params.push(v.address);
    }
    if (v.entryDate !== undefined) {
      sets.push('entry_date = ?');
      params.push(v.entryDate);
    }
    if (v.status !== undefined) {
      sets.push('status = ?');
      params.push(v.status);
    }
    params.push(id);

    await withTransaction(async (conn) => {
      await conn.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, params);
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'students.update',
      entityType: 'student',
      entityId: id,
      details: {
        fields: Object.keys(v),
        statusChange: v.status ?? undefined,
        // Pas de coordonnées complètes dans le journal
      },
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);

// ---------- Inscriptions ----------
studentsRouter.get(
  '/:id/enrollments',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const [rows] = await getPool().query(
      `SELECT e.id, e.enrollment_date AS enrollmentDate, e.status, e.exit_date AS exitDate, e.exit_reason AS exitReason,
              c.name AS className, l.name AS levelName, sy.label AS schoolYearLabel, e.created_at AS createdAt
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = e.school_year_id
       WHERE e.student_id = ?
       ORDER BY e.enrollment_date DESC, e.id DESC`,
      [id]
    );
    res.json({ data: rows });
  })
);

studentsRouter.post(
  '/:id/enrollments',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const parsed = enrollmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }

    const result = await withTransaction((conn) =>
      createEnrollment(conn, {
        actorId: req.user!.id,
        actorUsername: req.user!.username,
        studentId: id,
        classId: parsed.data.classId,
        enrollmentDate: parsed.data.enrollmentDate,
        ip: req.ip,
      })
    );

    res.status(201).json(result);
  })
);

// ---------- Responsables légaux de l'élève ----------
studentsRouter.get(
  '/:id/guardians',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');
    const [rows] = await getPool().query(
      `SELECT sg.guardian_id AS guardianId, sg.relationship_label AS relationshipLabel,
              sg.is_primary_contact AS isPrimaryContact, sg.is_legal_guardian AS isLegalGuardian,
              sg.contact_allowed AS contactAllowed, sg.notes,
              g.last_name AS lastName, g.first_names AS firstNames, g.relationship, g.phone_main AS phoneMain,
              g.phone_secondary AS phoneSecondary, g.email, g.address, g.status
       FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.student_id = ?
       ORDER BY sg.is_primary_contact DESC, g.last_name`,
      [id]
    );
    res.json({ data: rows });
  })
);

// Associer un responsable existant (ou le créer puis l'associer)
studentsRouter.post(
  '/:id/guardians',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const body = req.body as Record<string, unknown>;
    let guardianId: number | null = null;
    let link = body.link as Record<string, unknown> | undefined;

    if (typeof body.guardianId === 'number') {
      guardianId = body.guardianId;
    } else {
      const parsedGuardian = guardianSchema.safeParse(body);
      if (!parsedGuardian.success) {
        throw badRequest('Fournissez un guardianId ou les coordonnées complètes du responsable.', parsedGuardian.error.flatten().fieldErrors);
      }
      const [gr] = await getPool().query(
        `INSERT INTO guardians (last_name, first_names, relationship, phone_main, phone_secondary, email, address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          parsedGuardian.data.lastName,
          parsedGuardian.data.firstNames,
          parsedGuardian.data.relationship,
          parsedGuardian.data.phoneMain,
          parsedGuardian.data.phoneSecondary ?? null,
          parsedGuardian.data.email ?? null,
          parsedGuardian.data.address ?? null,
        ]
      );
      guardianId = (gr as { insertId: number }).insertId;
      link = body.link as Record<string, unknown> | undefined;
    }

    const parsedLink = linkGuardianSchema.safeParse({ guardianId, link });
    if (!parsedLink.success) {
      throw badRequest('Données invalides.', parsedLink.error.flatten().fieldErrors);
    }

    await withTransaction(async (conn) => {
      const [studentExists] = await conn.query('SELECT id FROM students WHERE id = ?', [id]);
      if ((studentExists as unknown[]).length === 0) throw notFound('Élève introuvable.');
      const [guardianExists] = await conn.query('SELECT id FROM guardians WHERE id = ?', [guardianId]);
      if ((guardianExists as unknown[]).length === 0) throw badRequest('Responsable inconnu.');
      const [dup] = await conn.query(
        'SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?',
        [id, guardianId]
      );
      if ((dup as unknown[]).length > 0) {
        throw conflict('Ce responsable est déjà associé à cet élève.');
      }

      const l = parsedLink.data.link ?? {};
      await conn.query(
        `INSERT INTO student_guardians (student_id, guardian_id, relationship_label, is_primary_contact, is_legal_guardian, contact_allowed, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          guardianId,
          l.relationshipLabel ?? null,
          l.isPrimaryContact === true ? 1 : 0,
          l.isLegalGuardian === true ? 1 : 0,
          l.contactAllowed !== false ? 1 : 0,
          l.notes ?? null,
        ]
      );

      // Un seul contact principal par élève
      if (l.isPrimaryContact === true) {
        await conn.query(
          `UPDATE student_guardians SET is_primary_contact = 0 WHERE student_id = ? AND guardian_id <> ? AND is_primary_contact = 1`,
          [id, guardianId]
        );
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'students.guardians.link',
      entityType: 'student_guardian',
      entityId: `${id}:${guardianId}`,
      ip: req.ip ?? null,
    });

    res.status(201).json({ guardianId });
  })
);

// Corriger une association
studentsRouter.patch(
  '/:id/guardians/:guardianId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const guardianId = Number(req.params.guardianId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(guardianId) || guardianId <= 0) {
      throw badRequest('Identifiants invalides.');
    }
    const parsed = updateLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const v = parsed.data;

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?',
        [id, guardianId]
      );
      if ((rows as unknown[]).length === 0) throw notFound('Association introuvable.');

      // Construction dynamique : champ absent = inchangé
      const sets: string[] = [];
      const params: unknown[] = [];
      if (v.relationshipLabel !== undefined) {
        sets.push('relationship_label = ?');
        params.push(v.relationshipLabel);
      }
      if (v.isLegalGuardian !== undefined) {
        sets.push('is_legal_guardian = ?');
        params.push(v.isLegalGuardian ? 1 : 0);
      }
      if (v.contactAllowed !== undefined) {
        sets.push('contact_allowed = ?');
        params.push(v.contactAllowed ? 1 : 0);
      }
      if (v.notes !== undefined) {
        sets.push('notes = ?');
        params.push(v.notes);
      }
      if (sets.length > 0) {
        params.push(id, guardianId);
        await conn.query(
          `UPDATE student_guardians SET ${sets.join(', ')} WHERE student_id = ? AND guardian_id = ?`,
          params
        );
      }

      if (v.isPrimaryContact !== undefined) {
        if (v.isPrimaryContact) {
          await conn.query('UPDATE student_guardians SET is_primary_contact = 0 WHERE student_id = ?', [id]);
          await conn.query(
            'UPDATE student_guardians SET is_primary_contact = 1 WHERE student_id = ? AND guardian_id = ?',
            [id, guardianId]
          );
        } else {
          await conn.query(
            'UPDATE student_guardians SET is_primary_contact = 0 WHERE student_id = ? AND guardian_id = ?',
            [id, guardianId]
          );
        }
      }
      return true;
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'students.guardians.update',
      entityType: 'student_guardian',
      entityId: `${id}:${guardianId}`,
      details: { fields: Object.keys(v) },
      ip: req.ip ?? null,
    });

    res.json({ ok: result });
  })
);

// Retirer une association (le responsable reste s'il suit d'autres élèves)
studentsRouter.delete(
  '/:id/guardians/:guardianId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const guardianId = Number(req.params.guardianId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(guardianId) || guardianId <= 0) {
      throw badRequest('Identifiants invalides.');
    }

    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT is_primary_contact FROM student_guardians WHERE student_id = ? AND guardian_id = ?',
        [id, guardianId]
      );
      const link = (rows as { is_primary_contact: number }[])[0];
      if (!link) throw notFound('Association introuvable.');

      await conn.query('DELETE FROM student_guardians WHERE student_id = ? AND guardian_id = ?', [id, guardianId]);

      if (link.is_primary_contact === 1) {
        // Promouvoir automatiquement un autre responsable comme contact principal
        const [next] = await conn.query(
          `SELECT guardian_id FROM student_guardians WHERE student_id = ? ORDER BY is_legal_guardian DESC, guardian_id LIMIT 1`,
          [id]
        );
        const nextGuardian = (next as { guardian_id: number }[])[0];
        if (nextGuardian) {
          await conn.query(
            'UPDATE student_guardians SET is_primary_contact = 1 WHERE student_id = ? AND guardian_id = ?',
            [id, nextGuardian.guardian_id]
          );
        }
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'students.guardians.unlink',
      entityType: 'student_guardian',
      entityId: `${id}:${guardianId}`,
      ip: req.ip ?? null,
    });

    res.json({ ok: true });
  })
);

// ---------- Données d'impression de la fiche élève ----------
studentsRouter.get(
  '/:id/print-data',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide.');

    const [studentRows] = await getPool().query(
      `SELECT s.id, s.matricule, s.last_name, s.first_names, s.birth_date, s.sex, s.address, s.entry_date, s.status
       FROM students s WHERE s.id = ?`,
      [id]
    );
    const student = (studentRows as Record<string, unknown>[])[0];
    if (!student) throw notFound('Élève introuvable.');

    const [settingsRows] = await getPool().query(
      `SELECT school_name AS schoolName, address, phone, email, logo, document_header AS documentHeader
       FROM school_settings WHERE id = 1`
    );
    const settings = (settingsRows as Record<string, unknown>[])[0] ?? {};

    const [enrollRows] = await getPool().query(
      `SELECT c.name AS className, l.name AS levelName, sy.label AS schoolYearLabel
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN levels l ON l.id = c.level_id
       JOIN school_years sy ON sy.id = e.school_year_id
       WHERE e.student_id = ? AND e.status = 'active'
       LIMIT 1`,
      [id]
    );
    const currentEnrollment = (enrollRows as Record<string, unknown>[])[0] ?? null;

    // Seuls les contacts autorisés figurent sur le document
    const [guardianRows] = await getPool().query(
      `SELECT CONCAT(g.last_name, ' ', g.first_names) AS fullName,
              COALESCE(sg.relationship_label, g.relationship) AS relationship,
              g.phone_main AS phoneMain
       FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.student_id = ? AND sg.contact_allowed = 1
       ORDER BY sg.is_primary_contact DESC, g.last_name`,
      [id]
    );

    res.json({
      data: {
        student,
        school: settings,
        currentEnrollment,
        guardians: guardianRows,
        printedAt: new Date().toISOString(),
      },
    });
  })
);
