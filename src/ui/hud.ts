import { theme } from '../theme';
import { h, px } from './dom';

// Always-on header: brand, episode/battle counter, countries left.
export class Hud {
  private main: HTMLElement;
  private sub: HTMLElement;
  private episode = 0;

  constructor(parent: HTMLElement) {
    const brand = h('div', {
      fontFamily: theme.font.body,
      fontWeight: '800',
      fontSize: px(theme.size.small),
      letterSpacing: '0.3em',
      color: theme.color.accent,
    }, [theme.brand.name]);
    this.main = h('div', {
      fontFamily: theme.font.display,
      fontSize: px(theme.size.heading),
      color: theme.color.text,
      lineHeight: '1.1',
    });
    this.sub = h('div', {
      fontFamily: theme.font.body,
      fontWeight: '700',
      fontSize: px(theme.size.body),
      color: theme.color.textMuted,
    });
    parent.appendChild(
      h('div', {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        height: px(theme.layout.hud.scrimHeight),
        paddingTop: px(theme.layout.hud.top),
        background: theme.color.hudScrim,
        textAlign: 'center',
        textShadow: `0 4px 16px ${theme.color.background}`,
      }, [brand, this.main, this.sub]),
    );
  }

  setEpisode(episode: number): void {
    this.episode = episode;
    this.main.textContent = `EPISODE ${episode}`;
  }

  setBattle(battle: number, total: number): void {
    this.main.textContent = `EPISODE ${this.episode} · BATTLE ${battle}/${total}`;
  }

  setCountries(left: number): void {
    this.sub.textContent = `${left} countries left`;
  }
}
