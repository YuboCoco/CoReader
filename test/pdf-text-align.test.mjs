import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdfWordRuns, matchSpanToRuns } from '../src/renderer/pdf-text-align.mjs';

test('extractPdfWordRuns and matchSpanToRuns recover exact word positions for merged sample PDF lines', async () => {
  const data = new Uint8Array(readFileSync('assets/samples/Attention Is All You Need.pdf'));
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(3);
    const viewport = page.getViewport({ scale: 1 });
    const [ops, content] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
    const runs = extractPdfWordRuns(ops, pdfjs.OPS, viewport);
    const targetItem = content.items.find((item) => item.str?.includes('shown in the left and right halves of Figure 1'));
    assert.ok(targetItem, 'expected sample line item');

    const [vx, vy] = viewport.convertToViewportPoint(targetItem.transform[4], targetItem.transform[5]);
    const fontHeight = Math.hypot(targetItem.transform[2], targetItem.transform[3]);
    const fontHeightPct = (fontHeight / viewport.height) * 100;
    const spanLeftPct = (vx / viewport.width) * 100;
    const spanTopPct = ((vy - fontHeight * 0.78) / viewport.height) * 100;

    const matched = matchSpanToRuns(targetItem.str, spanLeftPct, spanTopPct, fontHeightPct, runs, 0);
    assert.ok(matched, 'expected word-level match');
    const shown = matched.words.find((w) => w.text === 'shown');
    assert.ok(shown);
    // Exact PDF x=318.54pt out of 612pt -> ~52.049%, width=26.28pt -> ~4.294%.
    assert.ok(Math.abs(shown.leftPct - (318.54 / viewport.width) * 100) < 0.1);
    assert.ok(Math.abs(shown.widthPct - (26.28 / viewport.width) * 100) < 0.1);
  } finally {
    await task.destroy();
  }
});
