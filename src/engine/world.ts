import type { Atlas } from './atlas';
import type { NeighborGraph } from './graph';
import type { Rng } from './rng';

export interface BattleRecord {
  episode: number;
  battle: number; // 1-based within the episode
  attacker: string;
  defender: string;
  winner: string;
  loser: string;
  module: string;
  score: [number, number]; // attacker, defender
  rounds: unknown[]; // module-specific detail, used for voiceover scripts
  // Countries (original codes) that changed hands.
  transferred: string[];
}

// Everything that persists between episodes. Keyed by original country code:
// a country's territories always move together, so one owner per country.
export interface WorldState {
  version: 1;
  nextEpisode: number;
  owners: Record<string, string>;
  wins: Record<string, number>;
  history: BattleRecord[];
}

export function initialState(atlas: Atlas): WorldState {
  const owners: Record<string, string> = {};
  const wins: Record<string, number> = {};
  for (const code of atlas.countries.keys()) {
    owners[code] = code;
    wins[code] = 0;
  }
  return { version: 1, nextEpisode: 1, owners, wins, history: [] };
}

// Owner of every territory, by territory index (what the map renders).
export function territoryOwners(atlas: Atlas, state: WorldState): string[] {
  return atlas.territories.map((t) => state.owners[t.country]);
}

export function aliveOwners(state: WorldState): string[] {
  return [...new Set(Object.values(state.owners))].sort();
}

export function countriesOf(state: WorldState, owner: string): string[] {
  return Object.keys(state.owners)
    .filter((c) => state.owners[c] === owner)
    .sort();
}

// Other empires sharing a land or sea link with any of owner's territories.
export function empireNeighbors(
  atlas: Atlas,
  graph: NeighborGraph,
  state: WorldState,
  owner: string,
): string[] {
  const result = new Set<string>();
  for (const code of countriesOf(state, owner))
    for (const t of atlas.countries.get(code)!.territories)
      for (const j of graph.links[t]) {
        const other = state.owners[atlas.territories[j].country];
        if (other !== owner) result.add(other);
      }
  return [...result].sort();
}

export interface Matchup {
  attacker: string;
  defender: string;
}

// Attacker: the hero if still alive, else any surviving empire (equal odds).
// Defender: any empire bordering the attacker (equal odds).
export function pickMatchup(
  atlas: Atlas,
  graph: NeighborGraph,
  state: WorldState,
  rng: Rng,
  hero: string | null,
): Matchup | null {
  const alive = aliveOwners(state);
  if (alive.length < 2) return null;
  const attacker = hero && alive.includes(hero) ? hero : rng.pick(alive);
  const defender = rng.pick(empireNeighbors(atlas, graph, state, attacker));
  return { attacker, defender };
}

// Winner absorbs every country the loser holds. Returns those countries.
export function applyConquest(state: WorldState, winner: string, loser: string): string[] {
  const taken = countriesOf(state, loser);
  for (const c of taken) state.owners[c] = winner;
  state.wins[winner] = (state.wins[winner] ?? 0) + 1;
  return taken;
}

// Applies a finished battle to the state and returns its log record.
export function resolveConquest(
  state: WorldState,
  { attacker, defender }: Matchup,
  result: { winner: 'attacker' | 'defender'; score: [number, number]; rounds: unknown[] },
  module: string,
  episode: number,
  battle: number,
): BattleRecord {
  const [winner, loser] = result.winner === 'attacker' ? [attacker, defender] : [defender, attacker];
  const transferred = applyConquest(state, winner, loser);
  return { episode, battle, attacker, defender, winner, loser, module, score: result.score, rounds: result.rounds, transferred };
}

// Share of the world's land area (0..1) held by each surviving empire.
export function landShares(atlas: Atlas, state: WorldState): Map<string, number> {
  const shares = new Map<string, number>();
  for (const t of atlas.territories) {
    const owner = state.owners[t.country];
    shares.set(owner, (shares.get(owner) ?? 0) + t.area / atlas.totalArea);
  }
  return shares;
}
