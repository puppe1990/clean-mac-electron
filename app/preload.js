const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cleanerAPI", {
  scanDefaults: () => ipcRenderer.invoke("scan:defaults"),
  scanPath: (target) => ipcRenderer.invoke("scan:path", target),
  openDirectoryDialog: () => ipcRenderer.invoke("dialog:openDirectory"),
  deleteFiles: (items) => ipcRenderer.invoke("files:delete", items)
});
