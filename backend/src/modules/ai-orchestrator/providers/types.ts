/**
 * Contrat commun des connecteurs IA de l'orchestrateur.
 *
 * Un fournisseur est décrit par des métadonnées statiques (id, clé d'env,
 * modèle par défaut, coûts par million de tokens) et une fonction call()
 * qui effectue l'appel réseau réel. Aucune simulation : en cas d'échec,
 * l'erreur est classée « définitive » (pas de fallback) ou « passagère »
 * (fallback vers le fournisseur suivant).
 */

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProviderCallInput {
  system: string;
  user: string;
  history?: HistoryTurn[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ProviderCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface AiProvider {
  id: string;
  label: string;
  /** Variable d'environnement portant la clé (null = aucun besoin de clé). */
  keyEnv: string | null;
  defaultModel: string;
  /** true = gratuit (local ou offre gratuite) : jamais compté dans le budget. */
  free: boolean;
  /** Coûts approximatifs USD par million de tokens (entrée / sortie). */
  costPer1M: { in: number; out: number };
  call(input: ProviderCallInput): Promise<ProviderCallResult>;
}

/** Erreur définitive (400/validation/contenu refusé) : renvoyée à l'utilisateur, PAS de fallback. */
export class ProviderDefinitiveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Erreur passagère (401/403/429/5xx/timeout/réseau) : fallback vers le fournisseur suivant. */
export class ProviderTransientError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function hasEnvKey(provider: AiProvider): boolean {
  return provider.keyEnv === null || Boolean(process.env[provider.keyEnv]);
}

/** fetch avec AbortController : timeout passager (→ fallback). */
export async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if (cause === 'ECONNREFUSED' || cause === 'ENOTFOUND' || cause === 'EACCES') {
      throw new ProviderTransientError(`Service injoignable (${cause}).`);
    }
    throw new ProviderTransientError('Fournisseur injoignable (réseau ou délai dépassé).');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // corps illisible
    }
    // 400/422 + filtres de contenu : définitifs. 401/403/429/5xx : passagers.
    if (res.status === 400 || res.status === 422) {
      throw new ProviderDefinitiveError(400, `Requête refusée par le fournisseur (HTTP ${res.status}). ${detail}`);
    }
    throw new ProviderTransientError(`HTTP ${res.status} du fournisseur. ${detail}`);
  }
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ProviderTransientError('Réponse illisible du fournisseur.');
  }
}

/** Appel au format OpenAI (partagé par openai/deepseek/mistral/qwen/groq/openrouter). */
export async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: ProviderCallInput,
  extraHeaders: Record<string, string> = {},
  extraBody: Record<string, unknown> = {}
): Promise<ProviderCallResult> {
  const messages: { role: string; content: string }[] = [{ role: 'system', content: input.system }];
  for (const t of input.history ?? []) messages.push({ role: t.role, content: t.content });
  messages.push({ role: 'user', content: input.user });
  const data = await fetchJson(
    `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify({
        model,
        messages,
        temperature: input.temperature ?? 0.4,
        max_tokens: input.maxTokens ?? 2048,
        ...extraBody,
      }),
    },
    input.timeoutMs ?? 30000
  );
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const text = choices?.[0]?.message?.content ?? '';
  if (!text) throw new ProviderTransientError('Réponse vide du fournisseur.');
  const usage = (data.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return { text, tokensIn: usage.prompt_tokens ?? 0, tokensOut: usage.completion_tokens ?? 0, model };
}
