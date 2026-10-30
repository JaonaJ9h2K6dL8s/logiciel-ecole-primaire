import { AiProvider, hasEnvKey } from './types';
import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import { deepseekProvider } from './deepseek';
import { mistralProvider } from './mistral';
import { qwenProvider } from './qwen';
import { groqProvider } from './groq';
import { openrouterProvider } from './openrouter';
import { ollamaProvider } from './ollama';

/** Ordre d'enregistrement sans incidence : le routage définit l'ordre d'appel. */
export const ALL_PROVIDERS: AiProvider[] = [
  openaiProvider,
  anthropicProvider,
  geminiProvider,
  deepseekProvider,
  mistralProvider,
  qwenProvider,
  groqProvider,
  openrouterProvider,
  ollamaProvider,
];

export const PROVIDERS_BY_ID = new Map(ALL_PROVIDERS.map((p) => [p.id, p]));

export function providerAvailable(id: string): boolean {
  const p = PROVIDERS_BY_ID.get(id);
  return Boolean(p && hasEnvKey(p));
}

export { hasEnvKey };
export type { AiProvider } from './types';
