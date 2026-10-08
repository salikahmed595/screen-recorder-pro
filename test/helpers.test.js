'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDurationSeconds, parseProgressSeconds, makeFileName, clamp, normalizeTrim, expectedOutputSeconds,
} = require('../lib/helpers');
const { buildArgs, buildMp4Args, buildGifArgs, buildWebmArgs, crfForBitrate } = require('../lib/ffmpeg-args');

test('parseDurationSeconds reads the ffmpeg banner', () => {
  assert.equal(parseDurationSeconds('  Duration: 00:01:02.50, start: 0.0'), 62.5);
  assert.equal(parseDurationSeconds('Duration: 01:00:00.00'), 3600);
  assert.equal(parseDurationSeconds('no duration here'), null);
  assert.equal(parseDurationSeconds(undefined), null);
});

test('parseProgressSeconds takes the latest value, in seconds', () => {
  const chunk = 'frame=10\nout_time_us=1000000\nprogress=continue\nframe=20\nout_time_us=2500000\n';
  assert.equal(parseProgressSeconds(chunk), 2.5);
  assert.equal(parseProgressSeconds('out_time_ms=4000000'), 4);
  assert.equal(parseProgressSeconds('out_time_us=-9223372036854775807'), null);
  assert.equal(parseProgressSeconds('nothing'), null);
});

test('makeFileName is sortable and OS-safe', () => {
  const name = makeFileName('mp4', new Date(2026, 9, 8, 20, 5, 9));
  assert.equal(name, 'Screen Recorder Pro 2026-10-08 20-05-09.mp4');
  assert.equal(makeFileName('.gif', new Date(2026, 0, 2, 3, 4, 5)), 'Screen Recorder Pro 2026-01-02 03-04-05.gif');
  assert.doesNotMatch(name, /[<>:"/\\|?*]/);
});

test('clamp falls back on garbage and respects bounds', () => {
  assert.equal(clamp('abc', 1, 10, 5), 5);
  assert.equal(clamp(99, 1, 10, 5), 10);
  assert.equal(clamp(-3, 1, 10, 5), 1);
  assert.equal(clamp('7', 1, 10, 5), 7);
});

test('normalizeTrim handles empty, partial and invalid input', () => {
  assert.deepEqual(normalizeTrim(undefined), { start: 0, end: null, duration: null, active: false });
  assert.deepEqual(normalizeTrim({ start: 0.01, end: '' }), { start: 0, end: null, duration: null, active: false });
  assert.deepEqual(normalizeTrim({ start: 2, end: 5 }), { start: 2, end: 5, duration: 3, active: true });
  // end before start is ignored rather than producing a negative length
  assert.deepEqual(normalizeTrim({ start: 5, end: 3 }), { start: 5, end: null, duration: null, active: true });
  assert.equal(normalizeTrim({ start: 'x', end: 'y' }).active, false);
});

test('expectedOutputSeconds supports progress percentages', () => {
  assert.equal(expectedOutputSeconds({ start: 2, end: 5 }, 60), 3);
  assert.equal(expectedOutputSeconds({ start: 10 }, 60), 50);
  assert.equal(expectedOutputSeconds(undefined, 42), 42);
  assert.equal(expectedOutputSeconds(undefined, 0), null);
});

test('mp4 args keep the defensive settings the app relies on', () => {
  const a = buildMp4Args({ input: 'in.webm', output: 'out.mp4', fps: 60, crf: 18 });
  const joined = a.join(' ');
  assert.match(joined, /-r 60/);
  assert.match(joined, /-fps_mode cfr/);
  assert.match(joined, /-crf 18/);
  assert.match(joined, /-profile:v high/);
  assert.match(joined, /-movflags \+faststart/);
  assert.match(joined, /scale=trunc\(iw\/2\)\*2:trunc\(ih\/2\)\*2/);
  assert.equal(a[a.length - 1], 'out.mp4');
  // untrimmed: no seek / length flags
  assert.ok(!a.includes('-ss') && !a.includes('-t'));
});

test('trim adds input-side seek and output length', () => {
  const a = buildMp4Args({ input: 'in.webm', output: 'o.mp4', trim: { start: 1.5, end: 4 } });
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'), '-ss must precede -i');
  assert.equal(a[a.indexOf('-ss') + 1], '1.5');
  assert.equal(a[a.indexOf('-t') + 1], '2.5');
});

test('options are clamped to sane values', () => {
  const a = buildMp4Args({ input: 'i', output: 'o', fps: 9999, crf: -5 });
  assert.equal(a[a.indexOf('-r') + 1], '120');
  assert.equal(a[a.indexOf('-crf') + 1], '14');
  const g = buildGifArgs({ input: 'i', output: 'o', fps: 500, width: 'abc' });
  assert.match(g.join(' '), /fps=30,/);
  assert.doesNotMatch(g.join(' '), /scale=w=/); // width fell back to "original"
});

test('gif args never upscale and use a generated palette', () => {
  const vf = buildGifArgs({ input: 'i', output: 'o.gif', fps: 12, width: 480 })
    .find((x) => x.includes('palettegen'));
  assert.match(vf, /fps=12,scale=w='min\(480,iw\)'/);
  assert.match(vf, /paletteuse/);
});

test('webm without trim is a lossless remux, with trim it re-encodes', () => {
  assert.ok(buildWebmArgs({ input: 'i', output: 'o.webm' }).includes('copy'));
  const t = buildWebmArgs({ input: 'i', output: 'o.webm', trim: { start: 1 } });
  assert.ok(t.includes('libvpx') && !t.includes('copy'));
});

test('buildArgs dispatches and rejects unknown formats', () => {
  assert.ok(buildArgs('mp4', { input: 'i', output: 'o' }).includes('libx264'));
  assert.throws(() => buildArgs('avi', {}), /Unsupported/);
});

test('crfForBitrate maps quality presets', () => {
  assert.deepEqual([8e6, 4e6, 2e6, 1e6].map(crfForBitrate), [18, 20, 23, 26]);
});
