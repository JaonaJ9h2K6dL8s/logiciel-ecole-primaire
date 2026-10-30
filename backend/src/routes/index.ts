import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { appearanceRouter } from '../modules/appearance/appearance.routes';
import { usersRouter } from '../modules/users/users.routes';
import { schoolYearsRouter } from '../modules/school-years/school-years.routes';
import { academicsRouter } from '../modules/academics/academics.routes';
import { studentsRouter } from '../modules/students/students.routes';
import { guardiansRouter } from '../modules/students/guardians.routes';
import { entryPunchesRouter } from '../modules/entry-punches/entry-punches.routes';
import { attendanceRouter } from '../modules/attendance/attendance.routes';
import { teacherAssignmentsRouter } from '../modules/attendance/teacher-assignments.routes';
import { subjectsRouter } from '../modules/grading/subjects.routes';
import { periodsRouter } from '../modules/grading/periods.routes';
import { assessmentsRouter } from '../modules/grading/assessments.routes';
import { gradesRouter } from '../modules/grading/grades.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { pedagogicalAiRouter } from '../modules/pedagogical-ai/ai.routes';
import { parentContactsRouter } from '../modules/parent-contacts/parent-contacts.routes';
import { schoolEventsRouter, schoolEventCategoriesRouter } from '../modules/school-events/school-events.routes';
import { announcementsRouter } from '../modules/announcements/announcements.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { statisticsRouter } from '../modules/statistics/statistics.routes';
import { homeworkRouter } from '../modules/homework/homework.routes';
import { examsRouter } from '../modules/exams/exams.routes';
import { financeRouter } from '../modules/finance/finance.routes';
import { diagnosticsRouter } from '../modules/diagnostics/diagnostics.routes';
import { auditRouter } from '../modules/audit/audit.routes';
import { studentsZoneRouter } from '../modules/students-zone/students-zone.routes';
import { aiOrchestratorRouter } from '../modules/ai-orchestrator/ai-orchestrator.routes';
import { checkDatabase } from '../database/pool';
import { asyncHandler } from '../shared/errors';

export const apiRouter = Router();

// Route de santé publique (pas de données sensibles)
apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const db = await checkDatabase();
    res.json({
      status: 'ok',
      database: db ? 'ok' : 'injoignable',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  })
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/appearance', appearanceRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/school-years', schoolYearsRouter);
apiRouter.use('/academics', academicsRouter);
apiRouter.use('/students', studentsRouter);
apiRouter.use('/guardians', guardiansRouter);
apiRouter.use('/entry-punches', entryPunchesRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/teacher-assignments', teacherAssignmentsRouter);
apiRouter.use('/subjects', subjectsRouter);
apiRouter.use('/grading-periods', periodsRouter);
apiRouter.use('/assessments', assessmentsRouter);
apiRouter.use('/grades', gradesRouter);
apiRouter.use('/report-cards', reportsRouter);
apiRouter.use('/pedagogical-ai', pedagogicalAiRouter);
apiRouter.use('/parent-contacts', parentContactsRouter);
apiRouter.use('/school-events', schoolEventsRouter);
apiRouter.use('/school-event-categories', schoolEventCategoriesRouter);
apiRouter.use('/school-announcements', announcementsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/statistics', statisticsRouter);
apiRouter.use('/homework', homeworkRouter);
apiRouter.use('/exams', examsRouter);
apiRouter.use('/finance', financeRouter);
apiRouter.use('/diagnostics', diagnosticsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/students-zone', studentsZoneRouter);
apiRouter.use('/ai-orchestrator', aiOrchestratorRouter);
