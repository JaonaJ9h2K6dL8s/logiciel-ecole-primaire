import { AiProvider } from './types';
import { callOpenAiCompatible } from './types';

export const qwenProvider: AiProvider = {
  id: 'qwen',
  label: 'Qwen (DashScope)',
  keyEnv: 'QWEN_API_KEY',
  defaultModel: 'qwen-plus',
  free: false,
  costPer1M: { in: 0.4, out: 1.2 },
  call(input) {
    const key = process.env.QWEN_API_KEY as string;
    return callOpenAiCompatible('https://dashscope.aliyuncs.com/compatible-intl/v1', key, this.defaultModel, input);
  },
};
