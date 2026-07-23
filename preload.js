const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // buffer: ArrayBuffer of the recorded WebM. Returns { canceled } or { success, path } or { success:false, error }.
  exportMp4: (buffer, suggestedName) => ipcRenderer.invoke('export-mp4', buffer, suggestedName),
});
