import { AiProvider, fetchJson } from './types';

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  keyEnv: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-3-5-haiku-20241022',
  free: false,
  costPer1M: { in: 0.8, out: 4 },
  async call(input) {
    const messages = (input.history ?? []).map((t) => ({ role: t.role, content: t.content }));
    messages.push({ role: 'user', content: input.user });
    const data = await fetchJson(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': String(process.env.ANTHROPIC_API_KEY),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          system: input.system,
          messages,
          temperature: input.temperature ?? 0.4,
          max_tokens: input.maxTokens ?? 2048,
        }),
      },
      input.timeoutMs ?? 30000
    );
    const content = (data.content ?? []) as { type: string; text?: string }[];
    const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    if (!text) throw new Error('anthropic: réponse vide');
    const usage = (data.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    return { text, tokensIn: usage.input_tokens ?? 0, tokensOut: usage.output_tokens ?? 0, model: this.defaultModel };
  },
};
