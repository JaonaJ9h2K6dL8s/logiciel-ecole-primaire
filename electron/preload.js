const { contextBridge } = require('electron');

// Pont minimal entre le frontend et Electron.
// Les canaux IPC utiles (impressions, sauvegardes, etc.) seront ajoutés au fur et à mesure.
contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
});
