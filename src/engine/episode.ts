import type { Atlas } from './atlas';
import type { NeighborGraph } from './graph';
import { Rng, episodeSeed } from './rng';
import { aliveOwners, landShares, pickMatchup, type BattleRecord, type Matchup, type WorldState } from './world';

export interface EpisodeOptions {
  seed: number;
  battles: number;
  hero: string | null;
}

export interface Standing {
  code: string;
  value: number;
}

export interface EpisodeSummary {
  episode: number;
  battles: BattleRecord[];
  countriesLeft: number;
  countriesTotal: number;
  mostWins: Standing; // all-time battles won
  mostLand: Standing; // share of world land, 0..1
}

// The UI side of an episode. The engine decides everything; the presenter
// only shows it (and applies the conquest at the right moment).
export interface EpisodePresenter {
  intro(episode: number, countriesLeft: number): Promise<void>;
  battleStart(episode: number, battle: number, total: number): void;
  battle(matchup: Matchup, rng: Rng, episode: number, battle: number): Promise<BattleRecord>;
  summary(summary: EpisodeSummary): Promise<void>;
}

export function summarize(atlas: Atlas, state: WorldState, episode: number, battles: BattleRecord[]): EpisodeSummary {
  const alive = aliveOwners(state);
  const shares = landShares(atlas, state);
  // Ties break by land, then alphabetically, so the card is deterministic.
  const byWins = [...alive].sort(
    (a, b) => (state.wins[b] ?? 0) - (state.wins[a] ?? 0) || shares.get(b)! - shares.get(a)! || a.localeCompare(b),
  );
  const byLand = [...alive].sort((a, b) => shares.get(b)! - shares.get(a)! || a.localeCompare(b));
  return {
    episode,
    battles,
    countriesLeft: alive.length,
    countriesTotal: atlas.countries.size,
    mostWins: { code: byWins[0], value: state.wins[byWins[0]] ?? 0 },
    mostLand: { code: byLand[0], value: shares.get(byLand[0])! },
  };
}

export async function runEpisode(
  atlas: Atlas,
  graph: NeighborGraph,
  state: WorldState,
  presenter: EpisodePresenter,
  options: EpisodeOptions,
): Promise<EpisodeSummary> {
  const episode = state.nextEpisode;
  const rng = new Rng(episodeSeed(options.seed, episode));
  await presenter.intro(episode, aliveOwners(state).length);

  const records: BattleRecord[] = [];
  for (let n = 1; n <= options.battles; n++) {
    const matchup = pickMatchup(atlas, graph, state, rng, options.hero);
    if (!matchup) break; // one empire left: the world is conquered
    presenter.battleStart(episode, n, options.battles);
    const record = await presenter.battle(matchup, rng, episode, n);
    state.history.push(record);
    records.push(record);
  }

  state.nextEpisode = episode + 1;
  const summary = summarize(atlas, state, episode, records);
  await presenter.summary(summary);
  return summary;
}
