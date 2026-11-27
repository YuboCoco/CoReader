export const connectionNames = {
  chatgpt: 'ChatGPT', deepseek: 'DeepSeek', kimi: 'Kimi', glm: 'GLM', claude: 'Claude', workbuddy: 'WorkBuddy', doubao: '火山方舟', 'kimi-code': 'Kimi Code', compatible: '自定义 API',
};

export const defaultLocalTranslationModel = 'hy-mt2-1.8b';
export const localTranslationModels = {
  'hy-mt2-1.8b': {
    label: 'Hy-MT2-1.8B', weights: 'Hy-MT2-1.8B-Q4_K_M.gguf', license: 'Hy-MT2-LICENSE.txt',
  },
  'haidass-translate-143m': {
    label: 'Haidass-Translate-143M', weights: 'haidass-translate-143m-q8_0.gguf', license: 'Haidass-LICENSE.txt',
  },
};

export const claudeVersion = '2026-10-21';

export const effortLabels = {
  default: '服务商默认', none: '关闭推理', minimal: '极低', low: '低', medium: '中',
  high: '高', xhigh: '极高', max: '最高', ultra: 'Ultra',
};

const deepseek = ['none', 'low', 'high', 'max'];
const kimi = ['low', 'high', 'max'];
const openai = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const cli = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const openaiCore = ['low', 'medium', 'high', 'xhigh'];
const glm = ['low', 'high', 'max'];
const claude = ['low', 'medium', 'high', 'xhigh', 'max'];

const providerChoices = { codex: cli, workbuddy: cli, 'kimi-code': Object.keys(effortLabels).slice(1), openai, chatgpt: openai, deepseek, kimi, glm, claude,
  compatible: Object.keys(effortLabels).slice(1) };

export function providerEfforts(provider) {
  return Object.hasOwn(providerChoices, provider) ? providerChoices[provider] : [];
}

export function documentedEfforts(provider, model = '') {
  if (provider === 'deepseek') {
    if (/^(?:deepseek-flash|deepseek-v4-(?:flash|pro)|deepseek-v4\.1-flash)(?:-vision-exp)?$/.test(model)) return deepseek;
    return null;
  }
  if (provider === 'kimi-code') return [];
  if (provider === 'kimi') return /^kimi-k3(?:\.1-pro(?:-highspeed)?)?$/.test(model) ? kimi : null;
  if (provider === 'glm') return /^glm-5\.3(?:-flashx?)?$/.test(model) ? glm : [];
  if (provider === 'claude') return [];
  if (provider !== 'openai' && provider !== 'chatgpt') return null;
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  if (/^gpt-6\.2-(?:astra|sol)$/.test(base)) return [...openaiCore, 'max'];
  if (/^gpt-(?:6-astra|6\.1-sol)$/.test(base)) return [...openaiCore, 'max'];
  if (/^gpt-(?:6-sol|5\.6-sol)$/.test(base)) return ['none', ...openaiCore, 'max'];
  if (/^gpt-5\.(?:4(?:-mini|-nano)?|5|2)$/.test(base)) return ['none', ...openaiCore];
  if (base === 'gpt-5.1') return ['none', 'low', 'medium', 'high'];
  if (/^gpt-5(?:-(?:mini|nano))?$/.test(base)) return ['minimal', 'low', 'medium', 'high'];
  if (/^gpt-4(?:\.1|o)(?:-(?:mini|nano))?$/.test(base)) return [];
  return null;
}

export function advertisedEfforts(value, provider) {
  if (!Array.isArray(value)) return null;
  const allowed = providerEfforts(provider);
  const names = new Set(value.map((entry) => typeof entry === 'string' ? entry : entry?.reasoningEffort ?? entry?.effort));
  const choices = allowed.filter((item) => names.has(item));
  return choices.length || value.length === 0 ? choices : null;
}

export function availableEfforts(provider, model, entry) {
  const fromService = advertisedEfforts(entry?.efforts, provider);
  if (fromService !== null) return { ids: fromService, source: 'service', defaultId: fromService.includes(entry.defaultEffort) ? entry.defaultEffort : '' };
  const documented = documentedEfforts(provider, model);
  if (documented !== null) return { ids: documented, source: 'docs', defaultId: '' };
  return { ids: providerEfforts(provider), source: 'manual', defaultId: '' };
}

export function mergeModelOptions(profile, found = []) {
  const current = found.find((item) => item.id === profile.model);
  const models = found.filter((item) => item !== current);
  if (!profile.model) return models;
  const cliDefault = ['codex', 'workbuddy'].includes(profile.provider) && profile.model === 'default'
    ? found.find((item) => item.isDefault) : null;
  const label = cliDefault ? 'CLI 默认模型（' + cliDefault.id + '）' : profile.label || profile.model;
  return [current || { ...cliDefault, id: profile.model, label }, ...models];
}
