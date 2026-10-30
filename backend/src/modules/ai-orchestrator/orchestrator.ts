import { getPool } from '../../database/pool';
import { AppError } from '../../shared/errors';
import { ALL_PROVIDERS, PROVIDERS_BY_ID, hasEnvKey } from './providers';
import type { AiProvider } from './providers';
import { ProviderDefinitiveError, ProviderTransientError } from './providers/types';
import { classify, routeCategory, type Classification, type Level } from './classification';
import { buildSystemPrompt, type PromptContext } from './system-prompt';

/* ------------------------------------------------------------------ */
/* Règles de routage (constante code, documentée)                      */
/* ------------------------------------------------------------------ */
/**
 * ROUTING_RULES — ordre de préférence par catégorie de demande.
 * L'admin/prof ne choisit JAMAIS le fournisseur : le premier disponible
 * (clé présente + budget OK + santé OK) dans la liste répond ; en cas
 * d'erreur passagère, on passe au suivant (fallback).
 * - math       : raisonnement/logique → DeepSeek d'abord (fort en maths, économique)
 * - francais   : rédaction/langue → Anthropic d'abord (qualité rédactionnelle)
 * - analyse    : sciences/histoire-geo/documents → Gemini d'abord (contexte long)
 * - exercices  : génération d'énoncés → OpenAI d'abord (fiabilité format)
 * - simple     : question courte → Groq d'abord (latence minimale)
 * - defaut     : tout le reste, équilibre coût/qualité
 * Ollama est toujours en fin de liste : gratuit, local, dernier recours.
 */
const ROUTING_RULES: Record<string, string[]> = {
  math: ['deepseek', 'openai', 'qwen', 'groq', 'ollama'],
  francais: ['anthropic', 'mistral', 'openai', 'ollama'],
  analyse: ['gemini', 'openai', 'anthropic', 'ollama'],
  exercices: ['openai', 'qwen', 'mistral', 'ollama'],
  simple: ['groq', 'deepseek', 'ollama'],
  defaut: ['groq', 'openai', 'deepseek', 'ollama'],
};

/* ------------------------------------------------------------------ */
/* Configuration budgets / quotas                                      */
/* ------------------------------------------------------------------ */
const DAILY_BUDGET_USD = Number(process.env.AI_DAILY_BUDGET_USD ?? 2.0);
const ROLE_LIMIT_TEACHER = Number(process.env.AI_ROLE_DAILY_LIMIT_TEACHER ?? process.env.AI_ROLE_DAILY_LIMIT_REQUESTS ?? 100);
const ROLE_LIMIT_STUDENT = Number(process.env.AI_ROLE_DAILY_LIMIT_STUDENT ?? 30);
const TIMEOUT_MS = 30000;
/** Après 2 échecs consécutifs, un fournisseur est mis à l'écart 60 s. */
const UNAVAILABLE_AFTER_FAILS = 2;
const UNAVAILABLE_MS = 60000;

/* ------------------------------------------------------------------ */
/* Santé mémoire (cache process-local)                                 */
/* ------------------------------------------------------------------ */
const health = new Map<string, { consecutiveFails: number; until: number }>();

function isHealthy(id: string): boolean {
  const h = health.get(id);
  return !h || h.until <= Date.now();
}

function recordFailure(id: string): void {
  const h = health.get(id) ?? { consecutiveFails: 0, until: 0 };
  h.consecutiveFails += 1;
  if (h.consecutiveFails >= UNAVAILABLE_AFTER_FAILS) h.until = Date.now() + UNAVAILABLE_MS;
  health.set(id, h);
}

function recordSuccess(id: string): void {
  health.set(id, { consecutiveFails: 0, until: 0 });
}

/* ------------------------------------------------------------------ */
/* Budgets et quotas (base ai_usage_daily / ai_messages)               */
/* ------------------------------------------------------------------ */

/** Coût estimé du jour pour un fournisseur (USD). Ollama/gratuit → 0. */
async function providerDayCost(provider: string): Promise<number> {
  const [rows] = await getPool().query(
    'SELECT est_cost_usd, requests FROM ai_usage_daily WHERE day = CURDATE() AND provider = ?',
    [provider]
  );
  const row = (rows as { est_cost_usd: number; requests: number }[])[0];
  if (!row) return 0;
  // Le coût stocké est cumulatif : on renvoie la valeur du jour directement.
  return Number(row.est_cost_usd) ?? 0;
}

/** Nombre de messages utilisateur du jour pour un utilisateur prof ou un élève. */
async function userDayRequests(identity: { role: 'teacher' | 'student'; userId?: number; studentId?: number }): Promise<number> {
  const sql =
    identity.role === 'teacher'
      ? `SELECT COUNT(*) AS n FROM ai_messages m
         JOIN ai_conversations c ON c.id = m.conversation_id
         WHERE m.role = 'user' AND c.role_context = 'teacher' AND c.user_id = ? AND DATE(m.created_at) = CURDATE()`
      : `SELECT COUNT(*) AS n FROM ai_messages m
         JOIN ai_conversations c ON c.id = m.conversation_id
         WHERE m.role = 'user' AND c.role_context = 'student' AND c.student_id = ? AND DATE(m.created_at) = CURDATE()`;
  const [rows] = await getPool().query(sql, [identity.role === 'teacher' ? identity.userId : identity.studentId]);
  return Number((rows as { n: number }[])[0]?.n ?? 0);
}

async function bumpUsage(provider: string, model: string, field: 'requests' | 'errors', tokensIn: number, tokensOut: number, cost: number): Promise<void> {
  await getPool().query(
    `INSERT INTO ai_usage_daily (day, provider, model, requests, tokens_in, tokens_out, errors, est_cost_usd)
     VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       requests = requests + VALUES(requests),
       tokens_in = tokens_in + VALUES(tokens_in),
       tokens_out = tokens_out + VALUES(tokens_out),
       errors = errors + VALUES(errors),
       est_cost_usd = est_cost_usd + VALUES(est_cost_usd)`,
    [provider, model, field === 'requests' ? 1 : 0, tokensIn, tokensOut, field === 'errors' ? 1 : 0, cost]
  );
}

function estimateCost(p: AiProvider, tokensIn: number, tokensOut: number): number {
  if (p.free) return 0;
  return (tokensIn / 1e6) * p.costPer1M.in + (tokensOut / 1e6) * p.costPer1M.out;
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface OrchestrationRequest {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  context: Omit<PromptContext, 'subject' | 'level'> & { level?: Level };
}

export interface OrchestrationResult {
  text: string;
  provider: string;
  providerLabel: string;
  model: string;
  classification: Classification;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

/**
 * Point d'entrée : classification → règles → filtrage → appel avec fallback.
 * - Erreur définitive (400/validation/contenu) : renvoyée telle quelle.
 * - Erreur passagère : fournisseur suivant ; si plus aucun → 503 AI_NO_PROVIDER.
 */
export async function orchestrate(req: OrchestrationRequest): Promise<OrchestrationResult> {
  const classification = classify(req.message);
  const category = routeCategory(classification, req.message);
  const order = ROUTING_RULES[category] ?? ROUTING_RULES.defaut;

  const candidates: AiProvider[] = [];
  for (const id of order) {
    const p = PROVIDERS_BY_ID.get(id);
    if (!p || !hasEnvKey(p)) continue; // pas de clé → filtré, jamais d'erreur à l'appel
    if (!isHealthy(id)) continue; // mis à l'écart après échecs répétés
    // Budget : un fournisseur non gratuit au-delà du budget du jour est écarté.
    if (!p.free && (await providerDayCost(id)) >= DAILY_BUDGET_USD) continue;
    candidates.push(p);
  }
  if (candidates.length === 0) {
    throw new AppError(503, 'AI_NO_PROVIDER', 'Aucun fournisseur IA disponible pour le moment. Réessaie plus tard.');
  }

  const system = buildSystemPrompt({
    role: req.context.role,
    level: req.context.level ?? classification.level,
    subject: classification.subject,
    className: req.context.className,
    studentName: req.context.studentName,
  });
  // Demande complexe : on laisse plus de place à la réponse.
  const maxTokens = classification.complexity === 'complexe' ? 3000 : 1800;

  const attempts = candidates.length;
  for (let i = 0; i < attempts; i += 1) {
    const p = candidates[i];
    const started = Date.now();
    try {
      const result = await p.call({
        system,
        user: req.message,
        history: req.history,
        maxTokens,
        temperature: 0.4,
        // Génération locale plus lente (rechargement du modèle : 1-2 min au
        // démarrage à froid) : Ollama dispose de 180 s, les clouds de 30 s.
        timeoutMs: p.id === 'ollama' ? 180000 : TIMEOUT_MS,
      });
      recordSuccess(p.id);
      const cost = estimateCost(p, result.tokensIn, result.tokensOut);
      // Traçabilité : chaque appel consommé est journalisé (jamais re-facturé :
      // un appel qui a répondu est compté une seule fois, ici).
      await bumpUsage(p.id, result.model, 'requests', result.tokensIn, result.tokensOut, cost);
      return {
        text: result.text,
        provider: p.id,
        providerLabel: p.label,
        model: result.model,
        classification,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      if (err instanceof ProviderDefinitiveError) {
        // Pas de fallback : la demande elle-même est refusée (validation, contenu).
        throw new AppError(err.status, 'AI_REQUEST_REJECTED', err.message);
      }
      // Erreur passagère : log d'usage (erreur consommée) puis fournisseur suivant.
      recordFailure(p.id);
      try {
        await bumpUsage(p.id, p.defaultModel, 'errors', 0, 0, 0);
      } catch {
        // le suivi d'erreur ne doit jamais masquer l'erreur réelle
      }
      console.warn(`[ai-orchestrator] ${p.id} échec après ${latencyMs} ms : ${(err as Error).message}`);
      if (i === attempts - 1) break;
    }
  }
  throw new AppError(503, 'AI_NO_PROVIDER', 'Aucun fournisseur IA disponible pour le moment. Réessaie plus tard.');
}

export { classify, ROLE_LIMIT_TEACHER, ROLE_LIMIT_STUDENT, DAILY_BUDGET_USD, isHealthy, userDayRequests, ALL_PROVIDERS, PROVIDERS_BY_ID, hasEnvKey };
