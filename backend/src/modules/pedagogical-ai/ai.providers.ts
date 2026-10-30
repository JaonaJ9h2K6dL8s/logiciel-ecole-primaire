import { getPool } from '../../database/pool';

/**
 * Couche fournisseur IA indépendante du vendeur.
 *
 * Configuration (priorité : base ai_config, sinon variables d'environnement) :
 * - AI_PROVIDER : none | openai | anthropic | ollama
 * - AI_MODEL : nom du modèle
 * - AI_BASE_URL : surcharge facultative (proxy d'établissement, Ollama local)
 * - AI_API_KEY : clé du fournisseur distant — UNIQUEMENT dans l'env serveur,
 *   jamais renvoyée au navigateur, jamais journalisée, jamais stockée en base.
 * - AI_TIMEOUT_MS : délai d'appel (défaut 60000)
 *
 * Aucune simulation : si aucun fournisseur n'est configuré ou joignable, le
 * service répond « indisponible » et l'API retourne 503 avec un message clair.
 */

export type AiProviderName = 'none' | 'openai' | 'anthropic' | 'ollama';

export interface AiConfig {
  provider: AiProviderName;
  model: string | null;
  baseUrl: string | null;
  apiKeyEnv: boolean; // une clé existe-t-elle dans l'environnement ?
  lastCheckOk: boolean | null;
  lastCheckAt: string | null;
  lastCheckMessage: string | null;
}

export interface AiCompletion {
  text: string;
  model: string | null;
  provider: AiProviderName;
}

export class AiUnavailableError extends Error {
  status = 503;
  code = 'AI_UNAVAILABLE';
  constructor(message: string) {
    super(message);
  }
}

interface DbAiConfigRow {
  provider: AiProviderName;
  model: string | null;
  base_url: string | null;
  last_check_ok: number | null;
  last_check_at: Date | null;
  last_check_message: string | null;
}

/** Configuration effective : base (non secrète) + clés d'environnement. */
export async function getAiConfig(): Promise<AiConfig> {
  const [rows] = await getPool().query('SELECT provider, model, base_url, last_check_ok, last_check_at, last_check_message FROM ai_config WHERE id = 1');
  const row = (rows as DbAiConfigRow[])[0];
  if (!row) throw new Error('ai_config absente (migration 023 manquante ?)');
  const envProvider = (process.env.AI_PROVIDER as AiProviderName | undefined) ?? 'none';
  const provider: AiProviderName = row.provider && row.provider !== 'none' ? row.provider : envProvider;
  return {
    provider,
    model: row.model ?? process.env.AI_MODEL ?? null,
    baseUrl: row.base_url ?? process.env.AI_BASE_URL ?? null,
    apiKeyEnv: Boolean(process.env.AI_API_KEY),
    lastCheckOk: row.last_check_ok === null ? null : Boolean(row.last_check_ok),
    lastCheckAt: row.last_check_at ? new Date(row.last_check_at).toISOString() : null,
    lastCheckMessage: row.last_check_message,
  };
}

function defaultBaseUrl(provider: AiProviderName): string {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'ollama':
      return 'http://127.0.0.1:11434';
    default:
      return '';
  }
}

function resolveUrl(cfg: AiConfig, path: string): string {
  const base = (cfg.baseUrl ?? defaultBaseUrl(cfg.provider)).replace(/\/+$/, '');
  return `${base}${path}`;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Appel chat selon le fournisseur. La clé API ne sort JAMAIS de cette couche
 * (elle n'est lue que depuis process.env et n'est pas journalisée).
 */
async function chatCompletion(cfg: AiConfig, systemPrompt: string, userPrompt: string, timeoutMs: number): Promise<AiCompletion> {
  try {
    return await doChatCompletion(cfg, systemPrompt, userPrompt, timeoutMs);
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    // Erreur réseau/abort : état indisponible explicite, jamais une erreur 500 brute.
    throw new AiUnavailableError('Fournisseur IA injoignable (erreur réseau ou délai dépassé). Vérifiez la configuration.');
  }
}

async function doChatCompletion(cfg: AiConfig, systemPrompt: string, userPrompt: string, timeoutMs: number): Promise<AiCompletion> {
  if (cfg.provider === 'none') {
    throw new AiUnavailableError(
      'Assistant IA non configuré. Demandez à l’administrateur de configurer un fournisseur (variables AI_* du serveur).'
    );
  }
  const model = cfg.model ?? '';
  if (!model) {
    throw new AiUnavailableError('Aucun modèle IA configuré (AI_MODEL).');
  }

  if (cfg.provider === 'openai') {
    if (!cfg.apiKeyEnv) throw new AiUnavailableError('Clé API absente (AI_API_KEY).');
    const res = await fetchWithTimeout(
      resolveUrl(cfg, '/chat/completions'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
        }),
      },
      timeoutMs
    );
    if (!res.ok) {
      throw new AiUnavailableError(`Fournisseur IA injoignable (HTTP ${res.status}). Vérifiez la configuration.`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new AiUnavailableError('Réponse vide du fournisseur IA.');
    return { text, model, provider: 'openai' };
  }

  if (cfg.provider === 'anthropic') {
    if (!cfg.apiKeyEnv) throw new AiUnavailableError('Clé API absente (AI_API_KEY).');
    const res = await fetchWithTimeout(
      resolveUrl(cfg, '/messages'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': String(process.env.AI_API_KEY),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.4,
        }),
      },
      timeoutMs
    );
    if (!res.ok) {
      throw new AiUnavailableError(`Fournisseur IA injoignable (HTTP ${res.status}). Vérifiez la configuration.`);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    if (!text) throw new AiUnavailableError('Réponse vide du fournisseur IA.');
    return { text, model, provider: 'anthropic' };
  }

  // ollama : modèle local — pas de clé nécessaire, test réel au moment de l'appel.
  let res: Response;
  try {
    res = await fetchWithTimeout(
      resolveUrl(cfg, '/api/chat'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          // Les prompts pédagogiques attendent un objet JSON ; Ollama sait
          // contraindre la sortie nativement (sinon le modèle 8B en texte
          // libre produit un JSON trop souvent malformé pour le parseur).
          format: 'json',
          options: { temperature: 0.4 },
          // Garder le modèle chargé 1 h après chaque appel : évite le
          // rechargement complet (1 à 2 min) après une pause d'inactivité.
          keep_alive: '1h',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      timeoutMs
    );
  } catch (err) {
    // Distinguer « moteur arrêté » d'un simple délai : message compréhensible.
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if (cause === 'ECONNREFUSED' || cause === 'ENOTFOUND' || cause === 'EACCES') {
      throw new AiUnavailableError(
        'Le moteur IA local (Ollama) est arrêté ou inaccessible. Demandez à l’administrateur de le démarrer sur le serveur.'
      );
    }
    throw err;
  }
  if (res.status === 404) {
    // Ollama renvoie 404 quand le modèle demandé n'est pas installé.
    throw new AiUnavailableError(
      `Le modèle « ${model} » n’est pas installé dans Ollama. Demandez à l’administrateur de le télécharger (ollama pull ${model}).`
    );
  }
  if (!res.ok) {
    throw new AiUnavailableError(`Moteur local Ollama injoignable (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content ?? '';
  if (!text) throw new AiUnavailableError('Réponse vide du moteur local.');
  return { text, model, provider: 'ollama' };
}

export interface OllamaStatus {
  /** Ollama répond-il sur son adresse ? */
  reachable: boolean;
  /** Le modèle configuré est-il présent dans la liste installée ? */
  modelInstalled: boolean | null;
  /** Modèles installés (noms courts, sans secret). */
  models: string[];
  /** Message utilisateur compréhensible. */
  message: string;
}

/**
 * Vérification LÉGÈRE du moteur local : liste des modèles installés via
 * /api/tags. Distinct d'un test de génération (POST /config/check) : ici
 * aucune génération n'est lancée, aucun coût, réponse rapide.
 */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  const cfg = await getAiConfig();
  const timeoutMs = Math.min(Number(process.env.AI_TIMEOUT_MS ?? 60000), 8000);
  const base = (cfg.baseUrl ?? defaultBaseUrl('ollama')).replace(/\/+$/, '');
  if (cfg.provider !== 'ollama') {
    return { reachable: false, modelInstalled: null, models: [], message: 'Le moteur local Ollama n’est pas le fournisseur actif.' };
  }
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, { method: 'GET' }, timeoutMs);
    if (!res.ok) {
      return { reachable: true, modelInstalled: null, models: [], message: `Ollama a répondu avec une erreur (HTTP ${res.status}).` };
    }
    const data = (await res.json()) as { models?: { name?: string; model?: string }[] };
    const models = (data.models ?? [])
      .map((m) => m.name ?? m.model ?? '')
      .filter(Boolean)
      .map((n) => n.replace(/:latest$/, ''));
    const model = cfg.model ?? '';
    const modelInstalled = model ? models.some((n) => n === model || n.startsWith(`${model}:`)) : null;
    const message = modelInstalled
      ? `Modèle « ${model} » installé et prêt.`
      : model
        ? 'Ollama est accessible mais le modèle configuré n’est pas installé.'
        : 'Ollama est accessible mais aucun modèle n’est configuré.';
    return { reachable: true, modelInstalled, models, message };
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if (cause === 'ECONNREFUSED' || cause === 'ENOTFOUND' || cause === 'EACCES') {
      return { reachable: false, modelInstalled: null, models: [], message: 'Ollama est arrêté ou inaccessible (service local non démarré).' };
    }
    return { reachable: false, modelInstalled: null, models: [], message: 'Ollama injoignable (erreur réseau ou délai dépassé).' };
  }
}

/**
 * Test de disponibilité RÉEL : petit appel chat (budget minimal).
 * Met à jour ai_config (résultat, jamais de secret) et renvoie l'état.
 */
export async function checkAiAvailability(userId: number): Promise<{ ok: boolean; message: string }> {
  const cfg = await getAiConfig();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 60000);
  let ok = false;
  let message: string;
  try {
    const res = await chatCompletion(cfg, 'Tu es un test de connectivité. Réponds uniquement par : OK', 'Réponds : OK', timeoutMs);
    ok = /ok/i.test(res.text.slice(0, 20));
    message = ok ? 'Connexion vérifiée.' : 'Réponse inattendue du modèle.';
  } catch (err) {
    message = err instanceof Error ? err.message : 'Échec du contrôle de connexion.';
  }
  await getPool().query('UPDATE ai_config SET last_check_ok = ?, last_check_at = NOW(), last_check_message = ?, updated_by = ? WHERE id = 1', [
    ok ? 1 : 0,
    message.slice(0, 300),
    userId,
  ]);
  return { ok, message };
}

/** Génération brute : renvoie le texte du modèle. */
export async function generateRaw(systemPrompt: string, userPrompt: string): Promise<AiCompletion> {
  const cfg = await getAiConfig();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 60000);
  return chatCompletion(cfg, systemPrompt, userPrompt, timeoutMs);
}

// ======================= CONVERSATION LIBRE =======================

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function assertProviderReady(cfg: AiConfig): string {
  if (cfg.provider === 'none') {
    throw new AiUnavailableError(
      'Assistant IA non configuré. Demandez à l’administrateur de configurer un fournisseur (variables AI_* du serveur).'
    );
  }
  const model = cfg.model ?? '';
  if (!model) throw new AiUnavailableError('Aucun modèle IA configuré (AI_MODEL).');
  return model;
}

function mapNetworkError(err: unknown): never {
  const cause = (err as { cause?: { code?: string } }).cause?.code;
  if (cause === 'ECONNREFUSED' || cause === 'ENOTFOUND' || cause === 'EACCES') {
    throw new AiUnavailableError(
      'Le moteur IA local (Ollama) est arrêté ou inaccessible. Demandez à l’administrateur de le démarrer sur le serveur.'
    );
  }
  throw new AiUnavailableError('Fournisseur IA injoignable (erreur réseau ou délai dépassé). Vérifiez la configuration.');
}

/**
 * Conversation multi-tours : l'historique complet est transmis au modèle et la
 * sortie reste en texte libre (PAS de format:'json' — contrairement aux
 * générations structurées, ici le professeur attend une réponse rédigée).
 */
async function doChatMessagesCompletion(cfg: AiConfig, messages: ChatTurn[], timeoutMs: number): Promise<AiCompletion> {
  const model = assertProviderReady(cfg);

  if (cfg.provider === 'ollama') {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        resolveUrl(cfg, '/api/chat'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, options: { temperature: 0.4 }, keep_alive: '1h', messages }),
        },
        timeoutMs
      );
    } catch (err) {
      mapNetworkError(err);
    }
    if (res.status === 404) {
      throw new AiUnavailableError(
        `Le modèle « ${model} » n’est pas installé dans Ollama. Demandez à l’administrateur de le télécharger (ollama pull ${model}).`
      );
    }
    if (!res.ok) throw new AiUnavailableError(`Moteur local Ollama injoignable (HTTP ${res.status}).`);
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content ?? '';
    if (!text) throw new AiUnavailableError('Réponse vide du moteur local.');
    return { text, model, provider: 'ollama' };
  }

  if (cfg.provider === 'openai') {
    if (!cfg.apiKeyEnv) throw new AiUnavailableError('Clé API absente (AI_API_KEY).');
    const res = await fetchWithTimeout(
      resolveUrl(cfg, '/chat/completions'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({ model, messages, temperature: 0.4 }),
      },
      timeoutMs
    );
    if (!res.ok) throw new AiUnavailableError(`Fournisseur IA injoignable (HTTP ${res.status}). Vérifiez la configuration.`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new AiUnavailableError('Réponse vide du fournisseur IA.');
    return { text, model, provider: 'openai' };
  }

  // anthropic : le prompt système est transmis hors de la liste de messages,
  // qui doit débuter par un message utilisateur.
  if (!cfg.apiKeyEnv) throw new AiUnavailableError('Clé API absente (AI_API_KEY).');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  if (!turns.length || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: 'Bonjour' });
  }
  const res = await fetchWithTimeout(
    resolveUrl(cfg, '/messages'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': String(process.env.AI_API_KEY),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 4096, system, messages: turns, temperature: 0.4 }),
    },
    timeoutMs
  );
  if (!res.ok) throw new AiUnavailableError(`Fournisseur IA injoignable (HTTP ${res.status}). Vérifiez la configuration.`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  if (!text) throw new AiUnavailableError('Réponse vide du fournisseur IA.');
  return { text, model, provider: 'anthropic' };
}

/**
 * Conversation libre (assistant pédagogique) : renvoie la réponse du modèle
 * au fil complet. Aucune persistance côté serveur ; la confidentialité reste
 * locale (Ollama) selon la configuration active.
 */
export async function generateChatCompletion(messages: ChatTurn[]): Promise<AiCompletion> {
  const cfg = await getAiConfig();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 60000);
  try {
    return await doChatMessagesCompletion(cfg, messages, timeoutMs);
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    mapNetworkError(err);
  }
}
