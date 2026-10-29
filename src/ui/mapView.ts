import { geoEqualEarth, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { merge, mesh } from 'topojson-client';
import type { GeometryCollection, GeometryObject } from 'topojson-specification';
import type { MultiPolygon, Polygon } from 'geojson';
import type { Atlas } from '../engine/atlas';
import type { NeighborGraph } from '../engine/graph';
import { config } from '../config';
import { theme } from '../theme';
import { flagUrl } from './flags';
import { tween } from './clock';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Bounds = [[number, number], [number, number]];
type Point = [number, number];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

// Flag image box for a landmass: stretch the flag up to flagMaxStretch to
// match the shape's aspect, then crop (centered) whatever still overflows.
function flagRect([[x0, y0], [x1, y1]]: Bounds) {
  const { flagAspect: a, flagMaxStretch: k } = config.map;
  const w = x1 - x0;
  const h = y1 - y0;
  const r = w / h;
  let iw = w;
  let ih = h;
  if (r > a) ih = w / Math.min(r, a * k);
  else iw = h * Math.max(r, a / k);
  return { x: x0 + (w - iw) / 2, y: y0 + (h - ih) / 2, width: iw, height: ih };
}

export function unionBounds(list: Bounds[]): Bounds {
  return [
    [Math.min(...list.map((b) => b[0][0])), Math.min(...list.map((b) => b[0][1]))],
    [Math.max(...list.map((b) => b[1][0])), Math.max(...list.map((b) => b[1][1]))],
  ];
}

interface Cluster {
  members: Polygon['coordinates'][];
  bounds: Bounds;
  area: number;
}

// Groups polygons whose boxes are within `gap` px of each other (union-find).
function clusterByGap(
  polys: { coordinates: Polygon['coordinates']; bounds: Bounds; area: number }[],
  gap: number,
): Cluster[] {
  const parent = polys.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = (a: Bounds, b: Bounds) =>
    Math.max(a[0][0] - b[1][0], b[0][0] - a[1][0]) <= gap && Math.max(a[0][1] - b[1][1], b[0][1] - a[1][1]) <= gap;
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++)
      if (near(polys[i].bounds, polys[j].bounds)) parent[find(i)] = find(j);

  const groups = new Map<number, number[]>();
  polys.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  return [...groups.values()].map((idx) => ({
    members: idx.map((i) => polys[i].coordinates),
    bounds: unionBounds(idx.map((i) => polys[i].bounds)),
    area: idx.reduce((sum, i) => sum + polys[i].area, 0),
  }));
}

const easeInOut =(t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// One rendering of the land: its patterns and its paths. A conquest builds a
// new layer on top of the old one and reveals it, then drops the old one.
interface Layer {
  defs: SVGDefsElement;
  land: SVGGElement;
}

interface View {
  k: number;
  x: number;
  y: number;
}

export class MapView {
  readonly svg: SVGSVGElement;
  readonly projection: GeoProjection;
  readonly path: GeoPath;
  private camera: SVGGElement;
  private landHost: SVGGElement;
  private borders: SVGPathElement;
  private highlights: SVGGElement;
  readonly overlay: SVGGElement;
  private layer: Layer | null = null;
  private generation = 0;
  private view: View = { k: 1, x: 0, y: 0 };
  private mains = new Map<number, { centroid: Point; bounds: Bounds }>();

  constructor(
    parent: HTMLElement,
    private atlas: Atlas,
  ) {
    const { width, height } = config.stage;
    const { top, height: homeHeight, padding } = config.map.home;

    this.projection = geoEqualEarth().rotate([config.map.rotate, 0]).fitExtent(
      [
        [padding, top + padding],
        [width - padding, top + homeHeight - padding],
      ],
      { type: 'FeatureCollection', features: atlas.territories.map((t) => t.feature) },
    );
    this.path = geoPath(this.projection);

    this.svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    Object.assign(this.svg.style, { position: 'absolute', left: '0', top: '0' });
    parent.appendChild(this.svg);

    el('rect', { width, height, fill: theme.color.ocean }, this.svg);
    this.camera = el('g', {}, this.svg);
    this.landHost = el('g', {}, this.camera);
    this.borders = el(
      'path',
      {
        fill: 'none',
        stroke: theme.color.border,
        'stroke-width': theme.size.borderWidth,
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
      },
      this.camera,
    );
    this.highlights = el('g', {}, this.camera);
    this.overlay = el('g', {}, this.camera);
  }

  // owners[i] = country code that currently owns territory i.
  render(owners: readonly string[]): void {
    const next = this.buildLayer(owners);
    this.dropLayer();
    this.layer = next;
    this.drawBorders(owners);
  }

  // Reveal the new ownership with a circle growing from `origin`, wide enough
  // to cover `region`.
  async conquer(owners: readonly string[], origin: Point, region: Bounds, ms: number): Promise<void> {
    const next = this.buildLayer(owners);
    const clipId = `wipe-${this.generation}`;
    const clip = el('clipPath', { id: clipId }, next.defs);
    const circle = el('circle', { cx: origin[0], cy: origin[1], r: 0 }, clip);
    next.land.setAttribute('clip-path', `url(#${clipId})`);
    const corners: Point[] = [region[0], region[1], [region[0][0], region[1][1]], [region[1][0], region[0][1]]];
    const radius = Math.max(...corners.map(([x, y]) => Math.hypot(x - origin[0], y - origin[1])));
    await tween(ms, (t) => circle.setAttribute('r', String(radius * easeInOut(t))));
    next.land.removeAttribute('clip-path');
    clip.remove();
    this.dropLayer();
    this.layer = next;
    this.drawBorders(owners);
  }

  private dropLayer(): void {
    this.layer?.defs.remove();
    this.layer?.land.remove();
    this.layer = null;
  }

  private buildLayer(owners: readonly string[]): Layer {
    const gen = ++this.generation;
    const layer: Layer = { defs: el('defs', {}, this.svg), land: el('g', {}, this.landHost) };
    for (const [owner, geoms] of this.groupByOwner(owners)) this.renderEmpire(layer, gen, owner, geoms);
    return layer;
  }

  private groupByOwner(owners: readonly string[]): Map<string, GeometryObject[]> {
    const byOwner = new Map<string, GeometryObject[]>();
    owners.forEach((owner, i) => {
      const list = byOwner.get(owner) ?? [];
      list.push(this.atlas.geometries[i]);
      byOwner.set(owner, list);
    });
    return byOwner;
  }

  // Lines between different owners, plus coastlines (a === b).
  private drawBorders(owners: readonly string[]): void {
    const collection: GeometryCollection = { type: 'GeometryCollection', geometries: this.atlas.geometries };
    const indexOf = new Map(this.atlas.geometries.map((g, i) => [g, i]));
    const borderMesh = mesh(
      this.atlas.topology,
      collection,
      (a, b) => a === b || owners[indexOf.get(a)!] !== owners[indexOf.get(b)!],
    );
    this.borders.setAttribute('d', this.path(borderMesh) ?? '');
  }

  // One empire = all territories with the same owner, merged. Nearby
  // landmasses are clustered; each sizeable cluster gets the flag fitted to
  // it, tiny far-off islands reuse the main cluster's flag.
  private renderEmpire(layer: Layer, gen: number, owner: string, geoms: GeometryObject[]): void {
    const merged = merge(this.atlas.topology, geoms as never) as MultiPolygon;
    const polys = merged.coordinates
      .map((coordinates) => {
        const poly: Polygon = { type: 'Polygon', coordinates };
        return { coordinates, bounds: this.path.bounds(poly) as Bounds, area: this.path.area(poly) };
      })
      .filter((p) => p.bounds.flat().every(Number.isFinite));
    if (polys.length === 0) return;

    const clusters = clusterByGap(polys, config.map.flagClusterGap).sort((a, b) => b.area - a.area);
    const url = flagUrl(owner);
    const mainId = `g${gen}-flag-${owner}-0`;
    const small: Polygon['coordinates'][] = [];
    clusters.forEach((c, i) => {
      const [[x0, y0], [x1, y1]] = c.bounds;
      if (i > 0 && (x1 - x0) * (y1 - y0) < config.map.minOwnFlagArea) {
        small.push(...c.members);
        return;
      }
      const id = `g${gen}-flag-${owner}-${i}`;
      this.addPattern(layer.defs, id, url, c.bounds);
      const shape: MultiPolygon = { type: 'MultiPolygon', coordinates: c.members };
      el('path', { d: this.path(shape) ?? '', fill: `url(#${id})` }, layer.land);
    });
    if (small.length) {
      const rest: MultiPolygon = { type: 'MultiPolygon', coordinates: small };
      el('path', { d: this.path(rest) ?? '', fill: `url(#${mainId})` }, layer.land);
    }
  }

  private addPattern(defs: SVGDefsElement, id: string, url: string, bounds: Bounds): void {
    const r = flagRect(bounds);
    const pattern = el(
      'pattern',
      { id, patternUnits: 'userSpaceOnUse', x: r.x, y: r.y, width: r.width, height: r.height },
      defs,
    );
    el('image', { href: url, width: r.width, height: r.height, preserveAspectRatio: 'none' }, pattern);
  }

  // ---- Highlights --------------------------------------------------------

  outline(territories: number[], color: string): void {
    const merged = merge(this.atlas.topology, territories.map((i) => this.atlas.geometries[i]) as never);
    el(
      'path',
      {
        d: this.path(merged) ?? '',
        fill: 'none',
        stroke: color,
        'stroke-width': theme.size.highlightWidth,
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
      },
      this.highlights,
    );
  }

  clearHighlights(): void {
    this.highlights.replaceChildren();
  }

  // ---- Geometry helpers --------------------------------------------------

  // A territory's largest landmass: its centroid and box at home zoom, so
  // e.g. France's point sits in Europe, not the Atlantic.
  private main(index: number): { centroid: Point; bounds: Bounds } {
    const cached = this.mains.get(index);
    if (cached) return cached;
    const geometry = this.atlas.territories[index].feature.geometry;
    let best: Polygon = geometry as Polygon;
    if (geometry.type === 'MultiPolygon') {
      let bestArea = -1;
      for (const coordinates of geometry.coordinates) {
        const poly: Polygon = { type: 'Polygon', coordinates };
        const area = this.path.area(poly);
        if (area > bestArea) [best, bestArea] = [poly, area];
      }
    }
    const result = { centroid: this.path.centroid(best) as Point, bounds: this.path.bounds(best) as Bounds };
    this.mains.set(index, result);
    return result;
  }

  anchor(index: number): Point {
    return this.main(index).centroid;
  }

  regionBounds(territories: number[]): Bounds {
    return unionBounds(territories.map((i) => this.main(i).bounds));
  }

  // ---- Camera ------------------------------------------------------------

  // Fit `bounds` into the camera box above the duel panel.
  async focus(bounds: Bounds, ms: number): Promise<void> {
    const { box, maxScale } = config.camera;
    const { width } = config.stage;
    const bw = Math.max(bounds[1][0] - bounds[0][0], 1);
    const bh = Math.max(bounds[1][1] - bounds[0][1], 1);
    const k = Math.min((width - 2 * box.padding) / bw, (box.height - 2 * box.padding) / bh, maxScale);
    const cx = (bounds[0][0] + bounds[1][0]) / 2;
    const cy = (bounds[0][1] + bounds[1][1]) / 2;
    await this.moveTo({ k, x: width / 2 - cx * k, y: box.top + box.height / 2 - cy * k }, ms);
  }

  home(ms: number): Promise<void> {
    return this.moveTo({ k: 1, x: 0, y: 0 }, ms);
  }

  // Interpolates the visible center linearly and the zoom geometrically, so
  // zooming in and out feel equally fast.
  private async moveTo(target: View, ms: number): Promise<void> {
    const from = this.view;
    const { width, height } = config.stage;
    const center = (v: View): Point => [(width / 2 - v.x) / v.k, (height / 2 - v.y) / v.k];
    const [c0x, c0y] = center(from);
    const [c1x, c1y] = center(target);
    await tween(ms, (raw) => {
      const t = easeInOut(raw);
      const k = from.k * (target.k / from.k) ** t;
      const cx = c0x + (c1x - c0x) * t;
      const cy = c0y + (c1y - c0y) * t;
      this.apply({ k, x: width / 2 - cx * k, y: height / 2 - cy * k });
    });
    this.apply(target);
  }

  private apply(v: View): void {
    this.view = v;
    this.camera.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k})`);
  }

  // ---- Debug -------------------------------------------------------------

  showLinks(graph: NeighborGraph): void {
    const sea = new Set(graph.seaLinks.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    graph.links.forEach((list, a) =>
      list.forEach((b) => {
        if (b < a) return;
        const [x1, y1] = this.anchor(a);
        const [x2, y2] = this.anchor(b);
        const isSea = sea.has(`${a}-${b}`);
        el(
          'line',
          {
            x1, y1, x2, y2,
            stroke: theme.color.debugLink,
            'stroke-width': isSea ? 1 : 0.6,
            'stroke-dasharray': isSea ? '3 2' : 'none',
            'vector-effect': 'non-scaling-stroke',
          },
          this.overlay,
        );
      }),
    );
  }
}
