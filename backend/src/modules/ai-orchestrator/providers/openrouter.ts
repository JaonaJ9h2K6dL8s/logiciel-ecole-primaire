import { AiProvider } from './types';
import { callOpenAiCompatible } from './types';

export const openrouterProvider: AiProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  keyEnv: 'OPENROUTER_API_KEY',
  defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
  free: true, // modèle :free — coût réel nul ; compté à 0 dans le budget.
  costPer1M: { in: 0, out: 0 },
  call(input) {
    const key = process.env.OPENROUTER_API_KEY as string;
    return callOpenAiCompatible('https://openrouter.ai/api/v1', key, this.defaultModel, input, {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Scolaire Madagascar',
    });
  },
};
