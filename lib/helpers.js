'use strict';
// Pure helpers shared by the Electron main process and the test-suite.
// Nothing in here touches Electron or the filesystem, so it is trivially testable.

// Pulls "Duration: HH:MM:SS.xx" out of ffmpeg's stderr banner. Returns seconds, or null.
function parseDurationSeconds(stderr) {
  const m = String(stderr || '').match(/Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/);
  if (!m) return null;
  const frac = Number('0.' + m[4]);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

// Reads the most recent "out_time_us=" / "out_time_ms=" value from `ffmpeg -progress`
// output (both are microseconds). Returns seconds, or null if there is none yet.
function parseProgressSeconds(chunk) {
  const re = /out_time_(?:us|ms)=(-?\d+)/g;
  let last = null;
  let m;
  while ((m = re.exec(String(chunk || '')))) last = Number(m[1]);
  if (last === null || last < 0) return null;
  return last / 1e6;
}

function pad(n) { return String(n).padStart(2, '0'); }

// "Screen Recorder Pro 2026-10-08 20-45-12.mp4" — sortable, and valid on every OS.
function makeFileName(ext, date = new Date(), prefix = 'Screen Recorder Pro') {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${prefix} ${d}.${String(ext).replace(/^\./, '')}`;
}

function clamp(n, min, max, fallback) {
  n = Number(n);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Normalises a { start, end } trim request coming from the UI (seconds).
// end === null means "to the end of the recording".
function normalizeTrim(trim) {
  let start = clamp(trim && trim.start, 0, 1e6, 0);
  if (start < 0.05) start = 0;
  let end = null;
  if (trim && trim.end !== null && trim.end !== undefined && trim.end !== '') {
    const e = Number(trim.end);
    if (Number.isFinite(e) && e > start + 0.05) end = e;
  }
  return {
    start,
    end,
    duration: end !== null ? end - start : null,
    active: start > 0 || end !== null,
  };
}

// Seconds the output will last, if we can tell (used to turn progress into a percentage).
function expectedOutputSeconds(trim, durationHint) {
  const t = normalizeTrim(trim);
  if (t.duration !== null) return t.duration;
  const d = Number(durationHint);
  if (Number.isFinite(d) && d > 0) return Math.max(0, d - t.start) || null;
  return null;
}

module.exports = {
  parseDurationSeconds,
  parseProgressSeconds,
  makeFileName,
  clamp,
  normalizeTrim,
  expectedOutputSeconds,
};
