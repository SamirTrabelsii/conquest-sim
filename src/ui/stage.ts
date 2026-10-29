import { config } from '../config';
import { theme } from '../theme';

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
