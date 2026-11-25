import React, { useState } from 'react';
import { availableEfforts, connectionNames, defaultLocalTranslationModel, effortLabels, localTranslationModels } from '../model-capabilities.mjs';

const api = window.reader;
const localTranslation = 'local';
const followQuestion = 'configured';
const modelKey = (selection) => selection?.model ? selection.provider + ':' + selection.model : '';
const labelOf = (item) => item.label === item.id ? item.id : item.label + ' · ' + item.id;
const localOptions = new Map(Object.keys(localTranslationModels).map((id) =>
  [id === defaultLocalTranslationModel ? localTranslation : localTranslation + ':' + id, id]));

function ConnectedOptions({ connections }) {
  return Object.entries(connectionNames).map(([provider, name]) => {
    const models = connections[provider]?.models;
    return models?.length ? <optgroup key={provider} label={name}>
      {models.map((item) => <option key={item.id} value={provider + ':' + item.id}>{labelOf(item)}</option>)}
    </optgroup> : null;
  });
}

function taskModel(connections, selection) {
  const models = connections[selection?.provider]?.models || [];
  return models.find((item) => item.id === selection?.model)
    || (selection?.provider === 'workbuddy' && selection.model === 'default' ? models.find((item) => item.isDefault) : null);
}

function fromOption(connections, key) {
  const separator = key.indexOf(':');
  if (separator === -1) return null;
  const provider = key.slice(0, separator);
  const model = key.slice(separator + 1);
  const entry = taskModel(connections, { provider, model });
  return entry ? { provider, model, effort: 'default', contextWindow: entry.contextWindow || '', images: 'auto' } : null;
}

function EffortSelect({ name, selection, entry, onChange }) {
  const efforts = availableEfforts(selection?.provider, entry?.id, entry);
  return <select aria-label={name} disabled={!entry} value={efforts.ids.includes(selection?.effort) ? selection.effort : 'default'}
    onChange={(event) => onChange({ ...selection, effort: event.target.value })}>
    <option value="default">{efforts.defaultId ? '默认（' + effortLabels[efforts.defaultId] + '）' : effortLabels.default}</option>
    {efforts.ids.map((id) => <option key={id} value={id}>{effortLabels[id]}</option>)}
  </select>;
}

export function ModelSettings({ value, connections, updating, onSave }) {
  const [question, setQuestion] = useState(value.model ? value : null);
  const [translation, setTranslation] = useState(value.translation);
  const [openAlexKey, setOpenAlexKey] = useState('');
  const [clearOpenAlex, setClearOpenAlex] = useState(false);
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState('');
  const hasModels = Object.values(connections).some((item) => item.models.length > 0);
  const loading = Object.keys(connections).length < Object.keys(connectionNames).length;
  const questionEntry = taskModel(connections, question);
  const translationEntry = translation.mode === 'separate' ? taskModel(connections, translation) : null;
  const questionChoice = questionEntry ? { ...question, model: questionEntry.id } : null;
  const translationChoice = translationEntry ? { ...translation, model: translationEntry.id }
    : translation.mode === followQuestion && questionEntry ? { mode: followQuestion }
      : { mode: localTranslation, model: translation.mode === localTranslation ? translation.model ?? defaultLocalTranslationModel : defaultLocalTranslationModel };
  const translationOption = translationChoice.mode === localTranslation
    ? [...localOptions].find(([, id]) => id === translationChoice.model)?.[0] || localTranslation
    : modelKey(translationChoice) || translationChoice.mode;

  async function submit(action) {
    setPending(action);
    setStatus(null);
    try {
      if (action === 'save') {
        const config = await api.saveModel({ question: questionChoice, translation: translationChoice, openAlexKey, clearOpenAlex });
        onSave(config);
      } else {
        await api.testModel(questionChoice);
        setStatus({ text: '连接成功，模型已返回结果。' });
      }
    } catch (error) {
      setStatus({ error: true, text: error.message });
    } finally {
      setPending('');
    }
  }

  return <form className="model-settings-form" onSubmit={(event) => { event.preventDefault(); submit('save'); }}>
    <div className="model-section-title"><h3>任务模型</h3></div>
    <fieldset disabled={Boolean(pending || updating)}>
      <div className="model-task">
        <label className="model-task-title" htmlFor="question-model">问答</label>
        <div className="model-picker">
          <select id="question-model" disabled={!hasModels} value={modelKey(questionChoice)}
            onChange={(event) => { setStatus(null); setQuestion(fromOption(connections, event.target.value)); }}>
            <option value="">{hasModels ? '选择问答模型' : loading ? '正在检测已连接账号…' : '先在上方连接账号'}</option>
            <ConnectedOptions connections={connections} />
          </select>
          <EffortSelect name="问答推理强度" selection={questionChoice} entry={questionEntry} onChange={setQuestion} />
        </div>
      </div>
      <div className="model-task">
        <label className="model-task-title" htmlFor="translation-model">翻译</label>
        <div className="model-picker">
          <select id="translation-model" value={translationOption} onChange={(event) => {
            const selected = event.target.value;
            const localModel = localOptions.get(selected);
            const model = fromOption(connections, selected);
            setTranslation(localModel ? { mode: localTranslation, model: localModel }
              : model ? { ...model, mode: 'separate' } : { mode: followQuestion });
            setStatus(null);
          }}>
            {[...localOptions].map(([option, id]) => <option key={id} value={option}>{localTranslationModels[id].label}（离线）</option>)}
            {questionEntry && <option value={followQuestion}>跟随问答模型</option>}
            <ConnectedOptions connections={connections} />
          </select>
          <EffortSelect name="翻译推理强度" selection={translationChoice} entry={translationEntry} onChange={setTranslation} />
        </div>
      </div>
      <details className="advanced-config"><summary>高级设置</summary>
        {questionChoice && <>
          <label>上下文窗口（tokens）
            <input type="number" min="4096" max="4000000" value={questionChoice.contextWindow ?? ''}
              placeholder="留空自动设置" onChange={(event) => setQuestion({ ...questionChoice, contextWindow: event.target.value })} />
          </label>
          <div className="setting-field-group">
            <span id="model-images-label" className="setting-field-label">图像输入</span>
            <div className="elr-segmented-control" role="group" aria-labelledby="model-images-label">
              {[['auto', '自动'], ['yes', '开启'], ['no', '关闭']].map(([id, text]) => (
                <button key={id} type="button" aria-pressed={(questionChoice.images || 'auto') === id}
                  onClick={() => setQuestion({ ...questionChoice, images: id })}>{text}</button>
              ))}
            </div>
          </div>
        </>}
        <label>OpenAlex API Key（可选）
          <input type="password" autoComplete="off" value={openAlexKey} onChange={(event) => setOpenAlexKey(event.target.value)}
            placeholder={value.hasOpenAlexKey ? '已保存，留空继续使用' : '用于整理参考文献'} />
        </label>
        {value.hasOpenAlexKey && <label className="check-label">
          <input type="checkbox" checked={clearOpenAlex} onChange={(event) => setClearOpenAlex(event.target.checked)} />清除 OpenAlex 密钥
        </label>}
      </details>
    </fieldset>
    <footer className="dialog-actions">
      {status && <p role={status.error ? 'alert' : 'status'} className={status.error ? 'form-error' : 'form-ok'}>{status.text}</p>}
      <button className="model-test-action" type="button" disabled={Boolean(!questionEntry || pending || updating)} onClick={() => submit('test')}>
        {pending === 'test' ? '测试中…' : '测试问答模型'}
      </button>
      <button className="primary" type="submit" disabled={Boolean(pending || updating || loading)}>{pending === 'save' ? '保存中…' : '保存设置'}</button>
    </footer>
  </form>;
}
