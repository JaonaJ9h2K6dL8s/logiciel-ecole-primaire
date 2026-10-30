import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

export const yearQuerySchema = z.object({
  year: z.coerce.number().int().positive().optional(),
});

export const overviewQuerySchema = yearQuerySchema.extend({
  date: dateString.optional(),
});

export const attendanceQuerySchema = yearQuerySchema.extend({
  from: dateString.optional(),
  to: dateString.optional(),
});

export const periodQuerySchema = yearQuerySchema.extend({
  period: z.coerce.number().int().positive().optional(),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

export type YearQuery = z.infer<typeof yearQuerySchema>;
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
