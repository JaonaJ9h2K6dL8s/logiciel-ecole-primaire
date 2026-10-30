import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest, notFound, tooManyRequests, unauthorized, forbidden, AppError } from '../../shared/errors';
import { requireAuth } from '../../middleware/auth';
import { STUDENT_ZONE_COOKIE, parseStudentZoneCookie } from '../students-zone/student-session';
import { orchestrate, ROLE_LIMIT_TEACHER, ROLE_LIMIT_STUDENT, userDayRequests, ALL_PROVIDERS, hasEnvKey, DAILY_BUDGET_USD, isHealthy, PROVIDERS_BY_ID } from './orchestrator';
import { providerDayCost } from './usage';
import type { Level } from './classification';

export const aiOrchestratorRouter = Router();

/* ------------------------------------------------------------------ */
/* Identité : session élève (cookie student_zone) OU session prof      */
/* ------------------------------------------------------------------ */

export interface ChatIdentity {
  role: 'teacher' | 'student';
  userId?: number;
  username?: string;
  studentId?: number;
}

function studentCookie(req: Request): number | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === STUDENT_ZONE_COOKIE) {
      const payload = parseStudentZoneCookie(decodeURIComponent(rest.join('=')));
      return payload?.studentId ?? null;
    }
  }
  return null;
}

/** Middleware de session double : élève d'abord, sinon session prof requise. */
function requireChatIdentity(req: Request, res: Response, next: NextFunction): void {
  const studentId = studentCookie(req);
  if (studentId) {
    req.chatIdentity = { role: 'student', studentId };
    next();
    return;
  }
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!req.user) {
      next(unauthorized('Session absente ou expirée.'));
      return;
    }
    req.chatIdentity = { role: 'teacher', userId: req.user.id, username: req.user.username };
    next();
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      chatIdentity?: ChatIdentity;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function studentContext(studentId: number): Promise<{ className: string | null; level: Level; fullName: string }> {
  const [rows] = await getPool().query(
    `SELECT s.first_names, s.last_name, c.name AS class_name
     FROM students s
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
     LEFT JOIN classes c ON c.id = e.class_id
     WHERE s.id = ? LIMIT 1`,
    [studentId]
  );
  const row = (rows as { first_names: string; last_name: string; class_name: string | null }[])[0];
  if (!row) throw unauthorized('Élève inconnu.');
  const className = row.class_name;
  const m = className ? /\b(CE1|CE2|CM1|CM2)\b/i.exec(className) : null;
  return { className, level: (m ? (m[1].toUpperCase() as Level) : null), fullName: `${row.first_names} ${row.last_name}`.trim() };
}

function ownershipFilter(identity: ChatIdentity): { where: string; params: unknown[] } {
  return identity.role === 'teacher'
    ? { where: "role_context = 'teacher' AND user_id = ?", params: [identity.userId] }
    : { where: "role_context = 'student' AND student_id = ?", params: [identity.studentId] };
}

/* ------------------------------------------------------------------ */
/* Schémas                                                             */
/* ------------------------------------------------------------------ */

const chatSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  message: z.string().trim().min(1, 'Message vide.').max(8000),
});

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

const HISTORY_MAX_CHARS = 20000;

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

aiOrchestratorRouter.post(
  '/chat',
  requireChatIdentity,
  asyncHandler(async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Requête invalide.', parsed.error.flatten().fieldErrors);
    const { message } = parsed.data;
    const identity = req.chatIdentity!;

    // Quota quotidien par rôle (jamais par fournisseur : l'utilisateur ne choisit pas).
    const limit = identity.role === 'teacher' ? ROLE_LIMIT_TEACHER : ROLE_LIMIT_STUDENT;
    const used = await userDayRequests({ role: identity.role, userId: identity.userId, studentId: identity.studentId });
    if (used >= limit) {
      throw tooManyRequests(`Quota atteint (${limit} messages par jour). Réessaie demain.`);
    }

    // Conversation : existante (et à lui) ou nouvelle titrée par la question.
    let conversationId = parsed.data.conversationId ?? null;
    if (conversationId) {
      const own = ownershipFilter(identity);
      const [rows] = await getPool().query(`SELECT id FROM ai_conversations WHERE id = ? AND ${own.where}`, [conversationId, ...own.params]);
      if (!(rows as unknown[]).length) throw notFound('Conversation introuvable.');
    } else {
      const [result] = await getPool().query(
        'INSERT INTO ai_conversations (user_id, role_context, student_id, title) VALUES (?, ?, ?, ?)',
        [identity.role === 'teacher' ? identity.userId : null, identity.role, identity.role === 'student' ? identity.studentId : null, message.slice(0, 200)]
      );
      conversationId = (result as { insertId: number }).insertId;
    }

    // Historique persisté (budget en caractères, message courant jamais tronqué).
    const [histRows] = await getPool().query(
      'SELECT role, content FROM ai_messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY id DESC LIMIT 40',
      [conversationId]
    );
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    let chars = 0;
    for (const r of histRows as { role: string; content: string }[]) {
      if (chars + r.content.length > HISTORY_MAX_CHARS) break;
      chars += r.content.length;
      history.unshift({ role: r.role as 'user' | 'assistant', content: r.content });
    }

    const [insertUser] = await getPool().query('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, \'user\', ?)', [conversationId, message]);

    // Contexte pédagogique selon l'identité.
    let className: string | null = null;
    let level: Level = null;
    let studentName: string | null = null;
    if (identity.role === 'student') {
      const ctx = await studentContext(identity.studentId!);
      className = ctx.className;
      level = ctx.level;
      studentName = ctx.fullName;
    }

    const result = await orchestrate({
      message,
      history,
      context: { role: identity.role, className, studentName, level },
    });

    const [insertAssistant] = await getPool().query(
      `INSERT INTO ai_messages (conversation_id, role, content, provider, model, tokens_in, tokens_out, latency_ms)
       VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?)`,
      [conversationId, result.text, result.provider, result.model, result.tokensIn, result.tokensOut, result.latencyMs]
    );
    await getPool().query('UPDATE ai_conversations SET updated_at = NOW() WHERE id = ?', [conversationId]);

    // La réponse UI n'expose que le nom du fournisseur (pas de clé, pas de détail technique).
    res.json({
      conversationId,
      messageId: (insertAssistant as { insertId: number }).insertId,
      userMessageId: (insertUser as { insertId: number }).insertId,
      reply: result.text,
      provider: result.providerLabel,
      subject: result.classification.subject,
      level: result.classification.level,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

aiOrchestratorRouter.get(
  '/conversations',
  requireChatIdentity,
  asyncHandler(async (req, res) => {
    const own = ownershipFilter(req.chatIdentity!);
    const [rows] = await getPool().query(
      `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM ai_conversations WHERE ${own.where} ORDER BY updated_at DESC LIMIT 100`,
      own.params
    );
    res.json({ conversations: rows });
  })
);

aiOrchestratorRouter.post(
  '/conversations',
  requireChatIdentity,
  asyncHandler(async (req, res) => {
    const parsed = createConversationSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Titre invalide.', parsed.error.flatten().fieldErrors);
    const identity = req.chatIdentity!;
    const [result] = await getPool().query(
      'INSERT INTO ai_conversations (user_id, role_context, student_id, title) VALUES (?, ?, ?, ?)',
      [identity.role === 'teacher' ? identity.userId : null, identity.role, identity.role === 'student' ? identity.studentId : null, parsed.data.title ?? 'Conversation']
    );
    const id = (result as { insertId: number }).insertId;
    res.status(201).json({ conversation: { id, title: parsed.data.title ?? 'Conversation' } });
  })
);

aiOrchestratorRouter.get(
  '/conversations/:id(\\d+)/messages',
  requireChatIdentity,
  asyncHandler(async (req, res) => {
    const own = ownershipFilter(req.chatIdentity!);
    const [rows] = await getPool().query(
      `SELECT id, role, content, provider, model, created_at AS createdAt FROM ai_messages
       WHERE conversation_id = (SELECT id FROM ai_conversations WHERE id = ? AND ${own.where})
       ORDER BY id ASC LIMIT 500`,
      [Number(req.params.id), ...own.params]
    );
    if (!(rows as unknown[]).length) {
      // Isolation stricte : une conversation d'autrui = 404 (pas 403).
      const [exists] = await getPool().query(
        `SELECT id FROM ai_conversations WHERE id = ? AND ${ownershipFilter(req.chatIdentity!).where}`,
        [Number(req.params.id), ...ownershipFilter(req.chatIdentity!).params]
      );
      if (!(exists as unknown[]).length) throw notFound('Conversation introuvable.');
    }
    res.json({ messages: rows });
  })
);

aiOrchestratorRouter.delete(
  '/conversations/:id(\\d+)',
  requireChatIdentity,
  asyncHandler(async (req, res) => {
    const own = ownershipFilter(req.chatIdentity!);
    const [result] = await getPool().query(`DELETE FROM ai_conversations WHERE id = ? AND ${own.where}`, [Number(req.params.id), ...own.params]);
    if (!(result as { affectedRows: number }).affectedRows) throw notFound('Conversation introuvable.');
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Diagnostic (session prof) et usage (admin)                          */
/* ------------------------------------------------------------------ */

aiOrchestratorRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const providers = await Promise.all(
      ALL_PROVIDERS.map(async (p) => ({
        id: p.id,
        label: p.label,
        available: hasEnvKey(p) && isHealthy(p.id),
        hasKey: hasEnvKey(p),
        healthy: isHealthy(p.id),
        free: p.free,
        model: p.defaultModel,
        costPer1M: p.costPer1M,
        dayCost: p.free ? 0 : await providerDayCost(p.id),
      }))
    );
    res.json({ providers, dailyBudgetUsd: DAILY_BUDGET_USD });
  })
);

aiOrchestratorRouter.get(
  '/usage',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role_code !== 'admin') throw forbidden('Réservé à l’administration.');
    const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 90);
    const [totals] = await getPool().query(
      `SELECT provider, model, SUM(requests) AS requests, SUM(tokens_in) AS tokensIn, SUM(tokens_out) AS tokensOut,
              SUM(errors) AS errors, SUM(est_cost_usd) AS estCostUsd
       FROM ai_usage_daily
       WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY provider, model ORDER BY estCostUsd DESC, requests DESC`,
      [days]
    );
    const [byUser] = await getPool().query(
      `SELECT c.user_id AS userId, COUNT(*) AS requests
       FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE m.role = 'user' AND c.user_id IS NOT NULL AND DATE(m.created_at) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY c.user_id ORDER BY requests DESC LIMIT 50`,
      [days]
    );
    res.json({ days, totals, byUser, dailyBudgetUsd: DAILY_BUDGET_USD });
  })
);

// Erreurs spécifiques (routées par le gestionnaire global ; AppError est déjà
// traduit en JSON — rien à ajouter ici).
export function isProviderUnavailable(err: unknown): err is AppError {
  return err instanceof AppError && err.code === 'AI_NO_PROVIDER';
}

export { PROVIDERS_BY_ID };
