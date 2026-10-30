import { AiProvider } from './types';
import { callOpenAiCompatible } from './types';

export const groqProvider: AiProvider = {
  id: 'groq',
  label: 'Groq',
  keyEnv: 'GROQ_API_KEY',
  defaultModel: 'llama-3.1-8b-instant',
  free: false,
  costPer1M: { in: 0.05, out: 0.08 },
  call(input) {
    const key = process.env.GROQ_API_KEY as string;
    return callOpenAiCompatible('https://api.groq.com/openai/v1', key, this.defaultModel, input);
  },
};
