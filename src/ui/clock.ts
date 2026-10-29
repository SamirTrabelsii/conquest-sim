import { config } from '../config';

// Every delay and animation in the app goes through here, scaled by config
// speed. Swapping this for a virtual clock later enables frame-exact MP4
// rendering.
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms * config.episode.speed));
}

export function duration(ms: number): number {
  return ms * config.episode.speed;
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
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const t = total > 0 ? Math.min(1, (now - start) / total) : 1;
      step(t);
      if (t < 1) nextFrame(frame);
      else resolve();
    };
    nextFrame(frame);
  });
}
