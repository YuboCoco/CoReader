import { analysisBudget, readAnalysisMarkdown } from './paper-analysis.js';
import { analyzeFigure, analyzePaper, resolveReferenceBatch, referenceFields, referenceWindow } from './research.mjs';
import { makeMessages } from './model.mjs';

const limitByAction = { '/translate': 6000, '/term': 200, '/formula': 4000, '/summary': 12000000 };
const formulaPrompt = '结合提供的英文论文文字，用简体中文解释公式的含义、符号、论文中的作用和实现要点。用 Markdown 与 LaTeX。区分已知与推测，不猜测未说明的符号。';

function string(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
export async function runReaderRequest(path, body, signal, { modelCall, modelInfo, metadata, openAlexKey }) {
  if (path === '/references/resolve') {
    return { ok: true, results: await resolveReferenceBatch(body.entries, signal, openAlexKey, modelCall) };
  }
  if (path === '/references/fields') {
    return { ok: true, fields: await referenceFields(modelCall, body.entries, signal) };
  }
  if (path === '/references/segment') {
    return { ok: true, ...await referenceWindow(modelCall, body, signal) };
  }
  if (path === '/figure') {
    if (!Number.isSafeInteger(body.page) || body.page < 1 || body.page > 20000
      || typeof body.image !== 'string' || body.image.length > 4000000
      || !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(body.image)) {
      return { ok: false, code: 'figure-image' };
    }
    const text = await analyzeFigure(modelCall, {
      ...body, context: [string(body.caption, 900), string(body.context, 1600)].filter(Boolean).join('\n'),
    }, signal);
    return { ok: true, text: readAnalysisMarkdown(text.text), ...metadata() };
  }
  if (path === '/summary') {
    if (typeof body.text !== 'string' || body.text.length > limitByAction[path]
      || (body.pageTextLengths && (!Array.isArray(body.pageTextLengths) || body.pageTextLengths.length > 20000))) {
      throw new Error('论文文字超出可分析的范围。');
    }
    return { ok: true, format: 'detailed-markdown',
      ...await analyzePaper(modelCall, modelInfo, body, signal, () => {}), ...metadata() };
  }

  const selected = string(body[path === '/translate' ? 'text' : path === '/term' ? 'term' : 'formula'], limitByAction[path]);
  if (!selected) throw new Error('请在文中选中内容。');
  const context = string(body.surrounding || body.context, path === '/term' ? 3600 : 2400);
  if (path === '/formula') {
    return { ok: true, text: await modelCall(formulaPrompt, selected + (context ? '\n\n上下文：\n' + context : ''),
      { signal, maxTokens: Math.min(8192, analysisBudget(modelInfo).maxTokens) }), ...metadata?.() };
  }
  const [system, user] = makeMessages(path === '/term' ? 'term' : 'translation', selected, context);
  const text = await modelCall(system.content, user.content, { signal, maxTokens: 8192 });
  return { ok: true, text, ...(path === '/term' ? { term: selected } : {}) };
}
