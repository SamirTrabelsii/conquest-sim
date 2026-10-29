import type { Atlas } from '../engine/atlas';
import type { NeighborGraph } from '../engine/graph';
import type { EpisodePresenter } from '../engine/episode';
import type { WorldState } from '../engine/world';
import type { BattleModule } from '../battles/types';
import { DuelPanel } from './duelPanel';
import { Hud } from './hud';
import { Pins } from './pins';
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
  const ctx = { stage, atlas, graph, state, map, panel, hud, pins: new Pins(stage), module };

  return {
    async intro(episode, countriesLeft) {
      hud.setEpisode(episode);
      await hud.setCountries(countriesLeft);
      await showIntro(stage, episode, countriesLeft);
    },
    battleStart(_episode, battle, total) {
      hud.setBattle(battle, total);
    },
    battle(matchup, rng, episode, battle) {
      return playBattle(ctx, matchup, rng, episode, battle);
    },
    async summary(summary) {
      await showSummary(stage, atlas, summary);
    },
  };
}
