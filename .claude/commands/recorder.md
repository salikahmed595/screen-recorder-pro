# /recorder — Screen Recorder Dev Skill

You are an expert working on a **pure HTML/JS browser screen recorder** at `index.html`.
No build tools, no frameworks, no server, no npm. Single self-contained file, Chrome only.

## Project snapshot

| Item | Detail |
|------|--------|
| File | `c:\Users\Salik Ahmed\Desktop\extension\index.html` |
| Stack | Vanilla HTML + CSS + JS (ES2022) |
| APIs | `getDisplayMedia`, `getUserMedia`, `MediaRecorder`, `Canvas 2D`, `AudioContext`, `requestVideoFrameCallback` |
| Output | `.webm` (auto-download on stop) |
| Modes | Screen only · Camera only · Screen + Camera |

## Architecture rules (never break these)

1. **Audio**: always route through `AudioContext` → `MediaStreamDestination` — never feed raw tracks directly to `MediaRecorder` when mixing sources.
2. **Canvas draw loop**: always use `requestVideoFrameCallback` (not rAF, not setInterval) — it fires per decoded frame and **works in background tabs**.
3. **Video readiness**: poll `vid.videoWidth > 0` every 50 ms before using dimensions — never rely on events alone.
4. **captureStream timing**: wait ≥ 300 ms after `startDraw()` before calling `composite.captureStream(30)`.
5. **Cleanup**: always stop every track, close AudioContext, cancel vfc callback.
6. **No external dependencies** — no CDN, no libraries.

## Key variables (global state)

```js
recorder      // MediaRecorder instance
chunks        // Blob[] — raw recorded data
screenStream  // getDisplayMedia stream
camStream     // getUserMedia stream
audioCtx      // AudioContext for mixing
drawVid       // off-screen HTMLVideoElement used for vfc
vfcId         // requestVideoFrameCallback id
```

## Canvas composite pattern

```js
// CORRECT pattern
const screenVid = await makeOffscreenVideo(screenStream);
const camVid    = await makeOffscreenVideo(camStream);
composite.width  = screenVid.videoWidth;
composite.height = screenVid.videoHeight;
startDraw(screenVid, camVid);               // vfc loop
await new Promise(r => setTimeout(r, 300)); // first frame settle
const canvasStream = composite.captureStream(30);
videoTrack = canvasStream.getVideoTracks()[0];
```

## Audio mixing pattern

```js
// Mix N streams into ONE track
audioCtx = new AudioContext();
const dest = audioCtx.createMediaStreamDestination();
[screenStream, camStream].forEach(s => {
  if (s?.getAudioTracks().length)
    audioCtx.createMediaStreamSource(s).connect(dest);
});
audioTrack = dest.stream.getAudioTracks()[0];
```

## Common tasks

### Add a feature
Read the relevant section, make the minimal change, test mentally that cleanup() still works.

### Debug black recording
1. Check `composite.width/height` — if 0, `waitForVideo` failed
2. Check vfcId is not null after `startDraw`
3. Check user selected the correct Chrome Tab (not the recorder tab)

### Debug no audio
1. Check `audioCtx.state === 'running'`
2. Check streams have `getAudioTracks().length > 0`
3. For screen mode — mic is grabbed separately via `getUserMedia({audio:true,video:false})`

### Add camera overlay position options
Add `camPosition` state (`br`|`bl`|`tr`|`tl`). In `drawFrame()` compute `cx/cy` from position enum instead of hardcoded bottom-right.

### Change camera overlay shape to circle
```js
ctx.save();
ctx.beginPath();
ctx.arc(cx + cw/2, cy + ch/2, Math.min(cw,ch)/2, 0, Math.PI*2);
ctx.clip();
ctx.drawImage(camVid, cx, cy, cw, cw); // square crop
ctx.restore();
```

## What NOT to do

- Do NOT use `requestAnimationFrame` for the draw loop (pauses in background tabs)
- Do NOT use `setInterval` for the draw loop (throttled in background tabs)
- Do NOT pass multiple audio tracks directly to `MediaRecorder` stream (only first is recorded)
- Do NOT call `captureStream` before canvas has real pixels
- Do NOT convert to MP4 or use any codec other than `video/webm`
- Do NOT add any server, backend, or external API calls

## User's preferred flow for Screen+Camera

1. Start → Chrome share dialog → **Chrome Tab** → pick target tab (NOT recorder tab)
2. Allow camera & mic → 3s countdown → recording
3. User switches to recorded tab, works normally (recorder stays in background)
4. Return here → Stop → .webm downloads with screen + face overlay

## Response style for this project

- Read the file before editing
- Make surgical edits (Edit tool), not full rewrites unless restructuring
- No comments unless the WHY is non-obvious
- No trailing summaries — just show what changed and why
