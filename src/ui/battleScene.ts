import type { Atlas } from '../engine/atlas';
import type { NeighborGraph } from '../engine/graph';
import { Rng, episodeSeed } from '../engine/rng';
import {
  aliveOwners,
  countriesOf,
  empireNeighbors,
  landShares,
  resolveConquest,
  territoryOwners,
  type BattleRecord,
  type Matchup,
  type WorldState,
} from '../engine/world';
import { runBattle, type BattleModule, type Fighter, type Side } from '../battles/types';
import { config } from '../config';
import { theme } from '../theme';
import type { MapView } from './mapView';
import type { DuelPanel } from './duelPanel';
import type { Hud } from './hud';
import { wait } from './clock';
import { flash, stamp } from './cards';
import type { Pins } from './pins';
import { storyBadges } from '../engine/stories';

export interface SceneContext {
  stage: HTMLElement;
  atlas: Atlas;
  graph: NeighborGraph;
  state: WorldState;
  map: MapView;
  panel: DuelPanel;
  hud: Hud;
  pins: Pins;
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

// The territory in `candidates` closest to the middle of `target` — where a
// pin or effect should point when two empires meet.
function nearestTo(map: MapView, candidates: number[], target: number[]): number {
  const [[x0, y0], [x1, y1]] = map.regionBounds(target);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const dist = (i: number) => Math.hypot(map.anchor(i)[0] - cx, map.anchor(i)[1] - cy);
  return [...candidates].sort((a, b) => dist(a) - dist(b) || a - b)[0];
}

// Flip delay for flip i of n: fast at first, slowing down into the lock.
function flipDelay(i: number, n: number): number {
  const { drawFastFlip, drawSlowFlip } = config.timing;
  const t = n > 1 ? i / (n - 1) : 1;
  return drawFastFlip + (drawSlowFlip - drawFastFlip) * t * t;
}

// The candidates shown while the draw spins, ending on the real pick. Uses its
// own RNG stream: the visuals never change which countries were drawn.
function flipSequence(pool: string[], pick: string, flips: number, rng: Rng): string[] {
  const seq: string[] = [];
  for (let i = 0; i < flips - 1; i++) {
    // Avoid showing the same flag twice in a row, and the pick just before
    // it locks in — when the pool is big enough to allow it.
    const avoid = new Set([seq[seq.length - 1], i === flips - 2 ? pick : undefined]);
    const choices = pool.filter((c) => !avoid.has(c));
    seq.push(rng.pick(choices.length ? choices : pool));
  }
  seq.push(pick);
  return seq;
}

// Spin through `sequence` on one card while outlining each candidate on the map.
async function spin(ctx: SceneContext, side: Side, sequence: string[], color: string): Promise<void> {
  let mark: SVGPathElement | null = null;
  for (let i = 0; i < sequence.length; i++) {
    const code = sequence[i];
    ctx.panel.setFighter(side, fighter(ctx.atlas, code));
    mark?.remove();
    mark = ctx.map.outline(territoriesOf(ctx, code), color);
    await wait(flipDelay(i, sequence.length));
  }
  mark?.remove();
}

async function drawMatchup(ctx: SceneContext, matchup: Matchup, rng: Rng, hero: boolean) {
  const { panel, map, atlas, state, graph } = ctx;
  const { attacker, defender } = matchup;
  const t = config.timing;
  const a = fighter(atlas, attacker);
  const d = fighter(atlas, defender);
  const badges = storyBadges(atlas, state, matchup);

  panel.show('THE DRAW', ctx.module.target);
  if (hero) {
    panel.caption(`HERO NATION: ${a.name.toUpperCase()}`, 'accent');
  } else {
    panel.caption('RANDOM ATTACKER…', 'accent');
    const pool = aliveOwners(state);
    await spin(ctx, 'attacker', flipSequence(pool, attacker, config.draw.attackerFlips, rng), theme.color.attacker);
  }
  panel.setFighter('attacker', a, true);
  panel.setBadge('attacker', badges.attacker);
  const atk = territoriesOf(ctx, attacker);
  map.outline(atk, theme.color.attacker);
  panel.caption(`${a.name.toUpperCase()} ATTACKS!`, 'attacker');
  await wait(t.drawLock);

  // Only neighbors can defend: show them all, then spin among them.
  const neighbors = empireNeighbors(atlas, graph, state, attacker);
  const neighborTerritories = neighbors.flatMap((n) => territoriesOf(ctx, n));
  const dashes = neighbors.map((n) =>
    map.outline(territoriesOf(ctx, n), theme.color.accent, { width: theme.size.neighborWidth, dash: '10 6' }),
  );
  panel.caption(neighbors.length === 1 ? 'ONLY 1 NEIGHBOR CAN DEFEND' : `1 OF ${neighbors.length} NEIGHBORS DEFENDS`);
  await map.focus(map.regionBounds([...neighborTerritories, ...frontline(ctx, atk, neighborTerritories)]), t.zoomIn);
  await wait(t.neighborsShow);

  const flips = Math.min(config.draw.defenderFlipsMax, Math.max(1, neighbors.length * 2));
  await spin(ctx, 'defender', flipSequence(neighbors, defender, flips, rng), theme.color.defender);
  dashes.forEach((p) => p.remove());
  panel.setFighter('defender', d, true);
  panel.setBadge('defender', badges.defender);
  map.outline(territoriesOf(ctx, defender), theme.color.defender);
  panel.caption(`${d.name.toUpperCase()} MUST DEFEND!`, 'defender');
  await wait(t.drawLock);
}

// Draw, fight, fall, zoom out. Applies the conquest to ctx.state at the moment
// it is shown and returns the battle record.
export async function playBattle(
  ctx: SceneContext,
  matchup: Matchup,
  rng: Rng,
  episode: number,
  battle: number,
): Promise<BattleRecord> {
  const { atlas, map, panel, module, state, hud, pins } = ctx;
  const t = config.timing;
  const drawRng = new Rng(episodeSeed(config.episode.seed, episode * 1000 + battle));
  await drawMatchup(ctx, matchup, drawRng, config.battle.heroCountry === matchup.attacker);

  const atk = territoriesOf(ctx, matchup.attacker);
  const def = territoriesOf(ctx, matchup.defender);
  const atkFront = frontline(ctx, atk, def);
  const defFront = frontline(ctx, def, atk);
  await map.focus(map.regionBounds([...def, ...atkFront]), t.zoomIn);

  const a = fighter(atlas, matchup.attacker);
  const d = fighter(atlas, matchup.defender);
  // Spotlight the two fighters and pin their names on the map.
  const pinAt = (front: number[], enemy: number[]) => map.toScreen(map.anchor(nearestTo(map, front, enemy)));
  await map.spotlight([...atk, ...def], t.spotlight);
  pins.show([
    { label: a.name.toUpperCase(), color: theme.color.attacker, textColor: theme.color.onAttacker, at: pinAt(atkFront, def) },
    { label: d.name.toUpperCase(), color: theme.color.defender, textColor: theme.color.onDefender, at: pinAt(defFront, atk) },
  ]);
  panel.setHeader(`${module.title.toUpperCase()} · FIRST TO ${module.target}`);
  panel.caption('FIGHT!', 'accent');
  await wait(t.matchupIntro);

  const result = await runBattle(module, a, d, rng, panel);
  const attackerWon = result.winner === 'attacker';
  const [winner, loser] = attackerWon ? [a, d] : [d, a];
  panel.declare(result.winner, winner.name);
  await wait(t.duelResult);

  const loserTerritories = attackerWon ? def : atk;
  const gained = landShares(atlas, state).get(loser.code) ?? 0;
  const record = resolveConquest(state, matchup, result, module.id, episode, battle);
  map.clearHighlights();
  await pins.clear();
  panel.caption(`${loser.name.toUpperCase()} FALLS!`, 'accent');
  // The impact frame: stamp, flash, camera punch and shake, then the fall.
  const peel = stamp(ctx.stage, theme.brand.ko);
  flash(ctx.stage);
  await map.punch();
  await map.fall(territoryOwners(atlas, state), loser.code, loserTerritories);
  await peel();

  panel.setHeader(`+${(gained * 100).toFixed(1)}% OF WORLD LAND`);
  panel.caption(`${winner.name.toUpperCase()} TAKES ${loser.name.toUpperCase()}`, result.winner);
  await hud.setCountries(aliveOwners(state).length, true);
  await wait(t.afterConquest);

  panel.hide();
  await map.spotlight(null, t.spotlight);
  await map.home(t.zoomOut);
  return record;
}
