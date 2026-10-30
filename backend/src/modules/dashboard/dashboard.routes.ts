import { Router } from 'express';
import { getPool, checkDatabase } from '../../database/pool';
import { asyncHandler } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';

export const dashboardRouter = Router();

// Indicateurs réels uniquement — aucun chiffre fictif.
dashboardRouter.get(
  '/',
  requireAuth,
  requirePermission('dashboard.view'),
  asyncHandler(async (_req, res) => {
    const [usersRows] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS totalUsers,
         (SELECT COUNT(*) FROM users WHERE is_active = 1) AS activeUsers,
         (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'teacher') AS teachers`
    );
    const [classRows] = await getPool().query('SELECT COUNT(*) AS totalClasses FROM classes');
    const [yearRows] = await getPool().query(
      `SELECT id, label, start_date AS startDate, end_date AS endDate
       FROM school_years WHERE is_active = 1 LIMIT 1`
    );
    const [studentRows] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM students) AS totalStudents,
         (SELECT COUNT(*) FROM students WHERE status = 'active') AS activeStudents`
    );
    const students = (studentRows as { totalStudents: number; activeStudents: number }[])[0];

    const dbOk = await checkDatabase();

    res.json({
      data: {
        users: usersRows,
        classes: classRows,
        activeYear: (yearRows as unknown[])[0] ?? null,
        students: {
          total: students.totalStudents,
          active: students.activeStudents,
        },
        database: dbOk ? 'ok' : 'injoignable',
      },
    });
  })
);
