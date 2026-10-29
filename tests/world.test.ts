import { describe, expect, it } from 'vitest';
import { loadAtlas } from '../src/engine/atlas';
import { buildGraph } from '../src/engine/graph';
import { Rng, episodeSeed } from '../src/engine/rng';
import {
  aliveOwners,
  applyConquest,
  empireNeighbors,
  initialState,
  landShares,
  pickMatchup,
} from '../src/engine/world';

const atlas = loadAtlas();
const graph = buildGraph(atlas);

describe('rng', () => {
  it('same seed gives the same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    expect(Array.from({ length: 100 }, () => b.next())).toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('different seeds and episodes differ', () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next());
    expect(episodeSeed(7, 1)).not.toEqual(episodeSeed(7, 2));
  });

  it('int is roughly uniform', () => {
    const rng = new Rng(9);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) counts[rng.int(4)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });
});

describe('world state', () => {
  it('starts with every country owning itself', () => {
    const state = initialState(atlas);
    expect(aliveOwners(state)).toHaveLength(atlas.countries.size);
    const total = [...landShares(atlas, state).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('conquest moves the whole empire and merges neighbors', () => {
    const state = initialState(atlas);
    applyConquest(state, 'fr', 'es');
    expect(state.owners.es).toBe('fr');
    expect(empireNeighbors(atlas, graph, state, 'fr')).toContain('pt');
    applyConquest(state, 'pt', 'fr');
    expect(state.owners.es).toBe('pt');
    expect(state.owners.fr).toBe('pt');
    expect(state.wins.pt).toBe(1);
  });

  it('matchups are deterministic for a seed', () => {
    const run = () => {
      const state = initialState(atlas);
      const rng = new Rng(123);
      return Array.from({ length: 20 }, () => {
        const m = pickMatchup(atlas, graph, state, rng, null)!;
        applyConquest(state, m.attacker, m.defender);
        return m;
      });
    };
    const first = run();
    expect(run()).toEqual(first);
    for (const m of first) expect(m.attacker).not.toBe(m.defender);
  });

  it('hero country always attacks while alive', () => {
    const state = initialState(atlas);
    const rng = new Rng(5);
    for (let i = 0; i < 5; i++) {
      const m = pickMatchup(atlas, graph, state, rng, 'tn')!;
      expect(m.attacker).toBe('tn');
      applyConquest(state, m.attacker, m.defender);
    }
  });
});
