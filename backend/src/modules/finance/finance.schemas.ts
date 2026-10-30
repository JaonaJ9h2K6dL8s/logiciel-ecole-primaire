import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

export const FEE_CATEGORIES = [
  'registration', 'tuition', 'exam', 'supplies', 'transport', 'canteen', 'other',
] as const;
export type FeeCategory = (typeof FEE_CATEGORIES)[number];

export const FEE_FREQUENCIES = ['once', 'monthly', 'quarterly', 'annual', 'custom'] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

export const PAYMENT_METHODS = [
  'cash', 'mvola', 'orange_money', 'airtel_money', 'bank_transfer', 'cheque', 'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Montant entier strictement positif (ariary) — aucun flottant. */
const ariary = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const tariffBaseSchema = z.object({
  school_year_id: z.coerce.number().int().positive(),
  level_id: z.coerce.number().int().positive().nullable().optional(),
  class_id: z.coerce.number().int().positive().nullable().optional(),
  fee_category: z.enum(FEE_CATEGORIES),
  name: z.string().trim().min(1).max(150),
  amount: ariary,
  frequency: z.enum(FEE_FREQUENCIES),
  applies_from: dateString.nullable().optional(),
  applies_to: dateString.nullable().optional(),
  is_active: z.boolean().optional().default(true),
  description: z.string().trim().max(500).nullable().optional(),
});

export const tariffCreateSchema = tariffBaseSchema
  .refine((v) => v.level_id == null || v.class_id == null, {
    message: 'Un tarif concerne un niveau OU une classe, pas les deux.',
    path: ['class_id'],
  })
  .refine(
    (v) => !v.applies_from || !v.applies_to || v.applies_to >= v.applies_from,
    { message: 'La date de fin ne peut pas précéder la date de début.', path: ['applies_to'] }
  );

export const tariffUpdateSchema = tariffBaseSchema
  .extend({
    is_active: z.boolean().optional(),
  })
  .partial()
  .refine((v) => v.level_id == null || v.class_id == null, {
    message: 'Un tarif concerne un niveau OU une classe, pas les deux.',
    path: ['class_id'],
  })
  .refine(
    (v) => !v.applies_from || !v.applies_to || v.applies_to >= v.applies_from,
    { message: 'La date de fin ne peut pas précéder la date de début.', path: ['applies_to'] }
  );

export const studentFeeCreateSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  school_year_id: z.coerce.number().int().positive(),
  class_id: z.coerce.number().int().positive().nullable().optional(),
  fee_category: z.enum(FEE_CATEGORIES).optional().default('other'),
  name: z.string().trim().min(1).max(150),
  amount: ariary,
  due_date: dateString.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Motif requis (3 caractères minimum).').max(500),
});

export const paymentCreateSchema = z.object({
  student_fee_id: z.coerce.number().int().positive(),
  amount: ariary,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).nullable().optional(),
  payer_name: z.string().trim().max(150).nullable().optional(),
  comment: z.string().trim().max(500).nullable().optional(),
  idempotency_key: z.string().trim().max(64).optional(),
});

export const cancelRequestSchema = z.object({
  payment_id: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, 'Motif requis (3 caractères minimum).').max(500),
  replacement_payment_id: z.coerce.number().int().positive().nullable().optional(),
});

export const rejectCancellationSchema = z.object({
  reason: z.string().trim().min(3, 'Motif du refus requis.').max(500),
});
