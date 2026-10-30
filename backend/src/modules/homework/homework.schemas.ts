import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

const HOMEWORK_TYPES = [
  'homework',
  'classwork',
  'exam_revision',
  'group_work',
  'reading',
  'corrected_exercise',
  'practice_sheet',
  'optional',
] as const;

const QUESTION_TYPES = [
  'free_text',
  'calculation',
  'short_answer',
  'mcq',
  'true_false',
  'fill_blank',
  'multi_part',
] as const;

const SUBMISSION_STATUSES = [
  'todo',
  'started',
  'submitted',
  'late',
  'graded',
  'not_submitted',
] as const;

export const HOMEWORK_TYPE_VALUES = HOMEWORK_TYPES;
export const QUESTION_TYPE_VALUES = QUESTION_TYPES;
export const SUBMISSION_STATUS_VALUES = SUBMISSION_STATUSES;

export const createHomeworkSchema = z
  .object({
    school_year_id: z.coerce.number().int().positive(),
    class_id: z.coerce.number().int().positive(),
    subject_id: z.coerce.number().int().positive(),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(5000).optional().nullable(),
    homework_type: z.enum(HOMEWORK_TYPES).default('homework'),
    publish_date: dateString.optional().nullable(),
    due_date: dateString.optional().nullable(),
    estimated_minutes: z.coerce.number().int().min(1).max(600).optional().nullable(),
    max_score: z.coerce.number().min(0).max(1000).optional().nullable(),
    publish: z.boolean().default(false),
    notify_class: z.boolean().default(false),
  })
  .refine(
    (v) =>
      !v.publish_date || !v.due_date || v.due_date >= v.publish_date,
    { message: 'La date limite ne peut pas précéder la date de publication.', path: ['due_date'] }
  );

export const updateHomeworkSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    homework_type: z.enum(HOMEWORK_TYPES).optional(),
    publish_date: dateString.optional().nullable(),
    due_date: dateString.optional().nullable(),
    estimated_minutes: z.coerce.number().int().min(1).max(600).optional().nullable(),
    max_score: z.coerce.number().min(0).max(1000).optional().nullable(),
  })
  .refine(
    (v) => {
      const pd = v.publish_date ?? undefined;
      const dd = v.due_date ?? undefined;
      return !pd || !dd || dd >= pd;
    },
    { message: 'La date limite ne peut pas précéder la date de publication.', path: ['due_date'] }
  );

export const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question_type: z.enum(QUESTION_TYPES),
        statement: z.string().trim().min(1).max(5000),
        instructions: z.string().trim().max(3000).optional().nullable(),
        points: z.coerce.number().min(0).max(1000).optional().nullable(),
        options: z.array(z.string().trim().min(1).max(500)).max(20).optional().nullable(),
        expected_answer: z.string().trim().max(5000).optional().nullable(),
        pedagogical_explanation: z.string().trim().max(3000).optional().nullable(),
      })
    )
    .max(100),
});

export const assignStudentsSchema = z.object({
  student_ids: z.array(z.coerce.number().int().positive()).min(1).max(300),
});

export const submissionSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  status: z.enum(SUBMISSION_STATUSES),
  comment: z.string().trim().max(2000).optional().nullable(),
  feedback: z.string().trim().max(3000).optional().nullable(),
  indicative_score: z.coerce.number().min(0).max(1000).optional().nullable(),
  submitted_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const integrateSchema = z.object({
  grading_period_id: z.coerce.number().int().positive(),
  assessment_date: dateString,
  title: z.string().trim().min(1).max(180).optional(),
  max_score: z.coerce.number().min(0).max(1000).optional().nullable(),
  coefficient: z.coerce.number().min(0).max(50).optional(),
});

export const listQuerySchema = z.object({
  year: z.coerce.number().int().positive().optional(),
  class: z.coerce.number().int().positive().optional(),
  subject: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'published', 'closed', 'archived', 'all']).default('all'),
  type: z.enum([...HOMEWORK_TYPES, 'all']).default('all'),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(5).max(100).default(20),
});

export const calendarQuerySchema = z.object({
  year: z.coerce.number().int().positive().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  class: z.coerce.number().int().positive().optional(),
  subject: z.coerce.number().int().positive().optional(),
});

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type QuestionsInput = z.infer<typeof questionsSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
