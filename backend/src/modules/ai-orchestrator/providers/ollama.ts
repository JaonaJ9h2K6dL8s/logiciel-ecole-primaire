import { AiProvider, fetchJson } from './types';

const BASE_URL = process.env.AI_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

/**
 * Ollama local : gratuit, aucune clé, jamais compté dans le budget.
 * keep_alive 1 h : évite le rechargement du modèle (1-2 min) après une pause.
 */
export const ollamaProvider: AiProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  keyEnv: null,
  defaultModel: 'llama3.1:8b',
  free: true,
  costPer1M: { in: 0, out: 0 },
  async call(input) {
    const messages: { role: string; content: string }[] = [{ role: 'system', content: input.system }];
    for (const t of input.history ?? []) messages.push({ role: t.role, content: t.content });
    messages.push({ role: 'user', content: input.user });
    const model = this.defaultModel;
    const data = await fetchJson(
      `${BASE_URL.replace(/\/+$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          keep_alive: '1h',
          options: { temperature: input.temperature ?? 0.4, num_predict: input.maxTokens ?? 2048 },
          messages,
        }),
      },
      input.timeoutMs ?? 30000
    );
    const message = data.message as { content?: string } | undefined;
    const text = message?.content ?? '';
    if (!text) throw new Error('ollama: réponse vide');
    return {
      text,
      tokensIn: Number(data.prompt_eval_count ?? 0),
      tokensOut: Number(data.eval_count ?? 0),
      model,
    };
  },
};
