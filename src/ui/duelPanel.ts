import { theme } from '../theme';
import { config } from '../config';
import type { DuelUI, Fighter, Side, Tone } from '../battles/types';
import type { Badge } from '../engine/stories';
import { flagImg, h, px, sticker, stickerEdge, text } from './dom';
import { duration } from './clock';
import { flagUrl } from './flags';

const c = theme.color;
const sideColor = (side: Side) => (side === 'attacker' ? c.attacker : c.defender);
const onSide = (side: Side) => (side === 'attacker' ? c.onAttacker : c.onDefender);
const TONES: Record<Tone, [string, string]> = {
  neutral: [c.ink, c.text],
  attacker: [c.attacker, c.onAttacker],
  defender: [c.defender, c.onDefender],
  accent: [c.accent, c.onAccent],
};

// Spiky star in a 100x100 box, for the round-impact burst.
const BURST_SPIKES = 12;
function starPoints(): string {
  const points: string[] = [];
  for (let i = 0; i < BURST_SPIKES * 2; i++) {
    const r = i % 2 ? 30 : 50;
    const a = (Math.PI * i) / BURST_SPIKES;
    points.push(`${(50 + r * Math.sin(a)).toFixed(1)},${(50 - r * Math.cos(a)).toFixed(1)}`);
  }
  return points.join(' ');
}

class FighterCard {
  readonly root: HTMLElement;
  private flagBox: HTMLElement;
  private name: HTMLElement;
  private badge: HTMLElement;

  constructor(side: Side) {
    const w = theme.size.flagWidth;
    this.flagBox = h('div', {
      width: px(w),
      height: px(w / config.map.flagAspect),
      background: c.ink,
      ...stickerEdge(theme.size.radius / 2),
      borderColor: sideColor(side),
      boxSizing: 'border-box',
      display: 'grid',
      placeItems: 'center',
      overflow: 'hidden',
    });
    this.name = text('', 'display', theme.size.name, c.textOnPaper, {
      textAlign: 'center',
      width: px(w + theme.size.gap),
      minHeight: px(theme.size.name * 2),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    const role = sticker(sideColor(side), [text(side === 'attacker' ? 'ATTACK' : 'DEFEND', 'label', theme.size.min, onSide(side))], {
      padding: `${px(theme.size.gap / 4)} ${px(theme.size.gap)}`,
    });
    // Story badge: a tilted sticker slapped on the flag's bottom corner (the
    // top is taken by the ATTACK / DEFEND label).
    this.badge = h('div', {
      position: 'absolute',
      bottom: px(-theme.size.gap),
      right: px(-theme.size.gap),
      transform: `rotate(${-theme.shape.tilt * 3}deg)`,
      zIndex: '1',
    });
    this.root = h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: px(theme.size.gap / 2) }, [
      role,
      h('div', { position: 'relative' }, [this.flagBox, this.badge]),
      this.name,
    ]);
  }

  setBadge(badge: Badge | null): void {
    this.badge.replaceChildren();
    if (!badge) return;
    const label = theme.brand.badges[badge.kind].replace('{n}', String(Math.round(badge.value)));
    const node = sticker(c.accent, [text(label, 'label', theme.size.min, c.onAccent)], {
      padding: `${px(theme.size.gap / 4)} ${px(theme.size.gap / 2)}`,
      borderRadius: px(theme.size.radius / 2),
    });
    this.badge.appendChild(node);
    node.animate([{ transform: 'scale(2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
      duration: duration(config.timing.stampIn),
      easing: theme.motion.pop,
    });
  }

  // A fighter, or null for the "?" placeholder shown before the draw.
  set(fighter: Fighter | null): void {
    this.setBadge(null);
    if (!fighter) {
      this.flagBox.replaceChildren(text('?', 'display', theme.size.title, c.muted));
      this.name.textContent = '';
      return;
    }
    this.flagBox.replaceChildren(flagImg(flagUrl(fighter.code), theme.size.flagWidth - 2 * theme.shape.stickerWidth));
    this.name.textContent = fighter.name;
    // Long names step down in size so they stay within two lines.
    const n = fighter.name.length;
    const size = n <= 12 ? theme.size.name : n <= 20 ? theme.size.label : theme.size.min;
    this.name.style.fontSize = px(Math.max(size, theme.size.min));
  }

  pop(): void {
    this.flagBox.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
      duration: duration(config.timing.cardPop),
      easing: theme.motion.pop,
    });
  }

  dim(on: boolean): void {
    this.root.style.opacity = on ? '0.4' : '1';
    this.root.style.filter = on ? 'grayscale(1)' : 'none';
  }
}

export class DuelPanel implements DuelUI {
  readonly root: HTMLElement;
  readonly arena: Record<Side, HTMLElement>;
  private header: HTMLElement;
  private headerText: HTMLElement;
  private score: HTMLElement;
  private burst: HTMLElement;
  private pips: Record<Side, HTMLElement>;
  private captionBar: HTMLElement;
  private captionText: HTMLElement;
  private cards: Record<Side, FighterCard>;
  private target = 0;

  constructor(parent: HTMLElement) {
    const { left, right } = theme.layout.safe;
    const { pad, gap, hand } = theme.size;
    this.cards = { attacker: new FighterCard('attacker'), defender: new FighterCard('defender') };
    const slot = () => h('div', { width: px(hand), height: px(hand), alignSelf: 'center' });
    this.arena = { attacker: slot(), defender: slot() };
    this.pips = {
      attacker: h('div', { display: 'flex', gap: px(gap / 3) }),
      defender: h('div', { display: 'flex', gap: px(gap / 3) }),
    };
    this.score = text('', 'display', theme.size.score, c.textOnPaper, { whiteSpace: 'nowrap', position: 'relative' });
    // Starburst behind the score, popped on every decisive round.
    const b = theme.size.burst;
    this.burst = h('div', {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: px(b),
      height: px(b),
      marginLeft: px(-b / 2),
      marginTop: px(-b / 2),
      opacity: '0',
      pointerEvents: 'none',
    });
    const center = h('div', { flex: '1', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'center', gap: px(gap / 2) }, [
      this.burst,
      this.score,
      h('div', { display: 'flex', gap: px(gap) }, [this.pips.attacker, this.pips.defender]),
    ]);

    this.headerText = text('', 'label', theme.size.label, c.onAccent);
    this.header = sticker(c.accent, [this.headerText], { alignSelf: 'flex-start', padding: `${px(gap / 2)} ${px(pad)}` });
    // The one bar allowed to wrap: long country names can need two lines.
    this.captionText = text('', 'display', theme.size.name, c.text, { whiteSpace: 'normal', textAlign: 'center' });
    this.captionBar = sticker(c.ink, [this.captionText], {
      padding: `${px(gap / 2)} ${px(pad)}`,
      minHeight: px(theme.size.name * 1.6),
      justifyContent: 'center',
    });

    this.root = h('div', {
      position: 'absolute',
      left: px(left),
      width: px(right - left),
      top: px(theme.layout.duel.top),
      display: 'flex',
      flexDirection: 'column',
      gap: px(gap),
      opacity: '0',
    }, [
      this.header,
      h('div', {
        background: c.paper,
        padding: `${px(pad)} ${px(gap)}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: px(gap / 2),
        ...stickerEdge(),
      }, [this.cards.attacker.root, this.arena.attacker, center, this.arena.defender, this.cards.defender.root]),
      this.captionBar,
    ]);
    parent.appendChild(this.root);
  }

  show(header: string, target: number): void {
    this.target = target;
    this.headerText.textContent = header;
    this.cards.attacker.set(null);
    this.cards.defender.set(null);
    this.cards.attacker.dim(false);
    this.cards.defender.dim(false);
    this.arena.attacker.replaceChildren();
    this.arena.defender.replaceChildren();
    this.score.textContent = 'VS';
    this.setScore(-1, -1);
    this.caption('');
    this.root.animate([{ opacity: 0, transform: 'translateY(80px)' }, { opacity: 1, transform: 'none' }], {
      duration: duration(config.timing.panelIn),
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  hide(): void {
    this.root.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(80px)' }], {
      duration: duration(config.timing.panelOut),
      easing: 'ease-in',
      fill: 'forwards',
    });
  }

  setHeader(header: string): void {
    this.headerText.textContent = header;
  }

  setFighter(side: Side, fighter: Fighter | null, pop = false): void {
    this.cards[side].set(fighter);
    if (pop) this.cards[side].pop();
  }

  setBadge(side: Side, badge: Badge | null): void {
    this.cards[side].setBadge(badge);
  }

  // Negative scores hide the score and pips (used before the duel starts).
  setScore(attacker: number, defender: number): void {
    if (attacker >= 0) this.score.textContent = `${attacker}–${defender}`;
    for (const side of ['attacker', 'defender'] as const) {
      const n = side === 'attacker' ? attacker : defender;
      this.pips[side].replaceChildren(
        ...(n < 0 ? [] : Array.from({ length: this.target }, (_, i) =>
          h('div', {
            width: px(theme.size.scorePip),
            height: px(theme.size.scorePip),
            transform: `skewX(${theme.shape.skew}deg)`,
            borderRadius: theme.shape.pipRadius,
            border: `4px solid ${sideColor(side)}`,
            background: i < n ? sideColor(side) : 'transparent',
          }),
        )),
      );
    }
  }

  // Round impact: a starburst in the round winner's colour and a score pop.
  impact(result: Side | 'draw'): void {
    const fill = result === 'draw' ? c.muted : sideColor(result);
    this.burst.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><polygon points="${starPoints()}" fill="${fill}" stroke="${c.sticker}" stroke-width="3" stroke-linejoin="round"/></svg>`;
    const ms = duration(config.timing.burst);
    this.burst.animate(
      [
        { transform: 'scale(0.2) rotate(0deg)', opacity: 1 },
        { transform: 'scale(1.1) rotate(25deg)', opacity: 1, offset: 0.5 },
        { transform: 'scale(1.3) rotate(40deg)', opacity: 0 },
      ],
      { duration: ms, easing: 'ease-out' },
    );
    if (result !== 'draw')
      this.score.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: ms, easing: theme.motion.pop });
  }

  caption(content: string, tone: Tone = 'neutral'): void {
    const [bg, fg] = TONES[tone];
    this.captionText.textContent = content;
    this.captionText.style.color = fg;
    this.captionBar.style.background = bg;
  }

  declare(winner: Side, winnerName: string): void {
    this.cards[winner === 'attacker' ? 'defender' : 'attacker'].dim(true);
    this.caption(`${winnerName.toUpperCase()} WINS`, winner);
  }
}
