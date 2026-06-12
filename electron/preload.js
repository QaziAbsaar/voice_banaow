const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openModelsFolder: () => ipcRenderer.invoke('open-models-folder'),
  openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
});
