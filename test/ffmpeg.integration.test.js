'use strict';
// Runs the exact argument lists from lib/ffmpeg-args.js against a real ffmpeg binary, using
// a synthetic WebM that behaves like MediaRecorder output (VP8 + Opus, no seek index).
// Skipped automatically when no ffmpeg is available.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildArgs, crfForBitrate } = require('../lib/ffmpeg-args');
const { parseDurationSeconds } = require('../lib/helpers');

function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH];
  try { candidates.push(require('ffmpeg-static')); } catch (_) { /* optional */ }
  candidates.push('ffmpeg');
  for (const c of candidates) {
    if (!c) continue;
    const r = spawnSync(c, ['-version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}

const ffmpeg = findFfmpeg();
const skip = ffmpeg ? false : 'ffmpeg not available';
let dir;
let sample;

function run(args) {
  return spawnSync(ffmpeg, args, { encoding: 'utf8' });
}
function duration(file) {
  return parseDurationSeconds(run(['-hide_banner', '-i', file]).stderr);
}

test('setup: create a 6s synthetic recording', { skip }, () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srp-test-'));
  sample = path.join(dir, 'sample.webm');
  const r = run([
    '-y', '-hide_banner',
    '-f', 'lavfi', '-i', 'testsrc=size=641x361:rate=24:duration=6', // odd size on purpose
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libopus', '-f', 'webm', sample,
  ]);
  assert.equal(r.status, 0, r.stderr);
});

test('mp4: even dimensions, constant fps, correct duration', { skip }, () => {
  const out = path.join(dir, 'out.mp4');
  const r = run(buildArgs('mp4', { input: sample, output: out, fps: 30, crf: crfForBitrate(4e6) }));
  assert.equal(r.status, 0, r.stderr);
  const d = duration(out);
  assert.ok(Math.abs(d - 6) < 0.3, `duration ${d}`);
  const info = run(['-hide_banner', '-i', out]).stderr;
  assert.match(info, /Video: h264 \(High\)/);
  assert.match(info, /yuv420p/);
  assert.match(info, /640x360/); // 641x361 rounded down to even
  assert.match(info, /Audio: aac/);
});

test('mp4 trim produces the requested length', { skip }, () => {
  const out = path.join(dir, 'trim.mp4');
  const r = run(buildArgs('mp4', { input: sample, output: out, trim: { start: 1, end: 4 } }));
  assert.equal(r.status, 0, r.stderr);
  const d = duration(out);
  assert.ok(Math.abs(d - 3) < 0.3, `duration ${d}`);
});

test('gif: valid GIF at the requested width, no upscaling', { skip }, () => {
  const out = path.join(dir, 'out.gif');
  const r = run(buildArgs('gif', { input: sample, output: out, fps: 10, width: 320, trim: { start: 0, end: 2 } }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(out).subarray(0, 3).toString(), 'GIF');
  assert.match(run(['-hide_banner', '-i', out]).stderr, /Video: gif, .*320x180/);

  const big = path.join(dir, 'big.gif');
  const r2 = run(buildArgs('gif', { input: sample, output: big, fps: 5, width: 4000, trim: { end: 1 } }));
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(run(['-hide_banner', '-i', big]).stderr, /Video: gif, .*641x361/); // untouched, exact aspect
});

test('webm remux is lossless and trim re-encodes', { skip }, () => {
  const remux = path.join(dir, 'remux.webm');
  let r = run(buildArgs('webm', { input: sample, output: remux }));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Math.abs(duration(remux) - 6) < 0.3);

  const cut = path.join(dir, 'cut.webm');
  r = run(buildArgs('webm', { input: sample, output: cut, trim: { start: 2 } }));
  assert.equal(r.status, 0, r.stderr);
  const d = duration(cut);
  assert.ok(Math.abs(d - 4) < 0.4, `duration ${d}`);
});

test('progress output can be parsed while encoding', { skip }, () => {
  const { parseProgressSeconds } = require('../lib/helpers');
  const out = path.join(dir, 'p.mp4');
  const r = run(buildArgs('mp4', { input: sample, output: out }));
  assert.equal(r.status, 0, r.stderr);
  const secs = parseProgressSeconds(r.stdout);
  assert.ok(secs !== null && secs > 5, `progress seconds ${secs}`);
});

test('cleanup', { skip }, () => {
  fs.rmSync(dir, { recursive: true, force: true });
});
