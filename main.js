const { app, BrowserWindow, Menu, shell, desktopCapturer, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

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
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0f1117',
    show: false,
  });

  // Grant screen capture + camera + microphone permissions automatically
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem', 'geolocation', 'microphone', 'camera'];
    callback(allowed.includes(permission));
  });

  win.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    // Must pass a real DesktopCapturerSource — 'screen' string is invalid in Electron 20+
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const primary = sources.find(s => /screen|display/i.test(s.name)) || sources[0];
    if (primary) callback({ video: primary });
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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d; });
    ff.on('error', reject);
    ff.on('close', code => code === 0 ? resolve(stderr) : reject(new Error(stderr.slice(-2000))));
  });
}

// Pulls "Duration: HH:MM:SS.xx" out of ffmpeg's stderr banner. Returns seconds, or null.
function parseDurationSeconds(stderr) {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/);
  if (!m) return null;
  const [, h, mi, s] = m;
  return (+h) * 3600 + (+mi) * 60 + (+s);
}

// ── Export recorded WebM to a real, fully-indexed, universally-compatible MP4 ─
// Two separate problems, both real-world browser-capture artifacts:
//
// 1. MediaRecorder's native "video/mp4" mode only produces a fragmented MP4
//    with no finalized moov/duration table — most players/editors/upload
//    targets only read the first fragment and treat the rest as corrupt.
//    (Fixed by always recording WebM and transcoding here instead.)
//
// 2. Even a structurally valid MP4 gets rejected by strict mobile consumers
//    like WhatsApp if the encode itself is non-standard. Long browser
//    screen captures drift: canvas/display-capture frame timing is not
//    perfectly even (variable frame rate), the Web Audio mix graph can hand
//    off unusual sample rates/channel layouts, and multi-minute files can
//    overrun ffmpeg's default interleave buffer. Any of these produces a
//    file that plays fine locally but that WhatsApp's stricter validator
//    calls "not supported". The encode below is deliberately defensive:
//      - scale filter forces even width/height (H.264/yuv420p requirement)
//      - -r/-fps_mode cfr rewrites the variable source timestamps into a
//        clean constant frame rate, so duration/seek metadata is sane
//      - -profile:v high -level 5.1 is what modern phones themselves record
//        with, so every consumer (WhatsApp, Instagram, Drive, editors) can
//        decode it
//      - audio is normalized to standard AAC-LC stereo 48kHz
//      - +faststart puts the moov index at the front for instant seeking
//      - a generous muxing queue avoids interleave failures on long files
ipcMain.handle('export-mp4', async (event, arrayBuffer, suggestedName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save recording as MP4',
    defaultPath: suggestedName || `recording-${Date.now()}.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const tmpWebm = path.join(os.tmpdir(), `srp-${crypto.randomUUID()}.webm`);
  fs.writeFileSync(tmpWebm, Buffer.from(arrayBuffer));

  try {
    await runFfmpeg([
      '-y',
      '-i', tmpWebm,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-r', '30',
      '-fps_mode', 'cfr',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-level', '5.1',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '9999',
      filePath,
    ]);

    // Verify the file we just wrote actually has a sane, readable duration
    // before telling the renderer it succeeded — this is exactly the class
    // of silent corruption we're trying to eliminate.
    const probeStderr = await runFfmpeg(['-i', filePath]).catch(err => err.message);
    const duration = parseDurationSeconds(probeStderr);
    if (!duration || duration < 0.5) {
      throw new Error('Converted file has no valid duration — export did not complete cleanly.');
    }

    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    fs.unlink(tmpWebm, () => {});
  }
});

// Remove default menu bar (keeps the app clean)
Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
