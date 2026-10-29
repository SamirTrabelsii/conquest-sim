import type { Atlas } from '../engine/atlas';
import type { NeighborGraph } from '../engine/graph';
import type { EpisodePresenter } from '../engine/episode';
import { aliveOwners, type WorldState } from '../engine/world';
import type { BattleModule } from '../battles/types';
import { DuelPanel } from './duelPanel';
import { Hud } from './hud';
import type { MapView } from './mapView';
import { playBattle } from './battleScene';
import { showIntro, showSummary } from './cards';

export function createPresenter(
  stage: HTMLElement,
  atlas: Atlas,
  graph: NeighborGraph,
  state: WorldState,
  map: MapView,
  module: BattleModule,
): EpisodePresenter {
  const hud = new Hud(stage);
  const panel = new DuelPanel(stage);
  const ctx = { atlas, graph, state, map, panel, module };

  return {
    async intro(episode, countriesLeft) {
      hud.setEpisode(episode);
      hud.setCountries(countriesLeft);
      await showIntro(stage, episode, countriesLeft);
    },
    battleStart(_episode, battle, total) {
      hud.setBattle(battle, total);
    },
    async battle(matchup, rng, episode, battle) {
      const record = await playBattle(ctx, matchup, rng, episode, battle);
      hud.setCountries(aliveOwners(state).length);
      return record;
    },
    async summary(summary) {
      await showSummary(stage, atlas, summary);
    },
  };
}
