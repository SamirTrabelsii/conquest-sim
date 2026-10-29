import type { BattleModule } from '../battles/types';
import type { EpisodePresenter } from './episode';
import { resolveConquest, type WorldState } from './world';

// Runs an episode with no UI: same engine, same RNG draws, instant battles.
// Used to verify determinism and to preview episodes.
export function headlessPresenter(state: WorldState, module: BattleModule): EpisodePresenter {
  return {
    async intro() {},
    battleStart() {},
    async battle(matchup, rng, episode, battle) {
      return resolveConquest(state, matchup, module.resolve(rng), module.id, episode, battle);
    },
    async summary() {},
  };
}
