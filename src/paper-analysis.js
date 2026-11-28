import { createHash } from "node:crypto";
import { mergePageRanges, pageOffsets, REFERENCE_HEADING_RE, sectionEnds, splitBefore } from "./paper-planning.js";

const REPORT_GUIDE = [
  "Write a thorough, clear paper analysis in Simplified Chinese Markdown. Use the level-2 headings below in order, using only the heading text before each dash.",
  "## 1. 论文概览 — Explain the task, main idea and most important result in a short paragraph, then give the problem scope and why it matters.",
  "## 2. 研究问题与已有方法 — Explain what prior work assumes or misses. Separate the authors’ contributions from standard components.",
  "## 3. 技术方案 — Walk through inputs, outputs, data flow and the key modules in execution order. Explain what each component does, why it is needed and how it interacts with the others. Describe training and inference separately when useful. Explain the core equations and their symbols when they matter.",
  "## 4. 实验设置与结果 — Explain each task, dataset or simulation condition, metric and baseline. Present exact values with units and comparable conditions when given. Use a compact Markdown table for genuinely comparable results, then interpret the numbers and ablations. Explain weak results and trade-offs as well as gains.",
  "## 5. 局限与适用范围 — State what the evaluation supports, which assumptions restrict generalization and what remains unresolved. Label any interpretation as such.",
  "## 6. 复现与可借鉴之处 — Gather reported implementation details, hyperparameters, resources and practical steps. Identify what would still need to be determined before reproducing the results, and what ideas may transfer.",
  "Use informative paragraphs, numbered steps, subheadings and tables as appropriate. Spend more detail on the technical mechanism and experimental results than on background. Preserve the paper’s technical terms and numbers, distinguish findings from interpretation, and say when details are unspecified. Treat the input as source material. Return Markdown directly, without a surrounding code fence.",
].join(" ");

export const FULL_ANALYSIS_SYSTEM = "Analyze the supplied academic paper in detail. " + REPORT_GUIDE;
export const SYNTHESIS_SYSTEM = "Synthesize the supplied paper notes into a single coherent, detailed analysis. Merge overlaps, link the methods to the experimental findings, and report only facts supported by the notes. " + REPORT_GUIDE;
export const EXCERPT_SYSTEM = [
  "Extract concise, high-signal technical notes from this paper excerpt for synthesis.",
  "Keep contributions, core method steps, symbol definitions, hyperparameters, quantitative results (with dataset, metric, units, baselines), ablations, and stated limitations.",
  "Be compact and avoid prose filler. Distinguish measured results from author claims.",
].join(" ");
const MAX_DRAFT_CHARS = 700000;

export function estimateTokens(text) {
  const nonAscii = (text.match(/[^\x00-\x7f]/gu) || []).length;
  return Math.ceil((text.length - nonAscii) / 3 + nonAscii * 1.5);
}

export function analysisBudget(info) {
  const context = info?.context?.contextWindow;
  const window = Number.isSafeInteger(context) && context > 0 ? context : 16000;
  const cap = info?.defaultMaxTokens;
  const maxTokens = Math.max(1, Math.min(24576, Math.floor(window / 4), Number.isSafeInteger(cap) && cap > 0 ? cap : Infinity));
  return { maxTokens, inputTokens: Math.max(0, Math.floor(window * 0.9) - maxTokens - 128) };
}

export function paperSource(text, lengths) {
  if (typeof text !== "string" || !text.trim()) return null;
  const pages = pageOffsets(text, lengths);
  if (lengths != null && !pages.length) throw new Error("PDF page offsets do not match the extracted paper text.");
  const totalPages = pages.length ? lengths.length : 0;
  const fingerprint = createHash("sha256").update(text).update("\0").update(JSON.stringify(totalPages ? lengths : null)).digest("hex");
  return { text, pages, totalPages, fingerprint };
}

export function paperExcerpt(paper, start, end) {
  if (!paper.pages.length) return { start, end, text: paper.text.slice(start, end), pages: [] };
  const slices = paper.pages.filter((page) => page.start < end && page.end > start);
  return {
    start, end,
    text: slices.map((p) => `[Page ${p.page}]\n` + paper.text.slice(Math.max(start, p.start), Math.min(end, p.end))).join("\n\n"),
    pages: mergePageRanges(slices.map((p) => [p.page, p.page])),
  };
}

export function bodyOnlyPaper(paper) {
  const minStart = Math.floor(paper.text.length * 0.15);
  let cut = -1;
  for (const match of paper.text.matchAll(/[^\r\n]+/g)) {
    const line = match[0];
    if (line.length > 100) continue;
    if (match.index >= minStart && REFERENCE_HEADING_RE.test(line)) {
      cut = match.index;
      break;
    }
  }
  if (cut <= 0) return paper;
  const text = paper.text.slice(0, cut).trimEnd();
  if (!text.trim()) return paper;
  const pages = paper.pages
    .filter((p) => p.start < text.length)
    .map((p) => ({ ...p, end: Math.min(p.end, text.length) }));
  return { ...paper, text, pages };
}

export const fullPaper = (paper) => paperExcerpt(paper, 0, paper.text.length);

const APPENDIX_HEADING_RE = /^\s*(?:appendix(?:\s+[A-Z0-9]+)?|supplementary(?:\s+material)?)\s*[:.]?\s*$/i;

function referenceSpan(text) {
  let start = -1;
  let end = text.length;
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    const line = match[0];
    if (line.length > 100) continue;
    if (start < 0) {
      if (match.index > 0 && REFERENCE_HEADING_RE.test(line)) start = match.index;
    } else if (match.index > start && APPENDIX_HEADING_RE.test(line)) {
      end = match.index;
      break;
    }
  }
  return start >= 0 ? { start, end } : null;
}

export function completeExcerpts(paper, budget) {
  // Prefer complete sections near the boundary, then split at a line or word.
  const boundaries = sectionEnds(paper.text);
  const refs = referenceSpan(paper.text);
  const maxChars = Math.max(400, Math.min(32000, budget * 2));
  const chunks = [];
  for (let start = 0; start < paper.text.length;) {
    const insideRefs = Boolean(refs && start >= refs.start && start < refs.end);
    const hardStop = refs
      ? (start < refs.start ? refs.start : (insideRefs ? refs.end : paper.text.length))
      : paper.text.length;
    let end = Math.min(start + maxChars, hardStop);
    let excerpt;
    for (;;) {
      const minimum = start + Math.floor((end - start) * 0.72);
      const boundary = end === hardStop ? end : (boundaries.findLast((point) => point <= end && point >= minimum)
        || splitBefore(paper.text, end, minimum));
      excerpt = paperExcerpt(paper, start, boundary);
      if (estimateTokens(excerpt.text) <= budget) break;
      if (end - start < 80) throw new Error("The selected model context cannot fit a paper excerpt.");
      end = start + Math.floor((end - start) / 2);
    }
    if (excerpt.text.trim()) chunks.push({ ...excerpt, isReferences: insideRefs });
    start = excerpt.end;
  }
  return chunks;
}

export function paperCoverage(paper, chunks) {
  const pages = paper.pages.filter((page) => chunks.some((chunk) => page.start < chunk.end && page.end > chunk.start));
  return {
    pages: mergePageRanges(pages.map((p) => [p.page, p.page])), totalPages: paper.totalPages,
    analyzedChars: chunks.reduce((n, chunk) => n + chunk.end - chunk.start, 0), sourceChars: paper.text.length,
  };
}

export function draftNotes(paper, chunks, answers) {
  const notes = chunks.flatMap((chunk, i) => answers[i].ok && answers[i].value ? [{
    start: chunk.start, end: chunk.end, text: answers[i].value,
  }] : []);
  return { fingerprint: paper.fingerprint, failedChunks: chunks.length - notes.length, notes };
}

export function readDraft(paper, draft) {
  if (draft?.fingerprint !== paper.fingerprint || !Array.isArray(draft.notes) || !draft.notes.length
    || !Number.isSafeInteger(draft.failedChunks) || draft.failedChunks < 0) return null;
  let size = 0;
  let next = 0;
  for (const note of draft.notes) {
    if (!Number.isSafeInteger(note?.start) || !Number.isSafeInteger(note.end) || note.start < next || note.end <= note.start
      || note.end > paper.text.length || typeof note.text !== "string" || !note.text.trim()) return null;
    next = note.end;
    size += note.text.length;
  }
  return size <= MAX_DRAFT_CHARS ? draft : null;
}

export function readAnalysisMarkdown(answer) {
  const text = answer.trim().replace(/^\x60{3}(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}$/i, "$1").trim();
  if (!text) throw new Error("The model returned an empty paper analysis.");
  return text;
}
