import { z } from 'zod';

const phoneRegex = /^[+0-9][0-9 ()\.\-]{6,25}$/;

export const studentCoreSchema = {
  lastName: z.string().trim().min(1, 'Le nom est obligatoire.').max(80),
  firstNames: z.string().trim().min(1, 'Le(s) prénom(s) est/sont obligatoire(s).').max(120),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de naissance invalide.')
    .nullable()
    .optional(),
  sex: z.enum(['M', 'F']).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'departed', 'archived']).optional(),
};

export const guardianSchema = z.object({
  lastName: z.string().trim().min(1, 'Nom du responsable obligatoire.').max(80),
  firstNames: z.string().trim().min(1, 'Prénom(s) du responsable obligatoire.').max(120),
  relationship: z.enum(['father', 'mother', 'legal_guardian', 'other']).default('other'),
  phoneMain: z
    .string()
    .trim()
    .regex(phoneRegex, 'Numéro de téléphone invalide (ex. 034 00 000 00 ou +261 34 00 000 00).'),
  phoneSecondary: z.string().trim().regex(phoneRegex, 'Numéro invalide.').nullable().optional(),
  email: z.string().trim().max(150).email('Adresse électronique invalide.').nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export const guardianLinkSchema = z.object({
  relationshipLabel: z.string().trim().max(80).nullable().optional(),
  isPrimaryContact: z.boolean().optional(),
  isLegalGuardian: z.boolean().optional(),
  contactAllowed: z.boolean().optional(),
  notes: z.string().trim().max(255).nullable().optional(),
});

export const enrollmentSchema = z.object({
  classId: z.coerce.number().int().positive('Classe requise.'),
  enrollmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’inscription invalide (AAAA-MM-JJ).'),
});

export const createStudentSchema = z.object({
  student: z.object(studentCoreSchema),
  guardians: z
    .array(
      z.object({
        guardianId: z.coerce.number().int().positive().optional(),
        fields: guardianSchema.partial({ lastName: true, firstNames: true, phoneMain: true }).optional(),
        link: guardianLinkSchema.optional(),
      })
    )
    .max(10)
    .optional(),
  enrollment: enrollmentSchema.optional(),
});

export const updateStudentSchema = z.object(studentCoreSchema).partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'Aucune modification fournie.' }
);

export const createGuardianSchema = guardianSchema;

export const updateGuardianSchema = guardianSchema.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'Aucune modification fournie.' }
);

export const linkGuardianSchema = z
  .object({
    guardianId: z.coerce.number().int().positive(),
    link: guardianLinkSchema.optional(),
  })
  .refine((v) => v.guardianId > 0, { message: 'Responsable requis.' });

export const updateLinkSchema = guardianLinkSchema.refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: 'Aucune modification fournie.' }
);
