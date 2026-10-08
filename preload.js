const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

// The only surface the web page can reach the main process through.
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,

  // Settings & folders
  getConfig: invoke('config:get'),
  chooseFolder: invoke('config:choose-folder'),
  openFolder: invoke('config:open-folder'),
  reveal: invoke('shell:reveal'),

  // Capture source picker (screens + windows) and optional system audio
  listSources: invoke('sources:list'),
  selectSource: (id, systemAudio) => ipcRenderer.invoke('sources:select', { id, systemAudio }),

  // Window / state
  minimizeWindow: invoke('win:minimize'),
  restoreWindow: invoke('win:restore'),
  setRecordingState: invoke('rec:state'),

  // Disk-backed recording + crash recovery
  recStart: invoke('rec:start'),
  recChunk: invoke('rec:chunk'),       // (id, ArrayBuffer)
  recFinish: invoke('rec:finish'),
  recDiscard: invoke('rec:discard'),
  recoveryCheck: invoke('rec:recovery-check'),
  recRead: invoke('rec:read'),

  // Export: { recId | buffer, format: 'mp4'|'gif'|'webm', trim, fps, crf, gifFps, gifWidth, askWhere, durationHint }
  // Resolves to { success, path } | { canceled } | { success:false, error }
  exportMedia: invoke('export:run'),
  cancelExport: invoke('export:cancel'),
  onExportProgress: (cb) => {
    const handler = (_event, progress) => cb(progress);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },

  // Screenshots: (ArrayBuffer, fileName, copyToClipboard)
  saveImage: invoke('image:save'),
});
