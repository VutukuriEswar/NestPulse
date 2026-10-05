const { app, BrowserWindow, Menu, Tray, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');

const isDev = !app.isPackaged;

let mainWindow;
let tray = null;
let isQuitting = false;

let locationIntervalId = null;
let currentToken = null;
let currentDeviceId = null;
let currentApiUrl = process.env.NESTPULSE_API_URL || 'http://localhost:5000';

function sendLocationToServer(lat, lng) {
  if (!currentToken || !currentDeviceId) return;

  const body = JSON.stringify({ lat, lng });
  const url = new URL(`${currentApiUrl}/api/devices/${currentDeviceId}/location`);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const req = lib.request({
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`,
      'Content-Length': Buffer.byteLength(body),
    },
  });
  req.on('error', (e) => console.warn('[BG-Location] POST failed:', e.message));
  req.write(body);
  req.end();
}

function startBackgroundLocation() {
  if (locationIntervalId) return;
  if (!currentToken || !currentDeviceId) return;

  const requestLocation = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (e) => reject(e.message),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
          );
        })
      `).then(({ lat, lng }) => {
        sendLocationToServer(lat, lng);
        console.log(`[BG-Location] Sent: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }).catch((e) => console.warn('[BG-Location] Geolocation error:', e));
    }
  };

  requestLocation();
  locationIntervalId = setInterval(requestLocation, 15 * 1000);
  console.log('[BG-Location] Background tracking started');
}

function stopBackgroundLocation() {
  if (locationIntervalId) {
    clearInterval(locationIntervalId);
    locationIntervalId = null;
    console.log('[BG-Location] Stopped');
  }
}

function maybeStart() {
  if (currentToken && currentDeviceId) {
    startBackgroundLocation();
  } else {
    stopBackgroundLocation();
  }
}

ipcMain.on('set-auth-token', (event, token) => {
  currentToken = token;
  maybeStart();
});

ipcMain.on('set-device', (event, deviceId, apiUrl) => {
  currentDeviceId = deviceId || null;
  if (apiUrl) currentApiUrl = apiUrl;
  maybeStart();
});

ipcMain.on('clear-auth-token', () => {
  currentToken = null;
  currentDeviceId = null;
  stopBackgroundLocation();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'NestPulse',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:8081');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (currentToken) startBackgroundLocation();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  try {
    tray = new Tray(iconPath);
  } catch (e) {
    console.warn('[Tray] Icon missing, skipping tray setup.');
    return;
  }

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Open NestPulse',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    { type: 'separator' },
    {
      label: locationIntervalId ? '📍 Location: Active' : '📍 Location: Inactive',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        stopBackgroundLocation();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('NestPulse — Background location active');
  tray.setContextMenu(buildMenu());

  setInterval(() => { if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu()); }, 30000);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackgroundLocation();
});
