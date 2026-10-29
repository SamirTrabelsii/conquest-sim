import { theme } from '../theme';
import { config } from '../config';
import type { DuelUI, Fighter, Side } from '../battles/types';
import { h, px } from './dom';
import { duration } from './clock';
import { flagUrl } from './flags';

const sideColor = (side: Side) => (side === 'attacker' ? theme.color.attacker : theme.color.defender);

class FighterCard {
  readonly root: HTMLElement;
  private flag: HTMLImageElement;
  private name: HTMLElement;
  private role: HTMLElement;
  private pips: HTMLElement;

  constructor(private side: Side) {
    const w = theme.size.flagWidth;
    this.flag = h('img', {
      width: px(w),
      height: px(w / config.map.flagAspect),
      objectFit: 'cover',
      borderRadius: px(theme.size.radius / 2),
      border: `6px solid ${sideColor(side)}`,
      display: 'block',
    });
    this.role = h('div', {
      fontFamily: theme.font.body,
      fontWeight: '800',
      fontSize: px(theme.size.small),
      letterSpacing: '0.12em',
      color: sideColor(side),
    }, [side === 'attacker' ? 'ATTACKER' : 'DEFENDER']);
    this.name = h('div', {
      fontFamily: theme.font.display,
      fontSize: px(theme.size.body),
      color: theme.color.text,
      textAlign: 'center',
      lineHeight: '1.05',
      maxWidth: px(w + 80),
    });
    this.pips = h('div', { display: 'flex', gap: px(theme.size.scorePip / 2) });
    this.root = h(
      'div',
      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: px(theme.size.gap / 2), flex: '1' },
      [this.role, this.flag, this.name, this.pips],
    );
  }

  set(fighter: Fighter, target: number): void {
    this.flag.src = flagUrl(fighter.code);
    this.name.textContent = fighter.name;
    // Long names get a smaller size so they stay on two lines at most.
    this.name.style.fontSize = px(fighter.name.length > 18 ? theme.size.small : theme.size.body);
    this.pips.replaceChildren(
      ...Array.from({ length: target }, () =>
        h('div', {
          width: px(theme.size.scorePip),
          height: px(theme.size.scorePip),
          borderRadius: '50%',
          border: `4px solid ${sideColor(this.side)}`,
        }),
      ),
    );
  }

  setScore(n: number): void {
    [...this.pips.children].forEach((pip, i) => {
      (pip as HTMLElement).style.background = i < n ? sideColor(this.side) : 'transparent';
    });
  }

  dim(on: boolean): void {
    this.root.style.opacity = on ? '0.35' : '1';
    this.root.style.filter = on ? 'grayscale(1)' : 'none';
  }
}

export class DuelPanel implements DuelUI {
  readonly root: HTMLElement;
  readonly arena: HTMLElement;
  private title: HTMLElement;
  private captionEl: HTMLElement;
  private cards: Record<Side, FighterCard>;

  constructor(parent: HTMLElement) {
    const { top, height } = theme.layout.duel;
    const g = theme.layout.gutter;
    this.cards = { attacker: new FighterCard('attacker'), defender: new FighterCard('defender') };
    this.title = h('div', {
      fontFamily: theme.font.body,
      fontWeight: '800',
      fontSize: px(theme.size.small),
      letterSpacing: '0.14em',
      color: theme.color.accent,
      textAlign: 'center',
    });
    const vs = h('div', {
      fontFamily: theme.font.display,
      fontSize: px(theme.size.heading),
      color: theme.color.accent,
      alignSelf: 'center',
    }, ['VS']);
    this.arena = h('div', { display: 'flex', justifyContent: 'center', minHeight: px(theme.size.hand) });
    this.captionEl = h('div', {
      fontFamily: theme.font.display,
      fontSize: px(theme.size.body),
      textAlign: 'center',
      minHeight: px(theme.size.body * 1.2),
    });
    this.root = h(
      'div',
      {
        position: 'absolute',
        left: px(g),
        right: px(g),
        top: px(top),
        height: px(height),
        background: theme.color.panel,
        border: `2px solid ${theme.color.panelEdge}`,
        borderRadius: px(theme.size.radius),
        padding: px(theme.size.gap),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        opacity: '0',
      },
      [
        this.title,
        h('div', { display: 'flex', alignItems: 'flex-start' }, [this.cards.attacker.root, vs, this.cards.defender.root]),
        this.arena,
        this.captionEl,
      ],
    );
    parent.appendChild(this.root);
  }

  show(title: string, attacker: Fighter, defender: Fighter, target: number): void {
    this.title.textContent = `${title.toUpperCase()} · FIRST TO ${target}`;
    this.cards.attacker.set(attacker, target);
    this.cards.defender.set(defender, target);
    this.cards.attacker.dim(false);
    this.cards.defender.dim(false);
    this.arena.replaceChildren();
    this.caption('');
    this.root.animate([{ opacity: 0, transform: 'translateY(60px)' }, { opacity: 1, transform: 'none' }], {
      duration: duration(config.timing.panelIn),
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  hide(): void {
    this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration(config.timing.panelOut), fill: 'forwards' });
  }

  setScore(attacker: number, defender: number): void {
    this.cards.attacker.setScore(attacker);
    this.cards.defender.setScore(defender);
  }

  caption(text: string, color: string = theme.color.text): void {
    this.captionEl.textContent = text;
    this.captionEl.style.color = color;
  }

  declare(winner: Side, winnerName: string): void {
    this.cards[winner === 'attacker' ? 'defender' : 'attacker'].dim(true);
    this.caption(`${winnerName} wins!`, sideColor(winner));
  }
}
