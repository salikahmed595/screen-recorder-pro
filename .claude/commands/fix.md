# /fix — Quick Fix Mode

Diagnose and fix the issue described, following these rules for this screen recorder project:

1. Read `index.html` first — never guess the current state
2. Apply the minimal surgical change using Edit tool
3. Verify cleanup() still handles the changed state
4. Check these common root causes first:
   - Black video → canvas dimensions 0, or user shared wrong tab
   - No audio → mic not grabbed separately for screen mode, or AudioContext suspended
   - Camera overlay missing → vfcId is null, or camVid.readyState < 2
   - Recording choppy → setInterval/rAF used instead of requestVideoFrameCallback
   - Download empty → chunks[] empty because MediaRecorder never started
5. Fix the root cause, not the symptom
