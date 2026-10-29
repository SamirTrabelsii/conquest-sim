import { config } from '../config';

// Every delay and animation in the app goes through here, scaled by config
// speed. Two modes:
// - real time (browser playback): timers and requestAnimationFrame;
// - virtual (MP4 rendering): time only moves when the renderer calls
//   advance(ms), so every frame is exact no matter how slow capture is.

interface Timer {
  at: number;
  resolve: () => void;
}
interface Tween {
  start: number;
  total: number;
  step: (t: number) => void;
  resolve: () => void;
}

let virtual = false;
let now = 0;
const timers: Timer[] = [];
const tweens: Tween[] = [];
const animations: { anim: Animation; start: number }[] = [];

export function duration(ms: number): number {
  return ms * config.episode.speed;
}

export function wait(ms: number): Promise<void> {
  const total = duration(ms);
  if (virtual) return new Promise((resolve) => timers.push({ at: now + total, resolve }));
  return new Promise((resolve) => setTimeout(resolve, total));
}

// Browsers pause requestAnimationFrame in hidden tabs; fall back to timers so
// an episode never stalls (it just animates choppily until visible again).
const HIDDEN_FRAME_MS = 16;
function nextFrame(cb: (now: number) => void): void {
  if (document.hidden) setTimeout(() => cb(performance.now()), HIDDEN_FRAME_MS);
  else requestAnimationFrame(cb);
}

// Calls step(t) every frame with t going 0 → 1 over ms (scaled by speed).
export function tween(ms: number, step: (t: number) => void): Promise<void> {
  const total = duration(ms);
  if (virtual) return new Promise((resolve) => tweens.push({ start: now, total, step, resolve }));
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (t0: number) => {
      const t = total > 0 ? Math.min(1, (t0 - start) / total) : 1;
      step(t);
      if (t < 1) nextFrame(frame);
      else resolve();
    };
    nextFrame(frame);
  });
}

// Lets awaiting code run (it may schedule new timers, tweens or animations).
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Upper bound on wake-ups within one frame; guards against a zero-length loop.
const MAX_PASSES_PER_FRAME = 1000;

export interface VirtualClock {
  advance(ms: number): Promise<void>;
  now(): number;
}

// Switches the app to virtual time. Must be called before anything animates.
export function useVirtualClock(): VirtualClock {
  virtual = true;
  // Web Animations (pops, shakes, pulses) are paused at creation and then
  // positioned on the virtual timeline every frame.
  const original = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, keyframes, options) {
    const anim = original.call(this, keyframes, options);
    anim.pause();
    anim.currentTime = 0;
    animations.push({ anim, start: now });
    return anim;
  };

  async function advance(ms: number): Promise<void> {
    const target = now + ms;
    // Wake timers in time order; each wake-up may schedule more work.
    for (let pass = 0; pass < MAX_PASSES_PER_FRAME; pass++) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = Math.max(now, next.at);
      next.resolve();
      await settle();
    }
    now = target;

    // Step tweens; finishing ones resolve, which can start new tweens or
    // timers due this same frame, so repeat until nothing more is due.
    for (let pass = 0; pass < MAX_PASSES_PER_FRAME; pass++) {
      let finished = false;
      for (const tw of [...tweens]) {
        const t = tw.total > 0 ? Math.min(1, (now - tw.start) / tw.total) : 1;
        tw.step(t);
        if (t >= 1) {
          tweens.splice(tweens.indexOf(tw), 1);
          tw.resolve();
          finished = true;
        }
      }
      const due = timers.filter((tm) => tm.at <= now);
      for (const tm of due) {
        timers.splice(timers.indexOf(tm), 1);
        tm.resolve();
      }
      if (!finished && !due.length) break;
      await settle();
    }

    for (let i = animations.length - 1; i >= 0; i--) {
      const { anim, start } = animations[i];
      if (anim.playState === 'idle') {
        animations.splice(i, 1); // cancelled
        continue;
      }
      const end = Number(anim.effect?.getComputedTiming().endTime);
      const t = now - start;
      if (Number.isFinite(end) && t >= end) {
        anim.currentTime = end;
        animations.splice(i, 1);
      } else anim.currentTime = t;
    }

    // Before the frame is captured: new flag images must be decoded, and the
    // browser must have drawn this state — transform animations run on the
    // compositor, which can otherwise lag one update behind the screenshot.
    await Promise.all([...document.images].filter((img) => !img.complete).map((img) => img.decode().catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  return { advance, now: () => now };
}
