import { AiProvider, fetchJson } from './types';

export const geminiProvider: AiProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  keyEnv: 'GEMINI_API_KEY',
  defaultModel: 'gemini-1.5-flash',
  free: false,
  costPer1M: { in: 0.075, out: 0.3 },
  async call(input) {
    const contents = (input.history ?? []).map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }));
    contents.push({ role: 'user', parts: [{ text: input.user }] });
    const model = this.defaultModel;
    const data = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        String(process.env.GEMINI_API_KEY)
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents,
          generationConfig: { temperature: input.temperature ?? 0.4, maxOutputTokens: input.maxTokens ?? 2048 },
        }),
      },
      input.timeoutMs ?? 30000
    );
    const candidates = (data.candidates ?? []) as { content?: { parts?: { text?: string }[] } }[];
    const text = (candidates[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) throw new Error('gemini: réponse vide');
    const usage = (data.usageMetadata ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number };
    return { text, tokensIn: usage.promptTokenCount ?? 0, tokensOut: usage.candidatesTokenCount ?? 0, model };
  },
};
