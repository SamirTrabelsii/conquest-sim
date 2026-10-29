import { config } from '../config';
import { theme } from '../theme';
import { h, px } from '../ui/dom';
import { duration, wait } from '../ui/clock';
import type { BattleModule, BattleResult, Side } from './types';

type Throw = 'rock' | 'paper' | 'scissors';
const THROWS: Throw[] = ['rock', 'paper', 'scissors'];
const BEATS: Record<Throw, Throw> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const VERB: Record<Throw, string> = {
  rock: 'Rock crushes scissors',
  paper: 'Paper covers rock',
  scissors: 'Scissors cut paper',
};

interface Round {
  attacker: Throw;
  defender: Throw;
  result: Side | 'draw';
}

// Simple original icons, drawn in a 100x100 box.
const ICON: Record<Throw, string> = {
  rock: `<path d="M22 58 L30 32 L52 22 L74 30 L84 52 L76 76 L50 84 L28 76 Z" fill="#b9a68f" stroke="#2b2420" stroke-width="5" stroke-linejoin="round"/>
         <path d="M40 40 L52 36 M60 58 L70 52 M38 64 L46 68" stroke="#2b2420" stroke-width="4" stroke-linecap="round"/>`,
  paper: `<path d="M26 14 H64 L80 30 V86 H26 Z" fill="#f5f1e6" stroke="#2b2420" stroke-width="5" stroke-linejoin="round"/>
          <path d="M64 14 V30 H80" fill="none" stroke="#2b2420" stroke-width="5" stroke-linejoin="round"/>
          <path d="M36 46 H70 M36 58 H70 M36 70 H60" stroke="#9fb0c6" stroke-width="4" stroke-linecap="round"/>`,
  scissors: `<path d="M36 64 L72 16 M64 64 L28 16" stroke="#c9d3df" stroke-width="9" stroke-linecap="round"/>
             <circle cx="32" cy="76" r="13" fill="none" stroke="${theme.color.attacker}" stroke-width="7"/>
             <circle cx="68" cy="76" r="13" fill="none" stroke="${theme.color.attacker}" stroke-width="7"/>
             <circle cx="50" cy="40" r="4" fill="#2b2420"/>`,
};

function hand(side: Side): HTMLElement {
  const size = theme.size.hand;
  const node = h('div', {
    width: px(size),
    height: px(size),
    borderRadius: '50%',
    background: theme.color.panel,
    border: `6px solid ${side === 'attacker' ? theme.color.attacker : theme.color.defender}`,
    display: 'grid',
    placeItems: 'center',
  });
  return node;
}

function setIcon(node: HTMLElement, t: Throw, mirror: boolean): void {
  const size = theme.size.hand * 0.85;
  node.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="transform:${
    mirror ? 'scaleX(-1)' : 'none'
  }">${ICON[t]}</svg>`;
}

async function shake(nodes: HTMLElement[]): Promise<void> {
  const { rpsShake, rpsShakes } = config.timing;
  const lift = theme.size.hand * 0.18;
  for (const n of nodes)
    n.animate(
      [
        { transform: 'translateY(0)' },
        { transform: `translateY(-${lift}px)` },
        { transform: 'translateY(0)' },
      ],
      { duration: duration(rpsShake / rpsShakes), iterations: rpsShakes, easing: 'ease-in-out' },
    );
  await wait(rpsShake);
}

export const rps: BattleModule = {
  id: 'rps',
  title: 'Rock Paper Scissors',
  target: config.battle.rpsWinsNeeded,

  resolve(rng): BattleResult {
    const score: [number, number] = [0, 0];
    const rounds: Round[] = [];
    const target = config.battle.rpsWinsNeeded;
    while (score[0] < target && score[1] < target) {
      const a = rng.pick(THROWS);
      const d = rng.pick(THROWS);
      const result: Round['result'] = a === d ? 'draw' : BEATS[a] === d ? 'attacker' : 'defender';
      rounds.push({ attacker: a, defender: d, result });
      if (result !== 'draw') score[result === 'attacker' ? 0 : 1]++;
    }
    return { winner: score[0] === target ? 'attacker' : 'defender', score, rounds };
  },

  async animate(result, _attacker, _defender, ui): Promise<void> {
    const left = hand('attacker');
    const right = hand('defender');
    ui.arena.replaceChildren(
      h('div', { display: 'flex', justifyContent: 'space-around', alignItems: 'center', width: '100%' }, [
        left,
        right,
      ]),
    );

    const score: [number, number] = [0, 0];
    for (const round of result.rounds as Round[]) {
      setIcon(left, 'rock', false);
      setIcon(right, 'rock', true);
      ui.caption('Rock… paper… scissors…');
      await shake([left, right]);

      setIcon(left, round.attacker, false);
      setIcon(right, round.defender, true);
      if (round.result === 'draw') {
        ui.caption('Draw — again!', theme.color.textMuted);
        await wait(config.timing.rpsDrawPause);
        continue;
      }
      score[round.result === 'attacker' ? 0 : 1]++;
      ui.setScore(score[0], score[1]);
      const winningThrow = round.result === 'attacker' ? round.attacker : round.defender;
      ui.caption(VERB[winningThrow], round.result === 'attacker' ? theme.color.attacker : theme.color.defender);
      const loserNode = round.result === 'attacker' ? right : left;
      loserNode.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], {
        duration: duration(config.timing.rpsReveal),
      });
      await wait(config.timing.rpsReveal);
    }
  },

  narrate(result, attacker, defender): string[] {
    const name = (side: Side) => (side === 'attacker' ? attacker.name : defender.name);
    return (result.rounds as Round[]).map((r, i) =>
      r.result === 'draw'
        ? `Round ${i + 1}: both throw ${r.attacker} — draw.`
        : `Round ${i + 1}: ${attacker.name} throws ${r.attacker}, ${defender.name} throws ${r.defender}. ` +
          `${VERB[r.result === 'attacker' ? r.attacker : r.defender]} — point ${name(r.result)}.`,
    );
  },
};
