import { config } from '../config';
import { duration, isVirtual, virtualNow } from './clock';

// Sound cues. The app calls cue() at each moment that should make a sound:
// - in render mode the cue is only recorded, at its exact virtual time; the
//   renderer mixes all cues into the MP4's audio track afterwards;
// - in the browser preview it plays live through Web Audio.

export type Sfx = keyof typeof config.audio.volumes;

export interface Cue {
  t: number; // ms on the episode timeline
  sfx: Sfx;
  rate: number; // playback speed (1 = normal; >1 = higher pitch)
  gain: number; // relative to the sound's configured volume
}

export interface CueOptions {
  rate?: number;
  gain?: number;
  delay?: number; // ms from now (scaled by speed like every other duration)
}

const recorded: Cue[] = [];
let context: AudioContext | null = null;
const buffers = new Map<Sfx, AudioBuffer>();

export function cue(sfx: Sfx, { rate = 1, gain = 1, delay = 0 }: CueOptions = {}): void {
  if (isVirtual()) {
    recorded.push({ t: virtualNow() + duration(delay), sfx, rate, gain });
    return;
  }
  const buffer = buffers.get(sfx);
  if (!context || context.state !== 'running' || !buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const volume = context.createGain();
  volume.gain.value = config.audio.volumes[sfx] * gain;
  source.connect(volume).connect(context.destination);
  source.start(context.currentTime + duration(delay) / 1000);
}

// Every cue so far, in time order (read by the renderer).
export function recordedCues(): Cue[] {
  return [...recorded].sort((a, b) => a.t - b.t);
}

// Live preview: load and decode every sound. Browsers only allow audio after
// a user gesture, so unlockAudio() is called from the Start key / click.
export async function preloadSounds(): Promise<void> {
  if (isVirtual()) return;
  context = new AudioContext();
  await Promise.all(
    (Object.keys(config.audio.volumes) as Sfx[]).map(async (sfx) => {
      try {
        const res = await fetch(`${config.audio.sfxPath}/${sfx}.wav`);
        if (!res.ok) return;
        buffers.set(sfx, await context!.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // A missing or broken file just means that sound stays silent.
      }
    }),
  );
}

export function unlockAudio(): void {
  void context?.resume();
}
