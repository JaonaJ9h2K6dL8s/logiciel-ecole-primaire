import { z } from 'zod';

const languageSchema = z.enum(['fr', 'mg', 'en']);
const difficultySchema = z.enum(['facile', 'moyen', 'difficile']);
const comprehensionSchema = z.enum(['debutant', 'progression', 'intermediaire', 'avance']);
const answerTypeSchema = z.enum(['ouverte', 'qcm', 'mixte']);
const taskSchema = z.enum(['course', 'explain', 'exercises', 'analyze_errors', 'fiche']);

const optionalId = z.coerce.number().int().positive().nullable().optional();

// ---------- Configuration (admin) ----------
export const aiConfigUpdateSchema = z
  .object({
    provider: z.enum(['none', 'openai', 'anthropic', 'ollama']),
    model: z.string().trim().max(120).nullable().optional(),
    baseUrl: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

// ---------- Documents ----------
export const documentsListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const documentUpdateSchema = z
  .object({
    extractedText: z.string().max(200000).nullable(),
  })
  .strict();

// ---------- Génération ----------
export const generateSchema = z
  .object({
    task: taskSchema,
    classId: optionalId,
    levelId: optionalId,
    subjectId: optionalId,
    // course
    topic: z.string().trim().min(2).max(500).optional(),
    objectives: z.string().trim().max(2000).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(5).max(300).nullable().optional(),
    language: languageSchema.default('fr'),
    difficulty: difficultySchema.default('moyen'),
    supportType: z.string().trim().max(200).nullable().optional(),
    // explain
    notion: z.string().trim().min(2).max(500).optional(),
    comprehensionLevel: comprehensionSchema.optional(),
    // exercises
    count: z.coerce.number().int().min(1).max(30).optional(),
    answerType: answerTypeSchema.optional(),
    // analyze_errors : réponses déjà anonymisées côté interface, re-anonymisées serveur
    anonymizedResponses: z.array(z.string().trim().min(1).max(4000)).min(1).max(30).optional(),
    // fiche
    title: z.string().trim().min(2).max(200).optional(),
    sourceDocumentId: optionalId,
    sourceContentId: optionalId,
  })
  .strict();

// ---------- Assistant conversationnel ----------
// L'identité, le prompt système et les limites sont gérés côté serveur ;
// le navigateur ne fournit que le message, un historique borné de tours
// user/assistant et un contexte pédagogique facultatif.
export const chatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(8000),
  })
  .strict();

export const chatSchema = z
  .object({
    message: z.string().trim().min(1, 'Message vide.').max(4000),
    history: z.array(chatMessageSchema).max(20).default([]),
    context: z
      .object({
        classId: optionalId,
        levelId: optionalId,
        subjectId: optionalId,
        kind: z.enum(['explication', 'lecon', 'exercices', 'evaluation', 'libre']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// ---------- Bibliothèque ----------
export const contentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    kind: taskSchema.optional(),
    status: z.enum(['generated', 'edited', 'validated', 'archived']).optional(),
    subjectId: optionalId,
    levelId: optionalId,
    authorId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict();

export const contentUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    content: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: 'Aucune modification fournie.',
  });
