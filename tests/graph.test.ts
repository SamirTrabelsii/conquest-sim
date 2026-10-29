import { describe, expect, it } from 'vitest';
import { loadAtlas } from '../src/engine/atlas';
import { buildGraph, countryComponents } from '../src/engine/graph';

const atlas = loadAtlas();
const graph = buildGraph(atlas);
const idx = (name: string) => atlas.territories.findIndex((t) => t.name === name);
const countriesNear = (name: string) =>
  new Set(graph.links[idx(name)].map((j) => atlas.territories[j].country));

describe('neighbor graph', () => {
  it('links are symmetric', () => {
    graph.links.forEach((list, i) => list.forEach((j) => expect(graph.links[j]).toContain(i)));
  });

  it('every country can reach every other country', () => {
    const components = countryComponents(atlas, graph);
    expect(components.map((c) => c.slice(0, 5))).toHaveLength(1);
  });

  it('uses land borders', () => {
    expect(countriesNear('France')).toContain('de');
    expect(countriesNear('Tunisia')).toContain('dz');
    expect(countriesNear('Tunisia')).toContain('ly');
  });

  it('links islands to nearby countries', () => {
    expect(countriesNear('Japan')).toContain('ru');
    expect(countriesNear('Japan')).toContain('kr');
    expect(countriesNear('Madagascar')).toContain('mz');
    expect(countriesNear('Sri Lanka')).toContain('in');
    expect(countriesNear('Australia')).toContain('pg');
    // Cyprus only borders Northern Cyprus (same country), so it gets sea links.
    expect(countriesNear('Cyprus').size).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    expect(buildGraph(atlas)).toEqual(graph);
  });
});
