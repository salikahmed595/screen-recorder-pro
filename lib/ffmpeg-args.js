'use strict';
// Builds ffmpeg argument lists for every export format. Kept free of Electron so the
// exact same arguments can be exercised against a real ffmpeg binary in the tests.
//
// Why the MP4 encode is so defensive (see main.js history): browser screen captures
// have variable frame rate, odd audio layouts and no finalized index. Strict consumers
// (WhatsApp, Google Photos, editors) reject those, so we always re-encode to a clean,
// constant-frame-rate, faststart H.264/AAC file.

const { clamp, normalizeTrim } = require('./helpers');

const num = (n) => String(Math.round(n * 1000) / 1000);

// Common front part: overwrite, quiet banner, machine-readable progress on stdout,
// optional input-side seek (-ss) and output length (-t) for trimming.
function head(input, trim) {
  const t = normalizeTrim(trim);
  const args = ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1'];
  if (t.start > 0) args.push('-ss', num(t.start));
  args.push('-i', input);
  if (t.duration !== null) args.push('-t', num(t.duration));
  return args;
}

function buildMp4Args({ input, output, fps = 30, crf = 20, trim }) {
  return [
    ...head(input, trim),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-r', String(clamp(fps, 5, 120, 30)),
    '-fps_mode', 'cfr',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '5.1',
    '-preset', 'veryfast',
    '-crf', String(clamp(crf, 14, 35, 20)),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-max_muxing_queue_size', '9999',
    output,
  ];
}

// Single-pass GIF with a palette generated from the clip itself (much better colours
// than ffmpeg's default palette). width = 0 keeps the original size; larger-than-source
// widths are never upscaled.
function buildGifArgs({ input, output, fps = 15, width = 640, trim }) {
  const f = clamp(fps, 5, 30, 15);
  const w = Math.round(clamp(width, 0, 7680, 0));
  // h=-1 keeps the exact aspect ratio (GIF, unlike H.264, does not need even dimensions).
  const scale = w > 0 ? `scale=w='min(${w},iw)':h=-1:flags=lanczos,` : '';
  const vf = `fps=${f},${scale}split[s0][s1];` +
             `[s0]palettegen=stats_mode=diff[p];` +
             `[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  return [...head(input, trim), '-vf', vf, '-an', '-loop', '0', output];
}

// Plain save: MediaRecorder WebM has no duration/seek index, so remux it (fast, lossless)
// to get a seekable file. Trimming needs a re-encode to cut on exact frames.
function buildWebmArgs({ input, output, bitrate = 4000000, trim }) {
  const t = normalizeTrim(trim);
  if (!t.active) {
    return ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', '-i', input, '-c', 'copy', output];
  }
  return [
    ...head(input, trim),
    '-c:v', 'libvpx',
    '-b:v', String(clamp(bitrate, 200000, 50000000, 4000000)),
    '-crf', '10',
    '-deadline', 'realtime',
    '-cpu-used', '4',
    '-c:a', 'libopus',
    output,
  ];
}

// Maps the recording bitrate choice in the UI to a sensible x264 CRF — there is no point
// spending bits the source never had.
function crfForBitrate(bitrate) {
  const b = Number(bitrate);
  if (b >= 8000000) return 18;
  if (b >= 4000000) return 20;
  if (b >= 2000000) return 23;
  return 26;
}

function buildArgs(format, opts) {
  switch (format) {
    case 'mp4': return buildMp4Args(opts);
    case 'gif': return buildGifArgs(opts);
    case 'webm': return buildWebmArgs(opts);
    default: throw new Error(`Unsupported export format: ${format}`);
  }
}

module.exports = { buildArgs, buildMp4Args, buildGifArgs, buildWebmArgs, crfForBitrate };
