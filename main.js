const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const isDev = !app.isPackaged;
const DEV_URL = process.env.DEV_URL || 'http://127.0.0.1:3099';
const PROD_PORT = 3098;

let mainWindow = null;
let nextProcess = null;

process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error);
});

function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Serveur frontend non joignable : ' + url));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

function startStandaloneServer() {
  // En production, le build Next standalone est préparé par scripts/prepare-electron.js
  const serverJs = path.join(process.resourcesPath || '', 'app', 'build', 'standalone', 'server.js');
  if (!isDev && require('fs').existsSync(serverJs)) {
    nextProcess = spawn(process.execPath, [serverJs], {
      env: { ...process.env, PORT: String(PROD_PORT), HOSTNAME: '127.0.0.1' },
      stdio: 'inherit',
    });
    return `http://127.0.0.1:${PROD_PORT}`;
  }
  return null;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      if (isDev) {
        await waitForServer(DEV_URL);
        createWindow(DEV_URL);
      } else {
        const url = startStandaloneServer();
        if (url) {
          await waitForServer(url);
          createWindow(url);
        } else {
          console.error('[main] Build standalone introuvable. Exécutez: npm run electron:build');
          app.quit();
        }
      }
    } catch (err) {
      console.error('[main] Démarrage impossible:', err);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('quit', () => {
    if (nextProcess && !nextProcess.killed) nextProcess.kill();
  });
}
