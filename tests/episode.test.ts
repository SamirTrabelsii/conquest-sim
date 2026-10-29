import { describe, expect, it } from 'vitest';
import { loadAtlas } from '../src/engine/atlas';
import { buildGraph } from '../src/engine/graph';
import { runEpisode } from '../src/engine/episode';
import { headlessPresenter } from '../src/engine/simulate';
import { narrateEpisode, parseState, serializeState } from '../src/engine/persistence';
import { initialState, type WorldState } from '../src/engine/world';
import { battleModule } from '../src/battles';

const atlas = loadAtlas();
const graph = buildGraph(atlas);
const module = battleModule('rps');
const options = { seed: 20261029, battles: 3, hero: null };

const play = (state: WorldState) => runEpisode(atlas, graph, state, headlessPresenter(state, module), options);

describe('episodes', () => {
  it('plays the configured number of battles and advances the episode', async () => {
    const state = initialState(atlas);
    const summary = await play(state);
    expect(summary.battles).toHaveLength(3);
    expect(state.nextEpisode).toBe(2);
    expect(state.history).toHaveLength(3);
    expect(summary.countriesLeft).toBe(atlas.countries.size - 3);
    for (const b of summary.battles) expect(b.score).toContain(module.target);
  });

  it('same seed + same saved state = identical episode', async () => {
    const state = initialState(atlas);
    await play(state); // episode 1
    const save = serializeState(state);

    const runA = parseState(save, atlas);
    const runB = parseState(save, atlas);
    const a = await play(runA); // episode 2, twice from the same save
    const b = await play(runB);
    expect(a.episode).toBe(2);
    expect(b).toEqual(a);
    expect(serializeState(runB)).toEqual(serializeState(runA));
  });

  it('episode 1 matches the run recorded in the browser', async () => {
    const summary = await play(initialState(atlas));
    expect(summary.battles.map((b) => `${b.attacker}>${b.defender}=${b.winner}`)).toEqual([
      'iq>kw=iq',
      'bd>in=in',
      'pw>ph=pw',
    ]);
  });

  it('rejects a save that does not match the map', () => {
    const state = initialState(atlas);
    delete state.owners.fr;
    expect(() => parseState(serializeState(state), atlas)).toThrow(/missing: fr/);
  });

  it('writes a readable battle log', async () => {
    const state = initialState(atlas);
    const summary = await play(state);
    const text = narrateEpisode(atlas, { episode: 1, seed: options.seed, summary, battles: summary.battles }, battleModule);
    expect(text).toContain('Battle 1: Iraq attacks Kuwait');
    expect(text).toContain('Iraq wins 3–0 and takes Kuwait.');
    expect(text).toContain('To be continued');
  });
});
