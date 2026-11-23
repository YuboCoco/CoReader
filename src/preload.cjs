const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld('reader', {
  choosePaper: () => call('paper:choose'),
  dropPaper: (file) => call('paper:drop', webUtils.getPathForFile(file)),
  recent: () => call('paper:recent'),
  paperLibrary: () => call('paper:library'),
  chooseLibraryFolder: (category) => call('paper:library-folder', category),
  dropLibraryPapers: (files, category) => call('paper:library-drop', files.map((file) => webUtils.getPathForFile(file)), category),
  savePaperCategory: (input) => call('paper:category-save', input),
  removePaperCategory: (id) => call('paper:category-remove', id),
  classifyPapers: (ids, target) => call('paper:classify', ids, target),
  removePapersFromCategory: (ids, category) => call('paper:category-exclude', ids, category),
  createPaperTag: (name) => call('paper:tag-create', name),
  updatePaperDetails: (id, details) => call('paper:details', id, details),
  reopen: (id) => call('paper:reopen', id),
  position: (id, page, zoom, pageCount) => call('paper:position', id, page, zoom, pageCount),
  savePaperPageCount: (id, count) => call('paper:page-count', id, count),
  records: (id) => call('paper:records', id),
  readerData: (id) => call('reader:data', id),
  saveReaderData: (id, kind, data) => call('reader:save', id, kind, data),
  readerRequest: (path, body) => call('reader:request', path, body),
  parallelLayout: (pixels) => call('parallel:layout', pixels),
  parallelPage: (paper, page) => call('parallel:page', paper, page),
  saveParallelBlock: (paper, page, entry) => call('parallel:save', paper, page, entry),
  agentHistory: (paper) => call('agent:history', paper),
  onAgentProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('agent:progress', listener);
    return () => ipcRenderer.removeListener('agent:progress', listener);
  },
  addMark: (id, mark) => call('mark:add', id, mark),
  editMark: (id, key, body) => call('mark:edit', id, key, body),
  deleteMark: (id, key) => call('mark:delete', id, key),
  deleteTerm: (id, key) => call('term:delete', id, key),
  getModel: () => call('model:get'),
  modelConnections: () => call('model:connections'),
  getModelConnection: (provider, refresh = false) => call('model:connection', provider, refresh),
  updateModelConnection: (provider, draft) => call('model:connection-update', provider, draft),
  modelUsage: (provider, refresh = false) => call('model:usage', provider, refresh),
  saveModel: (draft) => call('model:save', draft),
  testModel: (draft) => call('model:test', draft),
  startJob: (job) => call('job:start', job),
  cancelJob: (id) => call('job:cancel', id),
  windowReady: () => call('window:ready'),
  chatgptStatus: () => call('chatgpt:status'),
  chatgptLogin: (id) => call('chatgpt:login', id),
  chatgptSelect: (id) => call('chatgpt:select', id),
  chatgptCancel: () => call('chatgpt:cancel'),
  chatgptLogout: () => call('chatgpt:logout'),
  research: (id) => call('research:get', id),
  runResearch: (input) => call('research:run', input),
  removeFigure: (paper, id) => call('research:delete-figure', paper, id),
  openLink: (url) => call('link:open', url),
  onResearchProgress: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('research:progress', listener);
    return () => ipcRenderer.removeListener('research:progress', listener);
  },
  toggleFullscreen: () => call('window:fullscreen'),
  onProgress: (listener) => {
    const onMessage = (_event, delta) => listener(delta);
    ipcRenderer.on('job:progress', onMessage);
    return () => ipcRenderer.removeListener('job:progress', onMessage);
  },
});
