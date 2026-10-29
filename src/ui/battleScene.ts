import type { Atlas } from '../engine/atlas';
import type { NeighborGraph } from '../engine/graph';
import type { Rng } from '../engine/rng';
import { countriesOf, resolveConquest, territoryOwners, type BattleRecord, type Matchup, type WorldState } from '../engine/world';
import { runBattle, type BattleModule, type Fighter } from '../battles/types';
import { config } from '../config';
import { theme } from '../theme';
import type { MapView } from './mapView';
import type { DuelPanel } from './duelPanel';
import { wait } from './clock';

export interface SceneContext {
  atlas: Atlas;
  graph: NeighborGraph;
  state: WorldState;
  map: MapView;
  panel: DuelPanel;
  module: BattleModule;
}

export function fighter(atlas: Atlas, code: string): Fighter {
  return { code, name: atlas.countries.get(code)!.name };
}

function territoriesOf(ctx: SceneContext, owner: string): number[] {
  return countriesOf(ctx.state, owner).flatMap((c) => ctx.atlas.countries.get(c)!.territories);
}

// Territories of `owner` that touch any of `enemy`.
function frontline(ctx: SceneContext, owner: number[], enemy: number[]): number[] {
  const enemySet = new Set(enemy);
  return owner.filter((i) => ctx.graph.links[i].some((j) => enemySet.has(j)));
}

// Zoom in, fight, repaint, zoom out. Applies the conquest to ctx.state at the
// moment it is shown and returns the battle record.
export async function playBattle(
  ctx: SceneContext,
  matchup: Matchup,
  rng: Rng,
  episode: number,
  battle: number,
): Promise<BattleRecord> {
  const { atlas, map, panel, module, state } = ctx;
  const t = config.timing;
  const atk = territoriesOf(ctx, matchup.attacker);
  const def = territoriesOf(ctx, matchup.defender);
  const atkFront = frontline(ctx, atk, def);
  const defFront = frontline(ctx, def, atk);

  map.outline(atk, theme.color.attacker);
  map.outline(def, theme.color.defender);
  await map.focus(map.regionBounds([...def, ...atkFront]), t.zoomIn);

  const a = fighter(atlas, matchup.attacker);
  const d = fighter(atlas, matchup.defender);
  panel.show(module.title, a, d, module.target);
  await wait(t.matchupIntro);

  const result = await runBattle(module, a, d, rng, panel);
  const attackerWon = result.winner === 'attacker';
  const [winner, loser] = attackerWon ? [a, d] : [d, a];
  panel.declare(result.winner, winner.name);
  await wait(t.duelResult);

  // The winner's flag spreads from its frontline territory nearest the loser.
  const loserTerritories = attackerWon ? def : atk;
  const front = attackerWon ? atkFront : defFront;
  const loserRegion = map.regionBounds(loserTerritories);
  const target: [number, number] = [
    (loserRegion[0][0] + loserRegion[1][0]) / 2,
    (loserRegion[0][1] + loserRegion[1][1]) / 2,
  ];
  const dist = (i: number) => Math.hypot(map.anchor(i)[0] - target[0], map.anchor(i)[1] - target[1]);
  const originTerritory = [...front].sort((x, y) => dist(x) - dist(y) || x - y)[0];

  const record = resolveConquest(state, matchup, result, module.id, episode, battle);
  map.clearHighlights();
  panel.caption(`${winner.name} conquers ${loser.name}!`, theme.color.accent);
  await map.conquer(territoryOwners(atlas, state), map.anchor(originTerritory), loserRegion, t.conquest);
  await wait(t.afterConquest);

  panel.hide();
  await map.home(t.zoomOut);
  return record;
}
