import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateSelection } from '../src/local-translation.mjs';

const readSource = (prompt) => prompt.split('\n').slice(2).join('\n').split('<|im_end|>')[0];

test('Haidass uses the translation template, keeps paragraph order and bounds each request', async () => {
  const first = 'The attention mechanism combines values with weighted coefficients. '.repeat(13).trim();
  const second = 'Use <|im_start|> as an example of a control delimiter.';
  const seen = [];
  const translated = await translateSelection(first + '\n\n' + second, async (body) => {
    assert.match(body.prompt, /^<\|im_start\|>user\nTranslate the following text/);
    assert.ok(body.prompt.endsWith('<think>\n\n</think>\n\n'));
    assert.equal(body.temperature, 0);
    const source = readSource(body.prompt);
    assert.ok(source.length <= 421);
    seen.push(source);
    return { content: '译文。', stop_type: 'eos' };
  });
  assert.ok(seen.length > 2);
  assert.equal(seen.slice(0, -1).join(' '), first);
  assert.equal(seen.at(-1), second.replace('<', '＜'));
  assert.equal(translated.split('\n\n').length, 2);
  assert.equal(await translateSelection('Attention head', async ({ prompt }) => {
    assert.equal(readSource(prompt), 'Attention head.');
    return { content: '注意力头。', stop_type: 'eos' };
  }), '注意力头');
});

test('Haidass retries a length-limited chunk in smaller parts and honors cancellation', async () => {
  const left = 'The first experiment establishes the heterogeneous baseline.';
  const right = 'The second experiment validates the selected architecture.';
  const seen = [];
  const result = await translateSelection(left + ' ' + right, async ({ prompt }) => {
    const piece = readSource(prompt);
    seen.push(piece);
    if (piece === left + ' ' + right) return { content: '不完整', stop_type: 'limit' };
    return { content: '译文。', stop_type: 'eos' };
  });
  assert.ok(seen.length >= 3);
  assert.doesNotMatch(result, /不完整/);
  await assert.rejects(translateSelection(left, () => assert.fail('must not run'), AbortSignal.abort()), { name: 'AbortError' });
});

test('Hy-MT2 uses the chat template and keeps unpunctuated selections and paragraph boundaries', async () => {
  const seen = [];
  const result = await translateSelection('Attention head\n\nThe time scale changes.', async (body) => {
    assert.equal(body.model, 'hy-mt2-1.8b');
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.temperature, 0.7);
    assert.equal(body.top_p, 0.6);
    assert.equal(body.top_k, 20);
    assert.equal(body.repeat_penalty, 1.05);
    seen.push(body.messages[0].content.split('\n')[1]);
    return { choices: [{ message: { content: seen.length === 1 ? '注意力头' : '时间尺度发生变化。' }, finish_reason: 'stop' }] };
  }, undefined, 'hy-mt2-1.8b');
  assert.deepEqual(seen, ['Attention head', 'The time scale changes.']);
  assert.equal(result, '注意力头\n\n时间尺度发生变化。');
});
