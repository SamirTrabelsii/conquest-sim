// Builds an episode's audio track from the sound cues recorded during the
// render, then adds it to the MP4 (video stream copied, not re-encoded).
//
// Mixing happens here in plain JS (each cue is placed sample-exactly at its
// time, with its pitch), ffmpeg only decodes the sound files and does the
// two-pass loudness normalisation and the final mux.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHANNELS = 2;
const LRA = 11; // loudness range target (LU) for loudnorm

function run(args, { input } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? ok({ stdout: Buffer.concat(out), stderr: err }) : fail(new Error(`ffmpeg failed:\n${err}`))));
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

// Any audio file → interleaved float32 PCM at the mix rate and channel count.
async function decode(file, sampleRate) {
  const { stdout } = await run(['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(CHANNELS), '-ar', String(sampleRate), '-']);
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
}

// Finds public/sfx/<name>.<any extension>, preferring .wav.
async function findSound(dir, name) {
  const files = (await readdir(dir)).filter((f) => f.replace(/\.[^.]+$/, '') === name);
  const pick = files.find((f) => f.endsWith('.wav')) ?? files[0];
  return pick ? resolve(dir, pick) : null;
}

// Adds `src` into `out` at frame `start`, played `rate` times faster (pitch
// up), scaled by `gain`. Linear interpolation between source frames.
function addAt(out, src, start, rate, gain) {
  const srcFrames = src.length / CHANNELS;
  const outFrames = out.length / CHANNELS;
  const length = Math.floor((srcFrames - 1) / rate);
  for (let j = 0; j < length; j++) {
    const o = start + j;
    if (o < 0) continue;
    if (o >= outFrames) break;
    const pos = j * rate;
    const i = Math.floor(pos);
    const f = pos - i;
    for (let c = 0; c < CHANNELS; c++) {
      const a = src[i * CHANNELS + c];
      const b = src[(i + 1) * CHANNELS + c];
      out[o * CHANNELS + c] += gain * (a + (b - a) * f);
    }
  }
}

// Music gain over time: 1, dipping to duck.level around each ducking cue.
function duckEnvelope(frames, cues, audio, sampleRate) {
  const env = new Float32Array(frames).fill(1);
  const { level, attackMs, holdMs, releaseMs } = audio.duck;
  const ms = (x) => Math.round((x / 1000) * sampleRate);
  for (const c of cues.filter((c) => audio.duckOn.includes(c.sfx))) {
    const at = ms(c.t);
    const from = at - ms(attackMs);
    const holdEnd = at + ms(holdMs);
    const to = holdEnd + ms(releaseMs);
    for (let i = Math.max(0, from); i < Math.min(frames, to); i++) {
      let g = level;
      if (i < at) g = 1 - ((1 - level) * (i - from)) / (at - from);
      else if (i > holdEnd) g = level + ((1 - level) * (i - holdEnd)) / (to - holdEnd);
      env[i] = Math.min(env[i], g);
    }
  }
  return env;
}

export async function mixEpisode({ root, cues, audio, seconds }) {
  const { sampleRate } = audio;
  const frames = Math.ceil(seconds * sampleRate);
  const mix = new Float32Array(frames * CHANNELS);
  const sfxDir = resolve(root, 'public', audio.sfxPath.replace(/^\//, ''));

  const cache = new Map();
  const missing = new Set();
  for (const c of cues) {
    if (!cache.has(c.sfx)) {
      const file = existsSync(sfxDir) ? await findSound(sfxDir, c.sfx) : null;
      cache.set(c.sfx, file ? await decode(file, sampleRate) : null);
      if (!file) missing.add(c.sfx);
    }
    const src = cache.get(c.sfx);
    if (src) addAt(mix, src, Math.round((c.t / 1000) * sampleRate), c.rate, audio.volumes[c.sfx] * c.gain);
  }

  if (audio.music) {
    const track = await decode(resolve(root, 'public', audio.music.replace(/^\//, '')), sampleRate);
    const duck = duckEnvelope(frames, cues, audio, sampleRate);
    const fadeFrom = frames - Math.round(audio.fadeOutSeconds * sampleRate);
    const trackFrames = track.length / CHANNELS;
    for (let i = 0; i < frames; i++) {
      const fade = i > fadeFrom ? (frames - i) / (frames - fadeFrom) : 1;
      const k = (i % trackFrames) * CHANNELS; // loops if the track is short
      for (let ch = 0; ch < CHANNELS; ch++) mix[i * CHANNELS + ch] += track[k + ch] * audio.musicVolume * duck[i] * fade;
    }
  }
  return { mix, missing: [...missing] };
}

// Two-pass loudnorm (measure, then apply linearly) and mux into the MP4.
export async function addAudio({ video, mix, audio, workDir }) {
  const raw = resolve(workDir, 'mix.f32');
  await writeFile(raw, Buffer.from(mix.buffer, mix.byteOffset, mix.byteLength));
  const input = ['-f', 'f32le', '-ar', String(audio.sampleRate), '-ac', String(CHANNELS), '-i', raw];
  const target = `I=${audio.loudness}:TP=${audio.truePeak}:LRA=${LRA}`;

  const { stderr } = await run(['-hide_banner', ...input, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const silent = !Number.isFinite(Number(m.input_i));
  const filter = silent
    ? 'anull'
    : `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;

  const tmp = video.replace(/\.mp4$/, '.audio.tmp.mp4');
  await run([
    '-v', 'error', '-y', '-i', video, ...input,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-af', filter, '-ar', String(audio.sampleRate), '-c:a', 'aac', '-b:a', audio.bitrate,
    '-shortest', '-movflags', '+faststart', tmp,
  ]);
  await rename(tmp, video);
  await rm(raw);
  return { loudness: silent ? null : Number(m.input_i) };
}
