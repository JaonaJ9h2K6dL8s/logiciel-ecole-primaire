import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import multer from 'multer';
import { getPool } from '../../database/pool';
import { asyncHandler, AppError, badRequest, forbidden, notFound } from '../../shared/errors';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import {
  aiConfigUpdateSchema,
  chatSchema,
  documentsListQuerySchema,
  documentUpdateSchema,
  generateSchema,
  contentListQuerySchema,
  contentUpdateSchema,
} from './ai.schemas';
import {
  anonymizeForAi,
  buildAnalyzeErrorsPrompt,
  buildChatSystemPrompt,
  buildCoursePrompt,
  buildExercisesPrompt,
  buildExplainPrompt,
  buildFichePrompt,
  extractJsonObject,
  flattenText,
  type AiTask,
} from './ai.prompts';
import { AiUnavailableError, checkAiAvailability, generateChatCompletion, generateRaw, getAiConfig, getOllamaStatus } from './ai.providers';

export const pedagogicalAiRouter = Router();

pedagogicalAiRouter.use(requireAuth);
// L'IA est réservée aux utilisateurs autorisés (admin et professeurs) :
// contrôle appliqué à tout le module, pas seulement à l'interface.
pedagogicalAiRouter.use(requirePermission('pedagogical_ai.use'));

const KIND_BY_TASK: Record<AiTask, 'course' | 'exercises' | 'explanation' | 'remediation' | 'fiche'> = {
  course: 'course',
  explain: 'explanation',
  exercises: 'exercises',
  analyze_errors: 'remediation',
  fiche: 'fiche',
};

const FALLBACK_TITLES: Record<AiTask, string> = {
  course: 'Cours (proposition IA)',
  explain: 'Explication (proposition IA)',
  exercises: 'Exercices (proposition IA)',
  analyze_errors: 'Remédiation (proposition IA)',
  fiche: 'Fiche pédagogique (proposition IA)',
};

function isAdmin(role: string): boolean {
  return role === 'admin';
}

// ======================= CONFIGURATION =======================

// Classes et niveaux proposés dans les formulaires IA, dans le périmètre du
// rôle : un professeur ne voit que ses classes affectées et leurs niveaux
// (remplace /academics/classes et /academics/levels, réservés à la gestion admin).
pedagogicalAiRouter.get(
  '/form-options',
  asyncHandler(async (req, res) => {
    const admin = isAdmin(req.user!.role_code);
    const teacherId = req.user!.id;
    const classSql = admin
      ? `SELECT c.id, c.name, y.label AS yearLabel, c.level_id AS levelId
         FROM classes c JOIN school_years y ON y.id = c.school_year_id
         WHERE c.is_active = 1 ORDER BY y.start_date DESC, c.name`
      : `SELECT DISTINCT c.id, c.name, y.label AS yearLabel, c.level_id AS levelId
         FROM classes c
         JOIN school_years y ON y.id = c.school_year_id
         JOIN teacher_class_assignments tca ON tca.class_id = c.id AND tca.school_year_id = c.school_year_id
         WHERE c.is_active = 1 AND tca.teacher_id = ? AND tca.assigned_to IS NULL
         ORDER BY y.start_date DESC, c.name`;
    const [classes] = admin
      ? await getPool().query(classSql)
      : await getPool().query(classSql, [teacherId]);
    const levelSql = admin
      ? `SELECT id, name FROM levels ORDER BY order_index`
      : `SELECT DISTINCT l.id, l.name
         FROM levels l
         JOIN classes c ON c.level_id = l.id AND c.is_active = 1
         JOIN teacher_class_assignments tca ON tca.class_id = c.id AND tca.school_year_id = c.school_year_id
         WHERE tca.teacher_id = ? AND tca.assigned_to IS NULL
         ORDER BY l.order_index`;
    const [levels] = admin
      ? await getPool().query(levelSql)
      : await getPool().query(levelSql, [teacherId]);
    res.json({ data: { classes, levels } });
  })
);

// État du service : consultation autorisée pour tout utilisateur du module,
// modification et test de connexion réservés à pedagogical_ai.manage.
pedagogicalAiRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const cfg = await getAiConfig();
    res.json({ config: cfg });
  })
);

pedagogicalAiRouter.patch(
  '/config',
  requirePermission('pedagogical_ai.manage'),
  asyncHandler(async (req, res) => {
    const parsed = aiConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Configuration invalide.', parsed.error.flatten().fieldErrors);
    }
    const { provider, model, baseUrl } = parsed.data;
    const none = provider === 'none';
    await getPool().query(
      `UPDATE ai_config SET provider = ?, model = ?, base_url = ?, last_check_ok = NULL, last_check_at = NULL, last_check_message = NULL, updated_by = ? WHERE id = 1`,
      [provider, none ? null : (model ?? null), none ? null : (baseUrl ?? null), req.user!.id]
    );
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_config.update',
      entityType: 'ai_config',
      entityId: 1,
      details: { provider, modelSet: Boolean(model) },
    });
    const cfg = await getAiConfig();
    res.json({ config: cfg });
  })
);

pedagogicalAiRouter.post(
  '/config/check',
  requirePermission('pedagogical_ai.manage'),
  asyncHandler(async (req, res) => {
    const result = await checkAiAvailability(req.user!.id);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_config.check',
      entityType: 'ai_config',
      entityId: 1,
      result: result.ok ? 'success' : 'failure',
      details: { ok: result.ok },
    });
    res.json(result);
  })
);

// État du moteur LOCAL Ollama : vérification légère (liste des modèles
// installés), distincte d'un test de génération. Consultable par tout
// utilisateur du module ; aucun secret n'est renvoyé.
pedagogicalAiRouter.get(
  '/config/ollama-status',
  asyncHandler(async (_req, res) => {
    res.json(await getOllamaStatus());
  })
);

// ======================= DOCUMENTS =======================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.mimetype)) {
      cb(new AppError(400, 'BAD_REQUEST', 'Type de fichier non pris en charge (PDF, DOCX ou texte brut).'));
      return;
    }
    cb(null, true);
  },
});

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
}

interface DocumentRow {
  id: number;
  uploaded_by: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  extraction_method: string;
  extraction_status: string;
  extracted_text: string | null;
  char_count: number | null;
  created_at: Date;
}

async function loadDocument(id: number): Promise<DocumentRow> {
  const [rows] = await getPool().query('SELECT * FROM ai_documents WHERE id = ?', [id]);
  const row = (rows as DocumentRow[])[0];
  if (!row) throw notFound('Document introuvable.');
  return row;
}

function assertDocumentAccess(user: { id: number; role_code: string }, doc: DocumentRow): void {
  if (isAdmin(user.role_code) || doc.uploaded_by === user.id) return;
  throw forbidden('Document non accessible (réservé à son auteur).');
}

pedagogicalAiRouter.post(
  '/documents',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Aucun fichier reçu (champ « file »).');

    const isPdf = file.mimetype === 'application/pdf';
    const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isTxt = file.mimetype === 'text/plain';

    let method: 'plain' | 'pdf' | 'docx' | 'none' = 'none';
    let status: 'extracted' | 'partial' | 'failed' | 'unsupported' = 'unsupported';
    let text: string | null = null;

    if (isPdf || isDocx || isTxt) {
      method = isPdf ? 'pdf' : isDocx ? 'docx' : 'plain';
      try {
        text = isPdf ? await extractPdf(file.buffer) : isDocx ? await extractDocx(file.buffer) : file.buffer.toString('utf8');
        status = text && text.trim().length > 0 ? 'extracted' : 'failed';
        if (!text || text.trim().length === 0) text = null;
      } catch {
        // Extraction impossible : on ne simule jamais un succès.
        status = 'failed';
        text = null;
      }
    }

    const [result] = await getPool().query(
      `INSERT INTO ai_documents (uploaded_by, original_name, mime_type, size_bytes, extraction_method, extraction_status, extracted_text, char_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user!.id,
        file.originalname.slice(0, 255),
        file.mimetype,
        file.size,
        method,
        status,
        text,
        text ? text.length : null,
      ]
    );
    const insertId = (result as { insertId: number }).insertId;
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_document.upload',
      entityType: 'ai_documents',
      entityId: insertId,
      details: { method, status, size: file.size, chars: text ? text.length : 0 },
    });
    const doc = await loadDocument(insertId);
    res.status(201).json({ document: publicDocument(doc) });
  })
);

function publicDocument(doc: DocumentRow) {
  return {
    id: doc.id,
    originalName: doc.original_name,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    extractionMethod: doc.extraction_method,
    extractionStatus: doc.extraction_status,
    extractedText: doc.extracted_text,
    charCount: doc.char_count,
    createdAt: doc.created_at,
  };
}

pedagogicalAiRouter.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const parsed = documentsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const { page, pageSize } = parsed.data;
    const admin = isAdmin(req.user!.role_code);
    const where = admin ? '1=1' : 'uploaded_by = ?';
    const params: unknown[] = admin ? [] : [req.user!.id];
    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM ai_documents WHERE ${where}`, params);
    const total = (countRows as { total: number }[])[0].total;
    const [rows] = await getPool().query(
      `SELECT id, uploaded_by AS uploadedBy, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes,
              extraction_method AS extractionMethod, extraction_status AS extractionStatus,
              char_count AS charCount, created_at AS createdAt, LEFT(COALESCE(extracted_text, ''), 300) AS preview
       FROM ai_documents WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ items: rows, page, pageSize, total });
  })
);

pedagogicalAiRouter.get(
  '/documents/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const doc = await loadDocument(Number(req.params.id));
    assertDocumentAccess(req.user!, doc);
    res.json({ document: publicDocument(doc) });
  })
);

pedagogicalAiRouter.patch(
  '/documents/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const doc = await loadDocument(Number(req.params.id));
    assertDocumentAccess(req.user!, doc);
    const parsed = documentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const text = parsed.data.extractedText;
    await getPool().query(
      `UPDATE ai_documents SET extracted_text = ?, char_count = ?, extraction_status = ? WHERE id = ?`,
      [text, text ? text.length : null, text && text.trim() ? 'extracted' : 'failed', doc.id]
    );
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_document.correct_text',
      entityType: 'ai_documents',
      entityId: doc.id,
      details: { chars: text ? text.length : 0 },
    });
    const updated = await loadDocument(doc.id);
    res.json({ document: publicDocument(updated) });
  })
);

pedagogicalAiRouter.delete(
  '/documents/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const doc = await loadDocument(Number(req.params.id));
    assertDocumentAccess(req.user!, doc);
    await getPool().query('DELETE FROM ai_documents WHERE id = ?', [doc.id]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_document.delete',
      entityType: 'ai_documents',
      entityId: doc.id,
      details: { originalName: doc.original_name },
    });
    res.status(204).end();
  })
);

// ======================= GÉNÉRATION =======================

interface NameRow extends RowDataPacket {
  name: string;
}

async function loadNames(params: { classId?: number | null; levelId?: number | null; subjectId?: number | null }) {
  const [classRows, levelRows, subjectRows] = await Promise.all([
    params.classId
      ? getPool().query<NameRow[]>('SELECT name FROM classes WHERE id = ?', [params.classId])
      : Promise.resolve([[] as NameRow[]]),
    params.levelId ? getPool().query<NameRow[]>('SELECT name FROM levels WHERE id = ?', [params.levelId]) : Promise.resolve([[] as NameRow[]]),
    params.subjectId ? getPool().query<NameRow[]>('SELECT name FROM subjects WHERE id = ?', [params.subjectId]) : Promise.resolve([[] as NameRow[]]),
  ]);
  return {
    className: (classRows[0] as NameRow[])[0]?.name ?? null,
    levelName: (levelRows[0] as NameRow[])[0]?.name ?? null,
    subjectName: (subjectRows[0] as NameRow[])[0]?.name ?? null,
  };
}

/** Un professeur ne peut contextualiser une génération que sur ses classes. */
async function assertClassAccess(user: { id: number; role_code: string }, classId: number | null | undefined): Promise<void> {
  if (!classId || isAdmin(user.role_code)) return;
  const [rows] = await getPool().query(
    'SELECT 1 FROM teacher_class_assignments WHERE teacher_id = ? AND class_id = ? AND assigned_to IS NULL',
    [user.id, classId]
  );
  if ((rows as unknown[]).length === 0) {
    throw forbidden('Classe non autorisée pour ce professeur.');
  }
}

async function resolveSourceText(
  user: { id: number; role_code: string },
  sourceDocumentId?: number | null,
  sourceContentId?: number | null
): Promise<string | null> {
  if (sourceDocumentId) {
    const doc = await loadDocument(sourceDocumentId);
    assertDocumentAccess(user, doc);
    return doc.extracted_text;
  }
  if (sourceContentId) {
    const [rows] = await getPool().query('SELECT content_text, author_id FROM ai_content WHERE id = ?', [sourceContentId]);
    const row = (rows as { content_text: string | null; author_id: number }[])[0];
    if (!row) throw notFound('Contenu source introuvable.');
    if (!isAdmin(user.role_code) && row.author_id !== user.id) throw forbidden('Contenu source non accessible.');
    return row.content_text;
  }
  return null;
}

function requireField(value: unknown, field: string, taskLabel: string): asserts value is NonNullable<typeof value> {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    throw badRequest(`Champ requis manquant pour la tâche « ${taskLabel} » : ${field}.`);
  }
}

pedagogicalAiRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Requête de génération invalide.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const task = q.task;

    // Champs requis par tâche (validation métier au-delà du schéma générique)
    let prompts: { system: string; user: string };
    switch (task) {
      case 'course': {
        requireField(q.topic, 'topic', 'préparer un cours');
        const courseSource = await resolveSourceText(req.user!, q.sourceDocumentId, null);
        prompts = buildCoursePrompt({
          ...(await loadNames(q)),
          topic: q.topic!,
          objectives: q.objectives ?? null,
          durationMinutes: q.durationMinutes ?? null,
          language: q.language,
          difficulty: q.difficulty,
          supportType: q.supportType ?? null,
          documentText: courseSource ? anonymizeForAi(courseSource) : null,
        });
        break;
      }
      case 'explain':
        requireField(q.notion, 'notion', 'expliquer une notion');
        requireField(q.comprehensionLevel, 'comprehensionLevel', 'expliquer une notion');
        prompts = buildExplainPrompt({
          notion: q.notion!,
          comprehensionLevel: q.comprehensionLevel!,
          subjectName: (await loadNames(q)).subjectName,
        });
        break;
      case 'exercises':
        requireField(q.topic, 'topic', 'générer des exercices');
        requireField(q.count, 'count', 'générer des exercices');
        requireField(q.answerType, 'answerType', 'générer des exercices');
        prompts = buildExercisesPrompt({
          ...(await loadNames(q)),
          topic: q.topic!,
          objectives: q.objectives ?? null,
          difficulty: q.difficulty,
          count: q.count!,
          answerType: q.answerType!,
          durationMinutes: q.durationMinutes ?? null,
        });
        break;
      case 'analyze_errors': {
        requireField(q.topic, 'topic', 'analyser des erreurs');
        requireField(q.anonymizedResponses, 'anonymizedResponses', 'analyser des erreurs');
        // Aucune donnée nominative ne part vers le fournisseur : re-anonymisation serveur.
        const responses = q.anonymizedResponses!.map(anonymizeForAi);
        prompts = buildAnalyzeErrorsPrompt({
          ...(await loadNames(q)),
          topic: q.topic!,
          responses,
        });
        break;
      }
      case 'fiche': {
        requireField(q.title, 'title', 'fiche pédagogique');
        const sourceText = await resolveSourceText(req.user!, q.sourceDocumentId, q.sourceContentId);
        prompts = buildFichePrompt({
          title: q.title!,
          subjectName: (await loadNames(q)).subjectName,
          levelName: (await loadNames(q)).levelName,
          durationMinutes: q.durationMinutes ?? null,
          sourceText: sourceText ? anonymizeForAi(sourceText) : null,
        });
        break;
      }
    }

    await assertClassAccess(req.user!, q.classId);

    // L'appel IA est effectué exclusivement par le backend ; aucune clé
    // n'est exposée et aucun contenu nominatif d'élève n'est transmis.
    const completion = await generateRaw(prompts.system, prompts.user);
    let content: Record<string, unknown>;
    try {
      content = extractJsonObject(completion.text);
    } catch {
      throw new AppError(502, 'AI_BAD_RESPONSE', 'Réponse du modèle inexploitable (JSON attendu). Réessayez.');
    }

    const title =
      typeof content.title === 'string' && content.title.trim()
        ? content.title.trim().slice(0, 200)
        : FALLBACK_TITLES[task];
    const contentText = flattenText(content).slice(0, 200000);

    const [result] = await getPool().query(
      `INSERT INTO ai_content (author_id, kind, title, subject_id, level_id, class_id, language, content, content_text, status, source_document_id, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?)`,
      [
        req.user!.id,
        KIND_BY_TASK[task],
        title,
        q.subjectId ?? null,
        q.levelId ?? null,
        q.classId ?? null,
        q.language,
        JSON.stringify(content),
        contentText,
        q.sourceDocumentId ?? null,
        req.user!.id,
      ]
    );
    const id = (result as { insertId: number }).insertId;
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_content.generate',
      entityType: 'ai_content',
      entityId: id,
      details: { task, provider: completion.provider, model: completion.model },
    });
    const [rows] = await getPool().query('SELECT * FROM ai_content WHERE id = ?', [id]);
    res.status(201).json({ content: publicContent((rows as Record<string, unknown>[])[0]) });
  })
);

function publicContent(row: Record<string, unknown>) {
  return {
    id: row.id,
    authorId: row.author_id,
    kind: row.kind,
    title: row.title,
    subjectId: row.subject_id,
    levelId: row.level_id,
    classId: row.class_id,
    language: row.language,
    content: typeof row.content === 'string' ? JSON.parse(row.content as string) : row.content,
    status: row.status,
    sourceDocumentId: row.source_document_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ======================= ASSISTANT CONVERSATIONNEL =======================

// Limitation mémoire process-local : 12 messages/minute/utilisateur. La
// génération locale est lente (modèle 8B) ; cela évite de saturer Ollama.
const chatAttempts = new Map<number, { count: number; resetAt: number }>();
function assertChatRateLimit(userId: number): void {
  const now = Date.now();
  const entry = chatAttempts.get(userId);
  if (!entry || entry.resetAt <= now) {
    chatAttempts.set(userId, { count: 1, resetAt: now + 60000 });
    return;
  }
  entry.count += 1;
  if (entry.count > 12) {
    const seconds = Math.ceil((entry.resetAt - now) / 1000);
    throw new AppError(429, 'TOO_MANY_REQUESTS', `Trop de messages envoyés. Réessayez dans ${seconds} secondes.`);
  }
}

// Budget d'historique transmis au modèle (caractères, hors message courant).
// Stratégie documentée : au-delà, l'API refuse avec un message clair ; le
// message courant n'est JAMAIS supprimé silencieusement.
const CHAT_HISTORY_MAX_CHARS = 24000;

pedagogicalAiRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    assertChatRateLimit(req.user!.id);
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Requête de conversation invalide.', parsed.error.flatten().fieldErrors);
    }
    const { message, history, context } = parsed.data;

    const historyChars = history.reduce((n, m) => n + m.content.length, 0);
    if (historyChars > CHAT_HISTORY_MAX_CHARS) {
      throw badRequest(
        `Historique trop long (${historyChars} caractères, limite ${CHAT_HISTORY_MAX_CHARS}). Commencez une nouvelle conversation.`
      );
    }

    if (context?.classId) await assertClassAccess(req.user!, context.classId);
    const names = await loadNames(context ?? {});

    // Le prompt système est construit côté serveur ; le navigateur ne peut
    // jamais injecter d'instructions système (rôles limités à user/assistant).
    const completion = await generateChatCompletion([
      { role: 'system', content: buildChatSystemPrompt(names) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]);

    // Traçabilité minimale : longueurs et métadonnées uniquement, jamais le
    // contenu des conversations (pas de stockage inutile).
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_chat.message',
      entityType: 'ai_chat',
      details: {
        historyTurns: history.length,
        messageChars: message.length,
        replyChars: completion.text.length,
        provider: completion.provider,
        model: completion.model,
      },
    });

    res.json({ reply: completion.text, model: completion.model, provider: completion.provider });
  })
);

// ======================= BIBLIOTHÈQUE =======================

async function loadContent(id: number): Promise<Record<string, unknown>> {
  const [rows] = await getPool().query('SELECT * FROM ai_content WHERE id = ?', [id]);
  const row = (rows as Record<string, unknown>[])[0];
  if (!row) throw notFound('Contenu introuvable.');
  return row;
}

function assertContentAccess(user: { id: number; role_code: string }, row: Record<string, unknown>): void {
  if (isAdmin(user.role_code) || row.author_id === user.id) return;
  // Un brouillon privé n'est visible que de son auteur et de l'administration.
  throw forbidden('Contenu non accessible (réservé à son auteur).');
}

pedagogicalAiRouter.get(
  '/content',
  asyncHandler(async (req, res) => {
    const parsed = contentListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest('Paramètres invalides.', parsed.error.flatten().fieldErrors);
    }
    const q = parsed.data;
    const where: string[] = [];
    const params: unknown[] = [];
    if (!isAdmin(req.user!.role_code)) {
      where.push('author_id = ?');
      params.push(req.user!.id);
    } else if (q.authorId) {
      where.push('author_id = ?');
      params.push(q.authorId);
    }
    if (q.kind) {
      where.push('kind = ?');
      params.push(q.kind);
    }
    if (q.status) {
      where.push('status = ?');
      params.push(q.status);
    }
    if (q.subjectId) {
      where.push('subject_id = ?');
      params.push(q.subjectId);
    }
    if (q.levelId) {
      where.push('level_id = ?');
      params.push(q.levelId);
    }
    if (q.q) {
      where.push('MATCH(title, content_text) AGAINST (? IN NATURAL LANGUAGE MODE)');
      params.push(q.q);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM ai_content ${whereSql}`, params);
    const total = (countRows as { total: number }[])[0].total;
    const [rows] = await getPool().query(
      `SELECT id, author_id AS authorId, kind, title, subject_id AS subjectId, level_id AS levelId, class_id AS classId,
              language, status, source_document_id AS sourceDocumentId, created_at AS createdAt, updated_at AS updatedAt,
              LEFT(COALESCE(content_text, ''), 300) AS preview
       FROM ai_content ${whereSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json({ items: rows, page: q.page, pageSize: q.pageSize, total });
  })
);

pedagogicalAiRouter.get(
  '/content/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const row = await loadContent(Number(req.params.id));
    assertContentAccess(req.user!, row);
    res.json({ content: publicContent(row) });
  })
);

pedagogicalAiRouter.patch(
  '/content/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const row = await loadContent(Number(req.params.id));
    assertContentAccess(req.user!, row);
    if (row.status === 'archived') throw badRequest('Un contenu archivé ne peut plus être modifié.');
    const parsed = contentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Données invalides.', parsed.error.flatten().fieldErrors);
    }
    const newContent = parsed.data.content !== undefined ? parsed.data.content : typeof row.content === 'string' ? JSON.parse(row.content as string) : (row.content as Record<string, unknown>);
    const newTitle = parsed.data.title ?? (row.title as string);
    // Toute modification repasse le contenu en brouillon modifié (« edited »),
    // y compris après validation : la validation porte sur une version précise,
    // pas sur le contenu de façon permanente.
    await getPool().query(
      `UPDATE ai_content SET title = ?, content = ?, content_text = ?, status = 'edited', updated_by = ? WHERE id = ?`,
      [newTitle, JSON.stringify(newContent), flattenText(newContent).slice(0, 200000), req.user!.id, row.id]
    );
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_content.edit',
      entityType: 'ai_content',
      entityId: row.id as number,
      details: { titleChanged: parsed.data.title !== undefined, contentChanged: parsed.data.content !== undefined, previousStatus: row.status },
    });
    const updated = await loadContent(row.id as number);
    res.json({ content: publicContent(updated) });
  })
);

pedagogicalAiRouter.post(
  '/content/:id(\\d+)/:action(validate|archive)',
  asyncHandler(async (req, res) => {
    const row = await loadContent(Number(req.params.id));
    assertContentAccess(req.user!, row);
    const action = req.params.action as 'validate' | 'archive';
    const status = action === 'validate' ? 'validated' : 'archived';
    await getPool().query('UPDATE ai_content SET status = ?, updated_by = ? WHERE id = ?', [status, req.user!.id, row.id]);
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: `ai_content.${action}`,
      entityType: 'ai_content',
      entityId: row.id as number,
    });
    const updated = await loadContent(row.id as number);
    res.json({ content: publicContent(updated) });
  })
);

pedagogicalAiRouter.post(
  '/content/:id(\\d+)/duplicate',
  asyncHandler(async (req, res) => {
    const row = await loadContent(Number(req.params.id));
    assertContentAccess(req.user!, row);
    const [result] = await getPool().query(
      `INSERT INTO ai_content (author_id, kind, title, subject_id, level_id, class_id, language, content, content_text, status, source_document_id, updated_by)
       SELECT ?, kind, CONCAT(title, ' (copie)'), subject_id, level_id, class_id, language, content, content_text, 'generated', NULL, ?
       FROM ai_content WHERE id = ?`,
      [req.user!.id, req.user!.id, row.id]
    );
    const id = (result as { insertId: number }).insertId;
    await writeAudit({
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action: 'ai_content.duplicate',
      entityType: 'ai_content',
      entityId: id,
      details: { sourceId: row.id },
    });
    const created = await loadContent(id);
    res.status(201).json({ content: publicContent(created) });
  })
);

// Gestion d'erreurs spécifiques du module (fournisseur indisponible, upload, etc.)
pedagogicalAiRouter.use((err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  if (err instanceof AiUnavailableError) {
    res.status(503).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Fichier trop volumineux (limite : 10 Mo).' } });
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Champ de fichier inattendu (utiliser « file »).' } });
    return;
  }
  next(err);
});
