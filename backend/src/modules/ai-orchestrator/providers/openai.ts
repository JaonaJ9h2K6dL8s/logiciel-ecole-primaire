import { AiProvider } from './types';
import { callOpenAiCompatible } from './types';

export const openaiProvider: AiProvider = {
  id: 'openai',
  label: 'OpenAI',
  keyEnv: 'OPENAI_API_KEY',
  defaultModel: 'gpt-4o-mini',
  free: false,
  costPer1M: { in: 0.15, out: 0.6 },
  call(input) {
    const key = process.env.OPENAI_API_KEY as string;
    return callOpenAiCompatible('https://api.openai.com/v1', key, this.defaultModel, input);
  },
};
