# /feature — Add a Feature

Add the described feature to `index.html` following these constraints:

- Read the file first, understand current state
- No external libraries, no server, no build tools
- Integrate into existing cleanup() — any new resource must be released there
- Any new stream/timer/context gets a module-level `let` variable
- Camera overlay position: compute from `camPosition` state (`br`|`bl`|`tr`|`tl`)
- Audio always goes through AudioContext mixer — never raw tracks to MediaRecorder
- Draw loop always uses requestVideoFrameCallback — never rAF or setInterval
- After adding feature, verify mentally: Start → record → Stop → download still works
- Keep UI minimal — no extra dependencies
