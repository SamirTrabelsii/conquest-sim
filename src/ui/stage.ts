import { config } from '../config';
import { theme } from '../theme';
import { h, px } from './dom';

// Fixed-size stage scaled to fit the window. Everything inside is laid out
// in stage pixels, so the output looks identical at any window size.
export function mountStage(stage: HTMLElement): void {
  const { width, height } = config.stage;
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.background = theme.color.background;

  const fit = () => {
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  fit();
  window.addEventListener('resize', fit);
}

// Debug (?safe): tint the areas phone apps cover with their own buttons and
// captions, so layouts can be checked against them.
export function showSafeZones(stage: HTMLElement): void {
  const { width, height } = config.stage;
  const { top, bottom, left, right } = theme.layout.safe;
  const zone = (x: number, y: number, w: number, hh: number) =>
    h('div', {
      position: 'absolute',
      left: px(x),
      top: px(y),
      width: px(w),
      height: px(hh),
      background: theme.color.safeZone,
      pointerEvents: 'none',
      zIndex: '100',
    });
  stage.append(
    zone(0, 0, width, top),
    zone(0, bottom, width, height - bottom),
    zone(0, top, left, bottom - top),
    zone(right, top, width - right, bottom - top),
  );
}

// The Start hint sits outside the stage so it never appears in a recording.
export function startHint(label: string): HTMLElement {
  const hint = h('div', {
    position: 'fixed',
    left: '50%',
    bottom: '16px',
    transform: 'translateX(-50%)',
    ...theme.type.label,
    fontSize: '18px',
    color: theme.color.muted,
    background: theme.color.ink,
    padding: '8px 14px',
    borderRadius: '6px',
    zIndex: '10',
  }, [label]);
  document.body.appendChild(hint);
  return hint;
}
