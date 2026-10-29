import { neighbors } from 'topojson-client';
import type { Geometry, Position } from 'geojson';
import type { Atlas } from './atlas';
import { config } from '../config';

export interface NeighborGraph {
  // links[i] = sorted territory indices adjacent to territory i
  links: number[][];
  // Sea links added for territories without a foreign land border (for debug).
  seaLinks: [number, number][];
}

// Boundary points per territory used for coast-to-coast distances.
const SAMPLE_POINTS = 400;

type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

function toVec([lon, lat]: Position): Vec3 {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

function boundaryPoints(geometry: Geometry): Vec3[] {
  const points: Position[] = [];
  if (geometry.type === 'Polygon') geometry.coordinates.forEach((r) => points.push(...r));
  else if (geometry.type === 'MultiPolygon')
    geometry.coordinates.forEach((p) => p.forEach((r) => points.push(...r)));
  const step = Math.max(1, Math.floor(points.length / SAMPLE_POINTS));
  const sampled: Vec3[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(toVec(points[i]));
  return sampled;
}

// Coast-to-coast distances between territories, as great-circle angles.
// Each territory gets a bounding cap (center + radius) so far-away pairs can
// be skipped without comparing every point.
export class Distances {
  private samples: Vec3[][];
  private centers: Vec3[];
  private radii: number[];

  constructor(atlas: Atlas) {
    this.samples = atlas.territories.map((t) => boundaryPoints(t.feature.geometry));
    this.centers = this.samples.map((pts) => {
      const s = pts.reduce<Vec3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      const n = Math.hypot(...s) || 1;
      return [s[0] / n, s[1] / n, s[2] / n];
    });
    this.radii = this.samples.map((pts, i) => Math.max(...pts.map((p) => angle(p, this.centers[i]))));
  }

  exact(i: number, j: number): number {
    let best = -2;
    for (const p of this.samples[i])
      for (const q of this.samples[j]) {
        const d = dot(p, q);
        if (d > best) best = d;
      }
    return Math.acos(Math.min(1, best));
  }

  // The k territories accepted by `allow` whose coasts are closest to i.
  nearest(i: number, k: number, allow: (j: number) => boolean): { j: number; d: number }[] {
    const candidates = this.samples
      .map((_, j) => j)
      .filter((j) => j !== i && allow(j))
      .map((j) => ({ j, lower: angle(this.centers[i], this.centers[j]) - this.radii[i] - this.radii[j] }))
      .sort((a, b) => a.lower - b.lower || a.j - b.j);
    const best: { j: number; d: number }[] = [];
    for (const { j, lower } of candidates) {
      if (best.length === k && lower > best[k - 1].d) break;
      best.push({ j, d: this.exact(i, j) });
      best.sort((a, b) => a.d - b.d || a.j - b.j);
      if (best.length > k) best.pop();
    }
    return best;
  }
}

export function buildGraph(atlas: Atlas): NeighborGraph {
  const { territories } = atlas;
  const sets = neighbors(atlas.geometries as never).map((list) => new Set(list));
  const distances = new Distances(atlas);
  const seaLinks: [number, number][] = [];
  const link = (i: number, j: number) => {
    if (sets[i].has(j)) return;
    sets[i].add(j);
    sets[j].add(i);
    seaLinks.push([i, j]);
  };

  // 1. Territories without a foreign land border link to the nearest coasts.
  const land = sets.map((s) => [...s]);
  territories.forEach((t, i) => {
    const hasForeignBorder = land[i].some((j) => territories[j].country !== t.country);
    if (hasForeignBorder) return;
    const foreign = (j: number) => territories[j].country !== t.country;
    for (const { j } of distances.nearest(i, config.map.islandLinks, foreign)) link(i, j);
  });

  // 2. Join any isolated cluster (e.g. a small island group) to its nearest
  //    outside territory until every country can reach every other.
  for (;;) {
    const components = countryComponents(atlas, { links: sets.map((s) => [...s]), seaLinks });
    if (components.length === 1) break;
    const smallest = components.reduce((a, b) => (b.length < a.length ? b : a));
    const inside = new Set(smallest);
    let bridge: { i: number; j: number; d: number } | null = null;
    territories.forEach((t, i) => {
      if (!inside.has(t.country)) return;
      const [hit] = distances.nearest(i, 1, (j) => !inside.has(territories[j].country));
      if (hit && (!bridge || hit.d < bridge.d)) bridge = { i, j: hit.j, d: hit.d };
    });
    if (!bridge) throw new Error('Cannot connect neighbor graph');
    const { i, j } = bridge as { i: number; j: number };
    link(i, j);
  }

  return { links: sets.map((s) => [...s].sort((a, b) => a - b)), seaLinks };
}

// Groups of countries that can reach each other through the links.
export function countryComponents(atlas: Atlas, graph: NeighborGraph): string[][] {
  const countryLinks = new Map<string, Set<string>>();
  for (const code of atlas.countries.keys()) countryLinks.set(code, new Set());
  graph.links.forEach((list, i) => {
    const set = countryLinks.get(atlas.territories[i].country)!;
    list.forEach((j) => set.add(atlas.territories[j].country));
  });
  // Territories of the same country are always connected through their owner.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of countryLinks.keys()) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.shift()!;
      component.push(c);
      for (const n of countryLinks.get(c)!)
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    }
    components.push(component);
  }
  return components;
}
