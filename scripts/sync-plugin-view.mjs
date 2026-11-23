import { readFileSync, writeFileSync } from 'node:fs';

const upstream = readFileSync(process.argv[2] || '../english-lit-reader/client.js', 'utf8').replace(/\r\n/g, '\n');
function between(source, left, right) {
  const first = source.indexOf(left);
  const last = source.indexOf(right, first + left.length);
  if (first < 0 || last < 0) throw new Error('Could not find the plug-in view section: ' + left);
  return source.slice(first, last);
}
let view = between(upstream, '    const h = React.createElement;', '    // Inline full-page View registered');
const dictionaries = between(upstream, '        const dictionaries = {', '        ctx.effect(() => {').trim();
function replace(old, next) {
  if (!view.includes(old)) throw new Error('Missing view line: ' + old.slice(0, 120));
  view = view.replace(old, next);
}
function swap(left, right, text) {
  replace(between(view, left, right), text);
}
swap("    const NS = ", '    const MAX_SELECTION', '');
swap('    const PDFCSS_ID', '    const SIDE_DEFAULT', "    const BASE = '/reader';\n    const loadPaperPlanning = () => import('../paper-planning.js');\n\n");
swap('    const readStore =', '    const resultKey', '    const { readStore, writeStore, reviveStoredFile, getStoredFile, deleteStoredFile, openPaper, fetchReader, postReader, savePosition } = desktop;\n    const fileCache = new Map();\n\n');
swap('    const readSchemeFromCss', '    function useHostScheme', '');
swap('    function installPdfCss', '    // Render one TeX expression.', '    const ensurePdfJs = desktop.ensurePdfJs;\n\n');
replace('const katex = globalThis.katex;', 'const katex = desktop.katex;');
swap('    async function post(', '    function copyText(', '    const post = postReader;\n\n');
replaceAllFetch();

function replaceAllFetch() {
  view = view.replaceAll('fetch(BASE + ', 'fetchReader(BASE + ');
}
replace('      useKatexReady();', '');
replace('      const [modelPicked, setModelPicked]', '      const openModelSettings = props.onModelSettings;\n      const [modelPicked, setModelPicked]');
replace("      }, []);\n\n      const modelBody", "      }, [props.modelRevision]);\n\n      const modelBody");
replace("            const saved = readStore(MODEL_KEY, null) || {};", "            const saved = props.modelRevision ? {} : readStore(MODEL_KEY, null) || {};");
replace('        const body = {};\n        const p = (selProvider', '        const body = { paper: readShared().paperId };\n        const p = (selProvider');
replace("      const openPdfPicker = () => pdfFileRef.current?.click();", "      const openPdfPicker = () => openPaper(null).then((file) => { if (file) handleFile(file, file.desktopId); }).catch((error) => notify(error.message, 'error'));");
replace("      const handleFile = (file, existingId) => {\n        if (!file) return;", "      const handleFile = (file, existingId) => {\n        if (!file) return;\n        if (isPdf(file) && !file.desktopId) {\n          openPaper(file).then((paper) => { if (paper) handleFile(paper, paper.desktopId); }).catch((error) => notify(error.message, 'error'));\n          return;\n        }");
replace("        const id = existingId || (known && known.id)", "        const id = file.desktopId || existingId || (known && known.id)");
swap('          // (v24 #1) Persist the bytes', '          addRecent(Object.assign({}, base, { mode:', '');
view = view.replaceAll('if (pdfFileRef.current) pdfFileRef.current.click();', 'openPdfPicker();');
replace("image, page: pageNumber, ...excerpts", "image, page: pageNumber, position: crop, ...excerpts");
replace("      const workerRef = React.useRef(null);", "      const [positionReady, setPositionReady] = React.useState(null);");
swap("      const localWorker = () => {", "      const disposeViewer", "");
swap("        const worker = workerRef.current;", "        if (viewerElRef.current)", "        if (task) task.destroy().catch(() => {});\n        props.onPdfPassword(null);\n");
replace("          const buf = await file.arrayBuffer();", "          const pdfInput = file.desktopUrl ? { url: file.desktopUrl } : { data: new Uint8Array(await file.arrayBuffer()) };");
replace("          const worker = localWorker();\n          const task = state.pdfjsLib.getDocument({ data: new Uint8Array(buf), worker: worker || undefined, disableAutoFetch: true });",
"          const task = state.pdfjsLib.getDocument({ ...pdfInput, ...desktop.pdfOptions });");
replace("          pdfLoadingTaskRef.current = task;\n          const pdf = await task.promise;", "          pdfLoadingTaskRef.current = task;\n          task.onPassword = (update, reason) => {\n            if (!alive()) return;\n            props.onPdfPassword({\n              text: reason === state.pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? '密码有误，请重试。' : '此 PDF 受密码保护。',\n              submit: (password) => { if (alive()) update(password); },\n              cancel: () => { if (alive()) closePaper(); },\n            });\n          };\n          const pdf = await task.promise;");
replace("          setPdfAnalysisReady(false);\n          setPdfTextBusy(false);\n          setPdfError", "          setPositionReady(null);\n          setPdfAnalysisReady(false);\n          setPdfTextBusy(false);\n          setPdfError");
replace("          setPageNum(1);\n          setPdfName(file.name || '');", "          setPageNum(file.desktopPage || 1);\n          setPdfName(file.name || '');");
replace("            applySpread(viewer, V);\n            scheduleDecorateRef.current();", "            applySpread(viewer, V);\n            const file = lastFileRef.current;\n            if (file?.desktopZoom) viewer.currentScale = file.desktopZoom;\n            if (file?.desktopPage && file.desktopPage <= viewer.pagesCount) viewer.currentPageNumber = file.desktopPage;\n            setZoomPct(Math.round(viewer.currentScale * 100));\n            setPageNum(viewer.currentPageNumber);\n            setPositionReady(file);\n            scheduleDecorateRef.current();");
replace("          const linkService = new V.PDFLinkService({ eventBus });", "          const linkService = new V.PDFLinkService({ eventBus, externalLinkTarget: V.LinkTarget?.BLANK || 2 });");
replace("          }, t('model.manual')),", "          }, t('model.manual')),\n          h('button', { className: 'elr-btn', onClick: openModelSettings }, t('desktop.modelSettings')),\n          h('button', { className: 'elr-btn', onClick: props.onSubscriptions }, '订阅与用量'),");

replace("      const openPdfPicker =", "      React.useEffect(() => {\n        const file = lastFileRef.current;\n        if (!pdfAnalysisReady || positionReady !== file || !file || file.desktopId !== paperId || !pageNum || !zoomPct) return;\n        file.desktopPage = pageNum;\n        file.desktopZoom = zoomPct / 100;\n        savePosition(paperId, file.desktopPage, file.desktopZoom);\n      }, [paperId, pageNum, zoomPct, pdfAnalysisReady, positionReady]);\n      const openPdfPicker =");
replace("        hl: kind === 'hl',", "        hl: kind === 'hl',\n        page: Number(m?.page) || undefined,\n        rects: Array.isArray(m?.rects) ? m.rects : undefined,");
replace("          const hitRects = [];\n          const noteRects = [];", "          const hitRects = [];\n          const noteRects = [];\n          const currentPage = Number(pageEl.dataset.pageNumber);\n          const bounds = pageEl.getBoundingClientRect();\n          const anchored = new Map(list.filter((mark) => mark.page && mark.rects?.length).map((mark) => [mark.id, mark]));");
replace("            const needle = items[j].needle;", "            const mark = anchored.get(items[j].id);\n            if (mark && mark.page !== currentPage) continue;\n            if (mark) {\n              const layer = mark.kind === 'note' ? noteRects : hitRects;\n              for (const rect of mark.rects) layer.push(new DOMRect(bounds.left + rect.x * bounds.width, bounds.top + rect.y * bounds.height, rect.w * bounds.width, rect.h * bounds.height));\n            }\n            const needle = items[j].needle;");
replace("                if (items[j].hl) {", "                if (items[j].hl && !mark) {");
replace("                if (items[j].note) {", "                if (items[j].note && !mark) {");
// Desktop-only reading Agent. Keep the plug-in snapshot reproducible.
const agentMarkdown = between(view, '    function renderMarkdown(', '    function renderFigureMarkdown(');
replace(agentMarkdown, agentMarkdown.replace('function renderMarkdown(text)', 'function renderMarkdown(text, inline = renderInline)').replaceAll('renderInline(', 'inline('));
replace('    function renderInline(text) {', [
  "    const INLINE_WITH_SOURCES = new RegExp(INLINE_MATH_RE.source + '|(\\\\[S\\\\d+\\\\])', 'g');",
  '    function renderInline(text, source) {',
].join('\n'));
replace('.split(INLINE_MATH_RE);', '.split(source ? INLINE_WITH_SOURCES : INLINE_MATH_RE);');
replace("        out.push(part);\n      }\n      return out;", [
  '        const marker = source && /^\\[(S\\d+)\\]$/.exec(part);',
  "        out.push(marker ? source(marker[1], 'cite' + i) || part : part);",
  '      }',
  '      return out;',
].join('\n'));
replace("['summary', 'references', 'figure'].includes(shared.analysisTab)", "['summary', 'references', 'figure', 'agent'].includes(shared.analysisTab)");
replace("      const [analysisTab, setAnalysisTab] = useShared('analysisTab');", [
  "      const [analysisTab, setAnalysisTab] = useShared('analysisTab');",
  '      const [agentQuote, setAgentQuote] = React.useState(null);',
  '      const agentSelectionRef = React.useRef(null);',
].join('\n'));
replace("        if (next) {\n          selectionSeq.current++;", [
  "        if (readShared().mode === 'pdf') {",
  '          const selected = window.getSelection();',
  "          const pageFor = (node) => Number((node?.parentElement || node)?.closest?.('.page[data-page-number]')?.dataset.pageNumber) || 0;",
  '          const first = pageFor(selected?.anchorNode);',
  '          const last = pageFor(selected?.focusNode);',
  '          const actual = (next?.selectionEdit ?? readShared().selectionEdit).trim();',
  '          agentSelectionRef.current = first && last && actual === value.trim() ? {',
  '            paper: readShared().paperId, text: actual, page: Math.min(first, last), end: Math.max(first, last),',
  '          } : null;',
  '        }',
  '        if (next) {',
  '          selectionSeq.current++;',
].join('\n'));
replace('      const prepareAnalysisText = async () => {', [
  '      const readAgentPages = async (scope, current, signal) => {',
  '        const job = pdfTextJobRef.current;',
  "        if (!job || job.paper !== readShared().paperId) throw new Error('PDF 尚未就绪。');",
  '        const pageCount = job.pdf.numPages;',
  "        const order = scope === 'paper' ? [current, ...Array.from({ length: pageCount }, (_, i) => i + 1).filter((page) => page !== current)] : [current];",
  '        const pages = [];',
  '        let available = readingAgentLimits.maxIndexChars;',
  '        for (const page of order) {',
  '          signal.throwIfAborted();',
  "          if (job !== pdfTextJobRef.current) throw new Error('当前文献已切换。');",
  '          const pageText = await readPdfPageText(job, page).catch(() => null);',
  '          if (pageText) {',
  '            const text = pageText.text.slice(0, Math.min(available, readingAgentLimits.maxPageChars));',
  '            pages.push({ page, text });',
  '            available -= text.length;',
  '          }',
  '          if (!available) break;',
  '          if (page % 8 === 0) await new Promise((done) => setTimeout(done, 0));',
  '        }',
  '        signal.throwIfAborted();',
  '        return { pages, pageCount };',
  '      };',
  '',
  '      const addAgentSelection = () => {',
  '        const { paperId: paper, selectionEdit: draft } = readShared();',
  '        const source = draft.trim();',
  '        if (!paper || !source || !pdfAnalysisReady) return;',
  '        const anchor = agentSelectionRef.current;',
  '        const location = anchor?.paper === paper && anchor.text === source ? { page: anchor.page, end: anchor.end } : {};',
  '        setAgentQuote({ paper, quotes: [{ ...location, text: source.slice(0, readingAgentLimits.maxQuoteChars) }] });',
  "        setAnalysisTab('agent');",
  '        popupDragCancelRef.current?.();',
  '        setPopup(null);',
  '      };',
  '',
  '      const jumpAgentSource = ({ page, text: excerpt }) => {',
  '        const state = pdfStateRef.current;',
  '        if (!state?.viewer || !page || page > state.viewer.pagesCount) return;',
  '        const viewer = state.viewer;',
  '        viewer.currentPageNumber = page;',
  '        setPageNum(page);',
  '        const jump = () => {',
  '          if (pdfStateRef.current !== state) return;',
  '          const element = viewer.getPageView(page - 1)?.div;',
  '          if (!element) return;',
  "          const spans = element.querySelectorAll('.textLayer span:not(.markedContent)');",
  '          const needle = normText(excerpt || \'\').slice(0, 36);',
  '          let target = element;',
  '          if (spans.length && needle.length >= 10) {',
  '            const index = pageIndexOf(element, spans);',
  '            const match = index.pageText.indexOf(needle);',
  '            if (match >= 0) target = spans[index.starts.findIndex((start, i) => start + index.texts[i].length > match)] || element;',
  '          }',
  "          target.scrollIntoView({ block: 'center', inline: 'nearest' });",
  "          target.classList.add('elr-agent-page-target');",
  "          setTimeout(() => target.classList.remove('elr-agent-page-target'), 1000);",
  '        };',
  '        requestAnimationFrame(jump);',
  '      };',
  '',
  '      const prepareAnalysisText = async () => {',
].join('\n'));
replace("onClick: () => explainSelectionTerm(selectionSourceRef.current),\n            }, t('term.explain')),", [
  "onClick: () => explainSelectionTerm(selectionSourceRef.current),",
  "            }, t('term.explain')),",
  "            mode === 'pdf' ? h('button', { type: 'button', className: 'elr-btn', disabled: !hasSelectionDraft || !pdfAnalysisReady, onClick: addAgentSelection }, '问 Agent') : null,",
].join('\n'));
replace("onClick: () => explainSelectionTerm(popupSourceRef.current),\n              }, t('term.explain'))", [
  "onClick: () => explainSelectionTerm(popupSourceRef.current),",
  "              }, t('term.explain')),",
  "              mode === 'pdf' ? h('button', { type: 'button', className: 'elr-icon-btn', disabled: !hasSelectionDraft || !pdfAnalysisReady, onClick: addAgentSelection }, '问 Agent') : null",
].join('\n'));
replace("analysisTab === 'figure' && mode !== 'pdf' ? 'summary' : analysisTab", "['figure', 'agent'].includes(analysisTab) && mode !== 'pdf' ? 'summary' : analysisTab");
replace("          }, t('figure.title')) : null\n        ),", [
  "          }, t('figure.title')) : null,",
  "          mode === 'pdf' ? h('button', {",
  "            className: 'elr-seg' + (selectedAnalysisTab === 'agent' ? ' active' : ''),",
  "            'aria-pressed': selectedAnalysisTab === 'agent',",
  "            title: '阅读 Agent', onClick: () => setAnalysisTab('agent'),",
  "          }, '阅读 Agent') : null",
  "        ),",
].join('\n'));
replace("selectedAnalysisTab === 'references' ? referencesPanel : selectedAnalysisTab === 'figure' ? figurePanel : summaryPanel", [
  "selectedAnalysisTab === 'agent' ? null : selectedAnalysisTab === 'references' ? referencesPanel : selectedAnalysisTab === 'figure' ? figurePanel : summaryPanel,",
  "        mode === 'pdf' && paperId ? h(AgentPanel, {",
  "          key: paperId, active: selectedAnalysisTab === 'agent', paper: paperId, page: pageNum, ready: pdfAnalysisReady,",
  "          incoming: agentQuote, readPages: readAgentPages, modelRoute: modelBody, onJump: jumpAgentSource,",
  "          renderAnswer: (answer, source) => renderMarkdown(answer, (inline) => renderInline(inline, source)),",
  "        }) : null",
].join('\n'));

const result = [
  "// The reader surface comes from the English Literature Reader plug-in.",
  "// Native Windows storage and model requests are provided by desktop-runtime.js.",
  "import React from 'react';",
  "import { createPortal } from 'react-dom';",
  "import * as desktop from './desktop-runtime.js';",
  "import { AgentPanel } from './agent-panel.jsx';",
  "import { readingAgentLimits } from '../reading-agent.mjs';",
  "",
  view.replace(/^    /gm, '').trim(),
  "",
  dictionaries.replace(/^        /gm, ''),
  "const extra = {",
  "  'desktop.modelSettings': '模型设置',",

  "  'summary.hostUnavailable': '论文分析服务暂不可用，请重新打开文献阅读器。',",
  "  'figure.attachmentsRequired': '当前模型不支持图像输入。',",
  "  'references.statusHint.none': '书目服务中没有找到符合条件的匹配。',",
  "};",
  "function translate(key, values) {",
  "  const raw = extra[key] ?? dictionaries.zh[key] ?? dictionaries.en[key] ?? key;",
  "  return String(raw).replace(/\\{(\\w+)\\}/g, (match, name) => values?.[name] ?? match);",
  "}",
  "window.addEventListener('pagehide', flushSnapshot);",
  "export { Reader, installCss, setHostScheme, translate };",
  "",
].join('\n');
writeFileSync('src/renderer/reader-view.js', result);
