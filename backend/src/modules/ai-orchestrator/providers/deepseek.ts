import { AiProvider } from './types';
import { callOpenAiCompatible } from './types';

export const deepseekProvider: AiProvider = {
  id: 'deepseek',
  label: 'DeepSeek',
  keyEnv: 'DEEPSEEK_API_KEY',
  defaultModel: 'deepseek-chat',
  free: false,
  costPer1M: { in: 0.14, out: 0.28 },
  call(input) {
    const key = process.env.DEEPSEEK_API_KEY as string;
    return callOpenAiCompatible('https://api.deepseek.com', key, this.defaultModel, input);
  },
};
