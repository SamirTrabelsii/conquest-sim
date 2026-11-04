// Synthesizes the sound-effect pack into public/sfx/*.wav (npm run sfx).
//
// Every sound is built from oscillators, filtered noise and envelopes, so the
// pack is 100% original and licence-free, and identical on every run (the
// noise uses a fixed seed). Replace any file with your own of the same name
// to change a sound; the app and the renderer just load public/sfx/<name>.wav.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const PEAK = 0.89; // about -1 dBFS
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx');

// ---- building blocks ------------------------------------------------------

const buffer = (seconds) => new Float32Array(Math.round(seconds * SR));

// Deterministic white noise (LCG).
let seed = 0x2f6b9a1d;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

// Exponential decay envelope with a short linear attack (seconds).
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

// One-pole low-pass, cutoff in Hz (may change per sample).
const lowpass = () => {
  let y = 0;
  return (x, cutoff) => {
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    y += a * (x - y);
    return y;
  };
};

// Sine with a frequency that may glide: phase is accumulated per sample.
const osc = () => {
  let phase = 0;
  return (freq) => {
    phase += (2 * Math.PI * freq) / SR;
    return Math.sin(phase);
  };
};

// Bell-ish tone: fundamental plus decaying harmonics.
function bell(b, start, freq, length, gain = 1) {
  const o1 = osc();
  const o2 = osc();
  const o3 = osc();
  const s = Math.round(start * SR);
  for (let i = 0; i < length * SR && s + i < b.length; i++) {
    const t = i / SR;
    b[s + i] += gain * (o1(freq) * env(t, 0.004, length / 3) + 0.5 * o2(freq * 2) * env(t, 0.002, length / 6) + 0.25 * o3(freq * 3.01) * env(t, 0.002, length / 10));
  }
}

// Soft square-ish tone (odd harmonics), for the fanfare.
function brass(b, start, freq, length, gain = 1) {
  const oscs = [1, 3, 5, 7].map(() => osc());
  const s = Math.round(start * SR);
  for (let i = 0; i < length * SR && s + i < b.length; i++) {
    const t = i / SR;
    const shape = t < 0.015 ? t / 0.015 : t > length - 0.05 ? Math.max(0, (length - t) / 0.05) : 1;
    let v = 0;
    [1, 3, 5, 7].forEach((h, k) => (v += oscs[k](freq * h) / h));
    b[s + i] += gain * shape * v * 0.8;
  }
}

const note = (name) => {
  const names = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const n = names[name[0]] + (name[1] === '#' ? 1 : 0) + 12 * (Number(name.at(-1)) + 1);
  return 440 * 2 ** ((n - 69) / 12);
};

// ---- the sounds -----------------------------------------------------------

const sounds = {
  // Short bright blip: one per flag during the draw.
  tick() {
    const b = buffer(0.05);
    const o = osc();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = o(2400) * env(t, 0.001, 0.008) + 0.3 * noise() * env(t, 0, 0.002);
    }
    return b;
  },
  // Two-note ding when a fighter locks in.
  lock() {
    const b = buffer(0.6);
    bell(b, 0, note('A5'), 0.5, 0.7);
    bell(b, 0.07, note('E6'), 0.5, 0.6);
    return b;
  },
  // Rising bubble pop: stickers appearing.
  pop() {
    const b = buffer(0.12);
    const o = osc();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = o(280 + 4200 * t) * env(t, 0.002, 0.03);
    }
    return b;
  },
  // Sticker slapped on: noisy smack with a low thump.
  slap() {
    const b = buffer(0.2);
    const lp = lowpass();
    const o = osc();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = lp(noise(), 3500) * env(t, 0.001, 0.025) * 1.6 + 0.8 * o(130 - 200 * t) * env(t, 0.001, 0.05);
    }
    return b;
  },
  // Airy rising sweep: panels and neighbour reveal.
  sweep() {
    const len = 0.45;
    const b = buffer(len);
    const lp1 = lowpass();
    const lp2 = lowpass();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const cutoff = 400 + 5000 * (t / len);
      const n = noise();
      const band = lp1(n, cutoff) - lp2(n, cutoff * 0.35);
      b[i] = band * Math.sin((Math.PI * t) / len) * 2.2;
    }
    return b;
  },
  // Camera whoosh: noise swelling and falling in brightness.
  whoosh() {
    const len = 0.6;
    const b = buffer(len);
    const lp = lowpass();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const shape = Math.sin((Math.PI * t) / len) ** 2;
      b[i] = lp(noise(), 300 + 2600 * shape) * shape * 2.5;
    }
    return b;
  },
  // Soft wooden tap: each shake of the hands.
  tap() {
    const b = buffer(0.09);
    const o = osc();
    const lp = lowpass();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = o(210 - 400 * t) * env(t, 0.001, 0.02) + 0.4 * lp(noise(), 2500) * env(t, 0, 0.004);
    }
    return b;
  },
  // Hands colliding: noise burst plus metallic (inharmonic) ring.
  clash() {
    const b = buffer(0.5);
    const lp = lowpass();
    const partials = [523, 1347, 2210, 3170].map((f) => [f, osc()]);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let ring = 0;
      for (const [f, o] of partials) ring += o(f) * env(t, 0.001, 0.09 + 300 / f / 100);
      b[i] = lp(noise(), 6000) * env(t, 0.001, 0.03) * 1.4 + ring * 0.35;
    }
    return b;
  },
  // Round won: quick bright two-note chime.
  point() {
    const b = buffer(0.45);
    bell(b, 0, note('C6'), 0.35, 0.7);
    bell(b, 0.06, note('G6'), 0.35, 0.6);
    return b;
  },
  // Draw: cartoon bonk, a dropping low tone.
  bonk() {
    const b = buffer(0.25);
    const o = osc();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = o(240 * Math.exp(-t * 7) + 80) * env(t, 0.002, 0.07);
    }
    return b;
  },
  // Duel won: short rising arpeggio.
  fanfare() {
    const b = buffer(0.9);
    ['C5', 'E5', 'G5'].forEach((n, k) => brass(b, k * 0.1, note(n), 0.12, 0.6));
    brass(b, 0.3, note('C6'), 0.5, 0.75);
    bell(b, 0.3, note('C6'), 0.5, 0.25);
    return b;
  },
  // K.O.: deep boom with a crunchy attack.
  impact() {
    const len = 1.1;
    const b = buffer(len);
    const o = osc();
    const lp = lowpass();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const boom = o(38 + 70 * Math.exp(-t * 9)) * env(t, 0.002, 0.28);
      const crunch = lp(noise(), 1800) * env(t, 0.001, 0.06);
      b[i] = Math.tanh(1.8 * (boom + 1.2 * crunch));
    }
    return b;
  },
  // The loser's flag dropping: a falling whistle.
  fall() {
    const len = 1.0;
    const b = buffer(len);
    const o = osc();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const f = 1500 * Math.exp(-t * 1.6) + 220 + 12 * Math.sin(2 * Math.PI * 7 * t);
      b[i] = o(f) * Math.min(1, t / 0.03) * Math.max(0, 1 - t / len) * 0.8;
    }
    return b;
  },
  // Countries counter ticking down.
  count() {
    const b = buffer(0.03);
    const o = osc();
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = o(1700) * env(t, 0.001, 0.006);
    }
    return b;
  },
  // Closing jingle under the follow card.
  jingle() {
    const b = buffer(1.4);
    ['G5', 'C6', 'E6', 'G6'].forEach((n, k) => bell(b, k * 0.12, note(n), 0.8, 0.55));
    bell(b, 0.48, note('C7'), 0.9, 0.25);
    return b;
  },
};

// ---- WAV out ----------------------------------------------------------------

function wav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? PEAK / peak : 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

await mkdir(out, { recursive: true });
for (const [name, make] of Object.entries(sounds)) {
  await writeFile(resolve(out, `${name}.wav`), wav(make()));
  console.log(`[sfx] public/sfx/${name}.wav`);
}
