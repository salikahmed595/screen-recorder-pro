const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Allow getDisplayMedia and getUserMedia in Electron
app.commandLine.appendSwitch('enable-features', 'WebRTC-H264WithOpenH264FFmpeg');
app.commandLine.appendSwitch('auto-accept-camera-and-microphone-capture');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 700,
    minHeight: 600,
    title: 'Screen Recorder Pro',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Required for getDisplayMedia to work in Electron
      webSecurity: true,
    },
    backgroundColor: '#0f1117',
    show: false,
  });

  // Grant screen capture + camera + microphone permissions automatically
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem', 'geolocation', 'microphone', 'camera'];
    callback(allowed.includes(permission));
  });

  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    // Let Electron handle screen picker natively
    callback({ video: 'screen' });
  });

  win.loadFile('index.html');

  // Show window once fully loaded (no white flash)
  win.once('ready-to-show', () => win.show());

  // Open external links in default browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Remove default menu bar (keeps the app clean)
Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
