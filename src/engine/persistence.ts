import type { Atlas } from './atlas';
import type { EpisodeSummary } from './episode';
import type { BattleRecord, WorldState } from './world';
import type { BattleModule } from '../battles/types';

export function serializeState(state: WorldState): string {
  return JSON.stringify(state, null, 2);
}

// Parses a saved world and checks it matches this atlas, so a stale or
// hand-edited save fails loudly instead of producing a different episode.
export function parseState(json: string, atlas: Atlas): WorldState {
  const state = JSON.parse(json) as WorldState;
  if (state.version !== 1) throw new Error(`Unsupported save version ${state.version}`);
  const codes = [...atlas.countries.keys()];
  const saved = Object.keys(state.owners);
  const missing = codes.filter((c) => !(c in state.owners));
  const unknown = saved.filter((c) => !atlas.countries.has(c));
  if (missing.length || unknown.length)
    throw new Error(`Save does not match the map (missing: ${missing.join(',')}; unknown: ${unknown.join(',')})`);
  for (const [c, owner] of Object.entries(state.owners))
    if (!atlas.countries.has(owner)) throw new Error(`Save: ${c} owned by unknown country ${owner}`);
  if (!Number.isInteger(state.nextEpisode) || state.nextEpisode < 1) throw new Error('Save: bad nextEpisode');
  return state;
}

export interface EpisodeLog {
  episode: number;
  seed: number;
  summary: EpisodeSummary;
  battles: BattleRecord[];
}

// Plain-English battle log, one paragraph per battle, for voiceover scripts.
export function narrateEpisode(atlas: Atlas, log: EpisodeLog, modules: (id: string) => BattleModule): string {
  const name = (code: string) => atlas.countries.get(code)!.name;
  const lines = [`EPISODE ${log.episode} (seed ${log.seed})`, ''];
  for (const b of log.battles) {
    const module = modules(b.module);
    const a = { code: b.attacker, name: name(b.attacker) };
    const d = { code: b.defender, name: name(b.defender) };
    const result = { winner: b.winner === b.attacker ? ('attacker' as const) : ('defender' as const), score: b.score, rounds: b.rounds };
    const [w, l] = b.winner === b.attacker ? b.score : [b.score[1], b.score[0]];
    lines.push(`Battle ${b.battle}: ${a.name} attacks ${d.name} — ${module.title}, first to ${module.target}.`);
    lines.push(...module.narrate(result, a, d).map((s) => `  ${s}`));
    const taken = b.transferred.map(name).join(', ');
    lines.push(`  ${name(b.winner)} wins ${w}–${l} and takes ${taken}.`, '');
  }
  const s = log.summary;
  lines.push(
    `Countries remaining: ${s.countriesLeft} of ${s.countriesTotal}.`,
    `Most battles won: ${name(s.mostWins.code)} (${s.mostWins.value}).`,
    `Most land controlled: ${name(s.mostLand.code)} (${(s.mostLand.value * 100).toFixed(1)}% of the world).`,
    'To be continued…',
  );
  return lines.join('\n') + '\n';
}
