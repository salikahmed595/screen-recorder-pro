const {
  app, BrowserWindow, Menu, Tray, shell, desktopCapturer, ipcMain, dialog,
  globalShortcut, nativeImage, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { parseDurationSeconds, parseProgressSeconds, makeFileName, expectedOutputSeconds, normalizeTrim } = require('./lib/helpers');
const { buildArgs, crfForBitrate } = require('./lib/ffmpeg-args');

const ffmpegPath = process.env.FFMPEG_PATH ||
  require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

app.commandLine.appendSwitch('enable-features', 'WebRTC-H264WithOpenH264FFmpeg');
app.commandLine.appendSwitch('auto-accept-camera-and-microphone-capture');
// The recorder window is minimized while recording; without these Chromium would
// throttle its timers / video callbacks and starve the camera-overlay compositor.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Global hotkeys. Ctrl+Shift+F9..F11 — deliberately obscure so we never steal a
// shortcut other apps rely on (a global shortcut is system-wide while we run).
const HOTKEYS = [
  { action: 'toggle',     accelerator: 'CommandOrControl+Shift+F9',  label: 'Start / stop recording' },
  { action: 'pause',      accelerator: 'CommandOrControl+Shift+F10', label: 'Pause / resume' },
  { action: 'screenshot', accelerator: 'CommandOrControl+Shift+F11', label: 'Screenshot' },
];
const hotkeyStatus = {};

let win = null;
let tray = null;
let isRecording = false;
let forceQuit = false;

// ── Persistent settings (only things the main process must know) ─────────
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
function loadSettings() {
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch (_) { settings = {}; }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (_) { /* non-fatal */ }
}
function saveDir() {
  const dir = settings.saveDir || path.join(app.getPath('videos'), 'Screen Recorder Pro');
  return dir;
}
function ensureSaveDir() {
  const dir = saveDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
// Never overwrite an existing file when auto-saving: "name.mp4" → "name (2).mp4"
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

// ── Window ───────────────────────────────────────────────────────────────
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
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0b0d0a',
    show: false,
  });

  const ses = win.webContents.session;

  // Only the permissions a recorder actually needs.
  const allowedPermissions = ['media', 'display-capture', 'clipboard-sanitized-write'];
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission));
  });
  ses.setPermissionCheckHandler((webContents, permission) => allowedPermissions.includes(permission));

  // What the renderer picked in our own source picker (see 'sources:select').
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      // Must pass a real DesktopCapturerSource — a 'screen' string is invalid in Electron 20+.
      let src = pendingSource.id ? sources.find((s) => s.id === pendingSource.id) : null;
      // Match by id, not by (localized) name: the first screen is the safe default.
      if (!src) src = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
      if (!src) { callback({}); return; }
      const streams = { video: src };
      // System-audio loopback is supported by Chromium on Windows.
      if (pendingSource.systemAudio && process.platform === 'win32') streams.audio = 'loopback';
      callback(streams);
    } catch (_) {
      try { callback({}); } catch (__) { /* request already settled */ }
    }
  });

  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());

  // Open external links in the default browser, never inside the app, and never navigate away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Closing mid-recording is almost always an accident. The footage is safe on disk either
  // way (it is offered for recovery on next launch), but ask first.
  win.on('close', (e) => {
    if (forceQuit || !isRecording) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Keep recording', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Recording in progress',
      message: 'A recording is still running.',
      detail: 'If you quit now, the footage captured so far can be recovered the next time you open the app.',
    });
    if (choice === 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Actions come from global hotkeys and the tray. executeJavaScript(..., true) marks the
// call as a user gesture, which getDisplayMedia() requires.
function triggerAction(action) {
  if (!win || win.isDestroyed()) return;
  win.webContents
    .executeJavaScript(`window.__srpAction && window.__srpAction(${JSON.stringify(action)})`, true)
    .catch(() => {});
}

function registerHotkeys() {
  for (const hk of HOTKEYS) {
    try {
      hotkeyStatus[hk.action] = globalShortcut.register(hk.accelerator, () => triggerAction(hk.action));
    } catch (_) {
      hotkeyStatus[hk.action] = false;
    }
  }
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  if (icon.isEmpty()) return; // e.g. Linux dev environments without .ico support
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Screen Recorder Pro');
  refreshTray();
  tray.on('click', showWindow);
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(isRecording ? 'Screen Recorder Pro — recording' : 'Screen Recorder Pro');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Screen Recorder Pro', click: showWindow },
    { type: 'separator' },
    {
      label: (isRecording ? 'Stop recording' : 'Start recording') + '  (Ctrl+Shift+F9)',
      click: () => triggerAction('toggle'),
    },
    { label: 'Pause / resume  (Ctrl+Shift+F10)', enabled: isRecording, click: () => triggerAction('pause') },
    { type: 'separator' },
    { label: 'Quit', click: () => { forceQuit = true; app.quit(); } },
  ]));
}

// ── Trust boundary: only our own window may call the IPC API ─────────────
function trusted(event) {
  return !!win && !win.isDestroyed() && event.sender === win.webContents;
}
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted IPC sender');
    return fn(event, ...args);
  });
}

// ── Config / folders ─────────────────────────────────────────────────────
handle('config:get', () => ({
  platform: process.platform,
  version: app.getVersion(),
  saveDir: saveDir(),
  hotkeys: HOTKEYS.map((h) => ({ ...h, registered: !!hotkeyStatus[h.action] })),
}));

handle('config:choose-folder', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose where recordings are saved',
    defaultPath: saveDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  settings.saveDir = r.filePaths[0];
  saveSettings();
  return { saveDir: settings.saveDir };
});

handle('config:open-folder', async () => {
  const dir = ensureSaveDir();
  const err = await shell.openPath(dir);
  return err ? { success: false, error: err } : { success: true };
});

handle('shell:reveal', (e, filePath) => {
  if (typeof filePath === 'string' && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});

// ── Capture sources (our own picker, à la OBS) ───────────────────────────
const pendingSource = { id: null, systemAudio: false };

handle('sources:list', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  let ownId = null;
  try { ownId = win.getMediaSourceId(); } catch (_) { /* older API */ }
  return sources
    .filter((s) => s.id !== ownId) // never offer to record the recorder itself
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'screen' ? -1 : 1));
});

handle('sources:select', (e, { id, systemAudio } = {}) => {
  pendingSource.id = typeof id === 'string' ? id : null;
  pendingSource.systemAudio = !!systemAudio;
  return { ok: true, systemAudioSupported: process.platform === 'win32' };
});

// ── Window / recording state ─────────────────────────────────────────────
handle('win:minimize', () => { if (win && !win.isDestroyed()) win.minimize(); });
handle('win:restore', () => showWindow());
handle('rec:state', (e, recording) => {
  isRecording = !!recording;
  refreshTray();
});

// ── Disk-backed recording (crash recovery + no giant IPC transfers) ──────
// The renderer streams every MediaRecorder chunk here as it arrives. If the app or the
// machine dies mid-recording, the file is still there and is offered on next launch.
const recoveryDir = () => path.join(app.getPath('userData'), 'recovery');
const markerFile = () => path.join(recoveryDir(), 'current.json');
const sessions = new Map(); // id → { file, queue, bytes, startedAt }

function writeMarker(data) {
  try { fs.writeFileSync(markerFile(), JSON.stringify(data)); } catch (_) { /* best effort */ }
}
function readMarker() {
  try { return JSON.parse(fs.readFileSync(markerFile(), 'utf8')); } catch (_) { return null; }
}
function clearMarker(id) {
  const m = readMarker();
  if (!m || m.id === id) { try { fs.unlinkSync(markerFile()); } catch (_) { /* gone already */ } }
}
// Resolve a recording id to its file, refusing anything outside the recovery folder.
function recFile(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const file = path.join(recoveryDir(), `rec-${id}.webm`);
  return fs.existsSync(file) ? file : null;
}

handle('rec:start', () => {
  fs.mkdirSync(recoveryDir(), { recursive: true });
  const id = crypto.randomUUID();
  const file = path.join(recoveryDir(), `rec-${id}.webm`);
  fs.writeFileSync(file, Buffer.alloc(0));
  sessions.set(id, { file, queue: Promise.resolve(), bytes: 0 });
  writeMarker({ id, startedAt: Date.now(), finished: false });
  return { id };
});

handle('rec:chunk', (e, id, data) => {
  const s = sessions.get(id);
  if (!s) return { ok: false, error: 'Unknown recording' };
  const buf = Buffer.from(data);
  // Serialized so chunks always land in order; the promise never rejects so one failed
  // write can't wedge the chain.
  const p = s.queue
    .then(() => fsp.appendFile(s.file, buf))
    .then(() => { s.bytes += buf.length; return { ok: true }; }, (err) => ({ ok: false, error: err.message }));
  s.queue = p;
  return p;
});

handle('rec:finish', async (e, id) => {
  const s = sessions.get(id);
  if (!s) return { ok: false, error: 'Unknown recording' };
  await s.queue;
  const m = readMarker();
  if (m && m.id === id) writeMarker({ ...m, finished: true });
  return { ok: true, bytes: s.bytes };
});

handle('rec:discard', async (e, id) => {
  const s = sessions.get(id);
  if (s) await s.queue;
  sessions.delete(id);
  const file = recFile(id);
  if (file) { try { await fsp.unlink(file); } catch (_) { /* already gone */ } }
  clearMarker(id);
  return { ok: true };
});

// Is there an unsaved recording from a previous run (crash, or app closed on the preview)?
handle('rec:recovery-check', () => {
  const m = readMarker();
  if (!m || sessions.has(m.id)) return null;
  const file = recFile(m.id);
  if (!file) { clearMarker(m.id); return null; }
  const bytes = fs.statSync(file).size;
  if (bytes < 1024) { try { fs.unlinkSync(file); } catch (_) { /* ignore */ } clearMarker(m.id); return null; }
  return { id: m.id, bytes, startedAt: m.startedAt, finished: !!m.finished };
});

const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024 * 1024;
handle('rec:read', async (e, id) => {
  const file = recFile(id);
  if (!file) return { ok: false, error: 'Recording not found' };
  const { size } = await fsp.stat(file);
  // Huge files can still be exported (ffmpeg reads from disk); we just can't preview them.
  if (size > MAX_PREVIEW_BYTES) return { ok: true, tooLarge: true, bytes: size };
  return { ok: true, bytes: size, buffer: await fsp.readFile(file) };
});

// ── Export (MP4 / GIF / WebM) through the bundled ffmpeg ─────────────────
let currentExport = null; // { proc, cancelled }

function runFfmpeg(args, { onProgress, track } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    if (track) track(proc);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    proc.stdout.on('data', (d) => {
      if (!onProgress) return;
      const secs = parseProgressSeconds(d.toString());
      if (secs !== null) onProgress(secs);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(stderr) : reject(new Error(stderr.slice(-2000) || `ffmpeg exited with code ${code}`))));
  });
}

async function probeDuration(file) {
  const stderr = await runFfmpeg(['-hide_banner', '-i', file]).catch((err) => err.message);
  return parseDurationSeconds(stderr);
}

const SAVE_FILTERS = {
  mp4: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  webm: [{ name: 'WebM Video', extensions: ['webm'] }],
  gif: [{ name: 'Animated GIF', extensions: ['gif'] }],
};

handle('export:cancel', () => {
  if (!currentExport) return { ok: false };
  currentExport.cancelled = true;
  try { currentExport.proc && currentExport.proc.kill(); } catch (_) { /* already exited */ }
  return { ok: true };
});

handle('export:run', async (event, opts = {}) => {
  const format = ['mp4', 'gif', 'webm'].includes(opts.format) ? opts.format : null;
  if (!format) return { success: false, error: 'Unsupported format' };
  if (currentExport) return { success: false, error: 'Another export is already running' };

  // 1. Input: the on-disk recording, or (fallback) a buffer from the renderer.
  let input = recFile(opts.recId);
  let tmpInput = null;
  if (!input) {
    if (!opts.buffer) return { success: false, error: 'Recording not found' };
    tmpInput = path.join(os.tmpdir(), `srp-${crypto.randomUUID()}.webm`);
    await fsp.writeFile(tmpInput, Buffer.from(opts.buffer));
    input = tmpInput;
  }

  // 2. Output path: ask, or auto-save into the configured folder.
  const defaultName = makeFileName(format);
  let output;
  if (opts.askWhere === false) {
    output = uniquePath(ensureSaveDir(), defaultName);
  } else {
    const r = await dialog.showSaveDialog(win, {
      title: `Save recording as ${format.toUpperCase()}`,
      defaultPath: path.join(saveDir(), defaultName),
      filters: SAVE_FILTERS[format],
    });
    if (r.canceled || !r.filePath) {
      if (tmpInput) fs.unlink(tmpInput, () => {});
      return { canceled: true };
    }
    output = r.filePath;
  }

  // 3. Encode, reporting progress.
  const total = expectedOutputSeconds(opts.trim, opts.durationHint);
  const job = { proc: null, cancelled: false };
  currentExport = job;
  try {
    const args = buildArgs(format, {
      input,
      output,
      fps: opts.fps,
      crf: crfForBitrate(opts.bitrate),
      bitrate: opts.bitrate,
      width: opts.gifWidth,
      trim: opts.trim,
      ...(format === 'gif' ? { fps: opts.gifFps } : {}),
    });
    await runFfmpeg(args, {
      track: (proc) => { job.proc = proc; },
      onProgress: (secs) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('export:progress', { seconds: secs, percent: total ? Math.min(99, (secs / total) * 100) : null });
        }
      },
    });

    // Verify what we wrote — silent corruption is exactly what this pipeline exists to prevent.
    const { size } = await fsp.stat(output);
    if (size === 0) throw new Error('The exported file is empty.');
    if (format !== 'gif') {
      const duration = await probeDuration(output);
      const minimum = normalizeTrim(opts.trim).duration !== null ? 0.05 : 0.5;
      if (!duration || duration < minimum) {
        throw new Error('Converted file has no valid duration — export did not complete cleanly.');
      }
    }
    return { success: true, path: output, bytes: size };
  } catch (err) {
    fs.unlink(output, () => {}); // never leave a half-written file behind
    if (job.cancelled) return { canceled: true, cancelledExport: true };
    return { success: false, error: err.message };
  } finally {
    currentExport = null;
    if (tmpInput) fs.unlink(tmpInput, () => {});
  }
});

// ── Screenshots ──────────────────────────────────────────────────────────
handle('image:save', async (e, data, name, copyToClipboard) => {
  const buf = Buffer.from(data);
  const safeName = path.basename(typeof name === 'string' && name ? name : makeFileName('png', new Date(), 'Screenshot'));
  const file = uniquePath(ensureSaveDir(), safeName);
  await fsp.writeFile(file, buf);
  let copied = false;
  if (copyToClipboard) {
    try {
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) { clipboard.writeImage(img); copied = true; }
    } catch (_) { /* clipboard unavailable */ }
  }
  return { success: true, path: file, copied };
});

// ── App lifecycle ────────────────────────────────────────────────────────
Menu.setApplicationMenu(null); // keeps the app clean

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    loadSettings();
    createWindow();
    registerHotkeys();
    buildTray();
  });

  app.on('before-quit', () => { forceQuit = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
