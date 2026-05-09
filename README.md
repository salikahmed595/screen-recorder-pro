# 🎬 Screen Recorder Pro

A **free, browser-based screen recorder** with face cam overlay, voice recording, and instant local download. No server, no upload, no account — everything runs in your browser.

**🔴 Live Demo → [salikahmed595.github.io/screen-recorder-pro](https://salikahmed595.github.io/screen-recorder-pro/)**

---

## ✨ Features

| Feature | Detail |
|---|---|
| 🖥️ Screen only | Record any Chrome tab + microphone voice |
| 📷 Camera only | Record face cam + voice |
| 🎬 Screen + Camera | Face cam overlay on screen (Loom-style) |
| ⏱️ Live timer | MM:SS counter with pulsing record dot |
| 🎙️ Audio meter | Real-time mic level visualizer |
| 🎚️ Quality presets | Ultra / High / Medium / Low (1–8 Mbps) |
| 📍 Camera position | Bottom-right / Bottom-left / Top-right / Top-left |
| 🔵 Camera shape | Circle or Rectangle |
| 📏 Camera size | Adjustable overlay size (slider) |
| 🔴 Laser pointer | Highlight areas on screen while recording |
| ✏️ Pen annotation | Draw on screen during recording |
| 📸 Screenshot | Capture a PNG still at any moment |
| 👀 Preview before download | Watch recording in browser, then save or discard |
| ⌨️ Keyboard shortcuts | `Space` pause · `Esc` stop · `S` screenshot |
| 💾 Local download | `.webm` file saved directly to your computer |
| 🔒 100% private | No upload, no cloud, no account required |

---

## 🚀 How to Use

### Option 1 — Open directly (no install)
Open `index.html` in **Google Chrome** — that's it.

### Option 2 — Live web link
Visit: **[salikahmed595.github.io/screen-recorder-pro](https://salikahmed595.github.io/screen-recorder-pro/)**

---

## 📖 Recording Modes

### Screen only
1. Select **Screen only** → click **▶ Start**
2. Chrome share dialog → **Chrome Tab** → pick the tab to record
3. Allow microphone → 3s countdown → recording starts
4. Switch to that tab and work normally
5. Return here → **⏹ Stop** → preview → download

### Camera only
1. Select **Camera only** → click **▶ Start**
2. Allow camera & mic → 3s countdown → recording starts
3. **⏹ Stop** → preview → download

### Screen + Camera (face overlay)
1. Select **Screen + Camera** → click **▶ Start**
2. Chrome share dialog → **Chrome Tab** → pick **a different tab** (not this page)
3. Allow camera & mic → 3s countdown → recording starts
4. Switch to the selected tab and work — recorder runs silently in background
5. Return here → **⏹ Stop** → preview → download one combined video

> ⚠️ **Important:** When picking a tab to share, always choose **"Chrome Tab"** and select a tab OTHER than this recorder. Picking "Entire Screen" will capture your whole desktop.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume recording |
| `Esc` | Stop recording |
| `S` | Take a screenshot |

---

## 🛠️ Tech Stack

- **Pure HTML + CSS + JavaScript** — zero dependencies, zero build tools
- `getDisplayMedia` — screen capture
- `getUserMedia` — camera & microphone
- `MediaRecorder` — video encoding to `.webm`
- `HTMLCanvasElement` + `requestVideoFrameCallback` — real-time compositing (background-tab safe)
- `AudioContext` — echo-free multi-source audio mixing
- **No server, no backend, no npm**

---

## 🌐 Browser Support

| Browser | Support |
|---------|---------|
| ✅ Chrome 88+ | Full support (recommended) |
| ✅ Edge 88+ | Full support |
| ⚠️ Firefox | Partial (no `requestVideoFrameCallback`) |
| ❌ Safari | Not supported (`getDisplayMedia` unavailable) |

---

## 📁 Project Structure

```
screen-recorder-pro/
├── index.html          # Entire app (single file)
├── .claude/
│   └── commands/
│       ├── recorder.md  # /recorder skill — full project context
│       ├── fix.md       # /fix skill — bug diagnosis
│       └── feature.md   # /feature skill — add features
└── README.md
```

---

## 🤝 Contributing

1. Fork this repo
2. Make your changes to `index.html`
3. Open a pull request

---

## 📄 License

MIT — free to use, modify, and distribute.

---

Made with ❤️ by [salikahmed595](https://github.com/salikahmed595)
