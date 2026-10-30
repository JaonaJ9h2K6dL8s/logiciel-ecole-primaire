import { AiProvider } from './types';
import { callOpenAiCompatible } from './types';

export const mistralProvider: AiProvider = {
  id: 'mistral',
  label: 'Mistral',
  keyEnv: 'MISTRAL_API_KEY',
  defaultModel: 'mistral-small-latest',
  free: false,
  costPer1M: { in: 0.2, out: 0.6 },
  call(input) {
    const key = process.env.MISTRAL_API_KEY as string;
    return callOpenAiCompatible('https://api.mistral.ai/v1', key, this.defaultModel, input);
  },
};
