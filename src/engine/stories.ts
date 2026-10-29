import type { Atlas } from './atlas';
import { countriesOf, landShares, type Matchup, type WorldState } from './world';
import { config } from '../config';

// Story hooks shown as badges on the fighter cards. Derived only from the
// saved world, so they are deterministic and appear in re-renders too.
export type BadgeKind = 'streak' | 'underdog' | 'empire';

export interface Badge {
  kind: BadgeKind;
  value: number; // wins in a row, land ratio, or countries held
}

export type MatchupBadges = Record<'attacker' | 'defender', Badge | null>;

// Battles won since this empire's last defeat. A defeat eliminates an empire,
// so for a survivor this is simply its win count.
export function winStreak(state: WorldState, code: string): number {
  let streak = 0;
  for (let i = state.history.length - 1; i >= 0; i--) {
    const b = state.history[i];
    if (b.winner === code) streak++;
    else if (b.loser === code) break;
  }
  return streak;
}

// At most one badge per side, by priority: streak, underdog, empire.
export function storyBadges(atlas: Atlas, state: WorldState, { attacker, defender }: Matchup): MatchupBadges {
  const { streakMin, underdogRatio, empireMin } = config.story;
  const shares = landShares(atlas, state);
  const badge = (code: string, rival: string): Badge | null => {
    const streak = winStreak(state, code);
    if (streak >= streakMin) return { kind: 'streak', value: streak };
    const ratio = (shares.get(rival) ?? 0) / (shares.get(code) || Number.MIN_VALUE);
    if (ratio >= underdogRatio) return { kind: 'underdog', value: ratio };
    const held = countriesOf(state, code).length;
    if (held >= empireMin) return { kind: 'empire', value: held };
    return null;
  };
  return { attacker: badge(attacker, defender), defender: badge(defender, attacker) };
}
