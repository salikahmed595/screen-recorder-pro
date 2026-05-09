# Screen Recorder Pro

A **free screen recorder** with face cam overlay, voice recording, and instant local download.
No server, no upload, no account — everything runs locally.

**Live Demo → [salikahmed595.github.io/screen-recorder-pro](https://salikahmed595.github.io/screen-recorder-pro/)**

---

## Download

| Platform | Link |
|----------|------|
| **Windows .exe** | [Latest Release →](https://github.com/salikahmed595/screen-recorder-pro/releases/latest) |
| **Chrome Extension** | [Download folder →](https://github.com/salikahmed595/screen-recorder-pro/tree/master/chrome-extension) — then Load unpacked |
| **Web App** | Open in Chrome: [salikahmed595.github.io/screen-recorder-pro](https://salikahmed595.github.io/screen-recorder-pro/) |

---

## Installing the Windows App

1. Go to [Releases](https://github.com/salikahmed595/screen-recorder-pro/releases/latest)
2. Download `Screen-Recorder-Pro-Setup.exe`
3. Run it

> **"Windows protected your PC" warning?**
> This appears because the app is not paid-code-signed. It is 100% safe — all source code is public in this repo.
> Click **"More info"** → **"Run anyway"** to proceed.

---

## Installing the Chrome Extension

1. Download this repo: click **Code → Download ZIP** → extract it
2. Open Chrome → go to `chrome://extensions`
3. Toggle **Developer mode** ON (top-right)
4. Click **Load unpacked** → select the `chrome-extension` folder
5. Pin the extension icon → click it to open the recorder

The extension opens a floating window that stays open when you switch tabs — recording continues normally.

---

## Features

| Feature | Detail |
|---|---|
| Screen only | Record any Chrome tab + microphone voice |
| Camera only | Record face cam + voice |
| Screen + Camera | Face cam overlay on screen (Loom-style) |
| Live timer | MM:SS counter with pulsing record dot |
| Audio meter | Real-time mic level visualizer |
| Quality presets | Ultra / High / Medium / Low (1–8 Mbps) |
| Camera position | Bottom-right / Bottom-left / Top-right / Top-left |
| Camera shape | Circle or Rectangle |
| Camera size | Adjustable overlay size (slider) |
| Laser pointer | Highlight areas on screen while recording |
| Pen annotation | Draw on screen during recording |
| Screenshot | Capture a PNG still at any moment |
| Preview before download | Watch recording, then save or discard |
| Keyboard shortcuts | `Space` pause · `Esc` stop · `S` screenshot |
| Local download | `.webm` file saved directly to your computer |
| 100% private | No upload, no cloud, no account required |

---

## How to Use

### Screen only
1. Select **Screen only** → click **Start**
2. Chrome share dialog → **Chrome Tab** → pick the tab to record
3. Allow microphone → 3s countdown → recording starts
4. Switch to that tab and work normally
5. Return here → **Stop** → preview → download

### Camera only
1. Select **Camera only** → click **Start**
2. Allow camera & mic → 3s countdown → recording starts
3. **Stop** → preview → download

### Screen + Camera (face overlay)
1. Select **Screen + Camera** → click **Start**
2. Chrome share dialog → **Chrome Tab** → pick **a different tab** (not this page)
3. Allow camera & mic → 3s countdown → recording starts
4. Switch to the selected tab and work — recorder runs silently in background
5. Return here → **Stop** → preview → download one combined video

> **Note:** Always pick **"Chrome Tab"** in the share dialog, not "Entire Screen". Pick a tab other than the recorder itself.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `Esc` | Stop |
| `S` | Screenshot |

---

## Tech Stack

- Pure HTML + CSS + JavaScript — zero dependencies
- `getDisplayMedia` — screen capture
- `getUserMedia` — camera & microphone
- `MediaRecorder` — video encoding to `.webm`
- `HTMLCanvasElement` + `requestVideoFrameCallback` — compositing (background-tab safe)
- `AudioContext` — echo-free multi-source audio mixing
- Electron — Windows desktop app
- Chrome Extension Manifest V3 — browser extension

---

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 88+ | Full (recommended) |
| Edge 88+ | Full |
| Firefox | Partial |
| Safari | Not supported |

---

## Project Structure

```
screen-recorder-pro/
├── index.html              # Web app (single file)
├── main.js                 # Electron entry point
├── package.json            # Electron build config
├── assets/
│   └── icon.ico            # App icon
├── chrome-extension/
│   ├── manifest.json       # MV3 manifest
│   ├── background.js       # Opens recorder window on click
│   ├── recorder.html       # Extension UI
│   ├── recorder.js         # Recording logic
│   └── icons/              # Extension icons
└── .github/workflows/
    └── build.yml           # GitHub Actions — builds .exe on tag push
```

---

## License

MIT — free to use, modify, and distribute.

---

Made by [salikahmed595](https://github.com/salikahmed595)
