const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  setAuthToken: (token) => ipcRenderer.send('set-auth-token', token),
  setDevice: (deviceId, apiUrl) => ipcRenderer.send('set-device', deviceId, apiUrl),
  clearAuthToken: () => ipcRenderer.send('clear-auth-token'),
  isElectron: true,
});
