import { config } from '../config';
import { theme } from '../theme';
import { h, px, sticker, text } from './dom';
import { duration, tween } from './clock';

// Always-on scoreboard: brand, episode, battle, countries left.
export class Hud {
  private episode: HTMLElement;
  private battle: HTMLElement;
  private dots: HTMLElement;
  private count: HTMLElement;
  private countBox: HTMLElement;
  private shown = 0;

  constructor(parent: HTMLElement) {
    const { left, right } = theme.layout.safe;
    const { top, height } = theme.layout.scoreboard;
    const { scoreboard: size, scoreboardPad, gap } = theme.size;
    const c = theme.color;
    const bar = (bg: string, children: (Node | string)[]) =>
      sticker(bg, children, { height: px(height), padding: `0 ${px(scoreboardPad)}` });

    this.episode = text('', 'display', size, c.onAccent);
    this.battle = text('', 'label', theme.size.min, c.accent);
    this.dots = h('div', { display: 'flex', gap: px(gap / 3) });
    this.count = text('', 'display', size, c.text);
    this.countBox = bar(c.ink, [
      this.count,
      h('div', { marginLeft: px(gap / 2) }, [
        text('COUNTRIES', 'label', theme.size.min, c.muted),
        text('LEFT', 'label', theme.size.min, c.muted),
      ]),
    ]);

    parent.appendChild(
      h('div', {
        position: 'absolute',
        top: px(top),
        left: px(left),
        width: px(right - left),
        display: 'flex',
        alignItems: 'center',
        gap: px(gap / 2),
      }, [
        bar(c.ink, [text(theme.brand.name, 'display', size, c.accent)]),
        bar(c.accent, [this.episode]),
        h('div', { flex: '1' }),
        bar(c.ink, [
          h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: px(gap / 3) }, [this.battle, this.dots]),
        ]),
        this.countBox,
      ]),
    );
  }

  setEpisode(episode: number): void {
    this.episode.textContent = `EP ${episode}`;
    this.battle.textContent = 'READY';
    this.setProgress(0, config.episode.battles);
  }

  setBattle(battle: number, total: number): void {
    this.battle.textContent = `BATTLE ${battle}/${total}`;
    this.setProgress(battle, total);
  }

  // One dot per battle: done = filled, current = pulsing, upcoming = hollow,
  // so viewers can see how much of the episode is left.
  private setProgress(current: number, total: number): void {
    const size = px(theme.size.progressDot);
    this.dots.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const dot = h('div', {
          width: size,
          height: size,
          borderRadius: '50%',
          border: `3px solid ${theme.color.accent}`,
          background: n < current ? theme.color.accent : n === current ? theme.color.attacker : 'transparent',
        });
        if (n === current)
          dot.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], {
            duration: duration(config.timing.dotPulse),
            iterations: Infinity,
          });
        return dot;
      }),
    );
  }

  // Counts down to the new value with a flash, so the drop is noticed.
  async setCountries(left: number, animate = false): Promise<void> {
    const from = this.shown;
    this.shown = left;
    if (!animate || from === left) {
      this.count.textContent = String(left);
      return;
    }
    this.countBox.animate(
      [{ background: theme.color.accent }, { background: theme.color.ink }],
      { duration: duration(config.timing.counterTick) },
    );
    await tween(config.timing.counterTick, (t) => {
      this.count.textContent = String(Math.round(from + (left - from) * t));
    });
  }
}
