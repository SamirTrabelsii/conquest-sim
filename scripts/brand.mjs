// Renders the channel brand images from the same map data, fonts and theme
// colors as the videos, so the channel and the episodes always match.
//
//   npm run brand
//
// Writes to brand/:
//   profile.png        800x800   channel picture (YouTube shows it as a circle)
//   banner.png         2560x1440 channel banner (key content in the 1546x423 safe area)
//   banner-guide.png   the banner with the safe areas drawn on, for checking only
//   watermark.png      150x150   transparent video watermark
//
// Logo: a bold, simple globe (white continents on a cyan sea, no flags) split
// in two by a glowing magma crack, with debris and shock rings: the "quake".

import { chromium } from 'playwright-core';
import { geoNaturalEarth1, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { theme } from '../src/theme.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...parts) => resolve(root, ...parts);
const c = theme.color;

const brand = {
  name: theme.brand.name,
  tagline: 'EVERY BATTLE SHAKES THE MAP',
  schedule: 'NEW QUAKE EVERY DAY',
  // Globe view on the logo: [-longitude, -latitude] of its center.
  globeRotate: [-15, -22],
  crackSeed: 7,
  // Logo geometry, in px on an 800px canvas (everything scales from there).
  globeRadius: 250,
  ring: 20, // white sticker edge
  shift: 26, // how far the two halves are pushed apart
  shadow: [16, 22], // hard drop shadow offset
  rays: 20, // sunburst rays behind the logo
  shockRings: [70, 130, 195], // extra radius of each shock ring
  shockOpacity: [0.55, 0.32, 0.16],
};

// Colors not in the video theme, only used by the logo.
const logo = {
  seaLight: c.defender,
  seaDark: '#0b6f8a',
  land: '#ffffff',
  core: '#fff3c4', // white-hot center of the crack
  ray: c.paper,
};

const sizes = {
  profile: { w: 800, h: 800 },
  banner: { w: 2560, h: 1440, safe: { w: 1546, h: 423 }, tablet: { w: 2560, h: 423 } },
  watermark: { w: 150, h: 150 },
};

// ---- Data -------------------------------------------------------------------

// Low-resolution land outline: simple, bold coastlines that read at any size.
const topo = JSON.parse(await readFile(path('node_modules/world-atlas/land-110m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

async function fontFace(family, file, weight) {
  const data = (await readFile(path(file))).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};}`;
}
const fonts =
  (await fontFace('Lilita One', 'node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2', 400)) +
  (await fontFace('Inter Variable', 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', '100 900'));

// ---- Drawing helpers --------------------------------------------------------

// Small seeded RNG so every shape is the same on every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Jagged crack from (x0,y0) to (x1,y1).
function crack(x0, y0, x1, y1, steps, jitter, seed) {
  const r = rng(seed);
  const pts = [[x0, y0]];
  const nx = -(y1 - y0), ny = x1 - x0;
  const len = Math.hypot(nx, ny);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const off = (r() - 0.5) * 2 * jitter * (i % 2 ? 1 : 0.55);
    pts.push([x0 + (x1 - x0) * t + (nx / len) * off, y0 + (y1 - y0) * t + (ny / len) * off]);
  }
  pts.push([x1, y1]);
  return pts;
}
const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');

// Sunburst rays around (cx,cy).
function rays(cx, cy, count, reach, fill, opacity) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * 2 * Math.PI;
    const a1 = a0 + Math.PI / count;
    out += `<polygon points="${cx},${cy} ${cx + Math.cos(a0) * reach},${cy + Math.sin(a0) * reach} ${cx + Math.cos(a1) * reach},${cy + Math.sin(a1) * reach}"/>`;
  }
  return `<g fill="${fill}" opacity="${opacity}">${out}</g>`;
}

// Shock rings around (cx,cy).
const shock = (cx, cy, r, k) =>
  brand.shockRings
    .map((extra, i) => `<circle cx="${cx}" cy="${cy}" r="${r + extra * k}" fill="none" stroke="${c.accent}" stroke-width="${10 * k}" stroke-opacity="${brand.shockOpacity[i]}" stroke-dasharray="${60 * k} ${26 * k}"/>`)
    .join('');

// Rock chips flying out of the crack ends.
function debris(points, k, seed) {
  const r = rng(seed);
  let out = '';
  for (const [x, y, dirX, dirY] of points) {
    for (let i = 0; i < 3; i++) {
      const d = (24 + i * 22 + r() * 8) * k;
      const s = (21 - i * 5) * k;
      const side = (i - 1) * 26 * k; // fan the chips out sideways
      const px = x + dirX * d - dirY * side;
      const py = y + dirY * d + dirX * side;
      const a = r() * Math.PI;
      const tri = [0, 1, 2].map((j) => [px + Math.cos(a + j * 2.1) * s, py + Math.sin(a + j * 2.1) * s]);
      out += `<polygon points="${poly(tri)}" fill="${i ? c.accent : logo.land}" stroke="${c.ink}" stroke-width="${4 * k}" stroke-linejoin="round"/>`;
    }
  }
  return out;
}

// The logo, drawn on a size x size canvas. `extras` adds rays and shock rings.
function emblem(size, prefix, extras) {
  const k = size / 800;
  const r = brand.globeRadius * k;
  const ring = brand.ring * k;
  const cx = size / 2, cy = size / 2;
  const proj = geoOrthographic().rotate(brand.globeRotate).translate([cx, cy]).scale(r).clipAngle(90);
  const gp = geoPath(proj);

  // Crack ends just past the ring, so the debris stays inside the round crop.
  const [dx, dy] = [r * 1.0, r * 0.75];
  const line = crack(cx - dx, cy - dy, cx + dx, cy + dy, 8, r * 0.2, brand.crackSeed);
  const n = Math.hypot(dx, dy);
  const [ox, oy] = [(dy / n) * brand.shift * k, (-dx / n) * brand.shift * k]; // apart, across the crack
  const far = size * 3;
  const upper = [...line, [far, -far], [-far, -far]];
  const lower = [...line, [far, far], [-far, far]];

  const globe = `
    <g id="${prefix}globe">
      <circle cx="${cx + brand.shadow[0] * k}" cy="${cy + brand.shadow[1] * k}" r="${r + ring}" fill="${c.shadow}"/>
      <circle cx="${cx}" cy="${cy}" r="${r + ring}" fill="${c.sticker}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${prefix}sea)"/>
      <path d="${gp(land)}" fill="${logo.land}" stroke="${c.ink}" stroke-width="${7 * k}" stroke-linejoin="round"/>
      <ellipse cx="${cx - r * 0.38}" cy="${cy - r * 0.45}" rx="${r * 0.32}" ry="${r * 0.16}" transform="rotate(-35 ${cx - r * 0.38} ${cy - r * 0.45})" fill="#ffffff" opacity="0.28"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.ink}" stroke-width="${8 * k}"/>
    </g>`;

  const glowW = 44 * k;
  const ends = [
    [...line[0], -dx / n, -dy / n],
    [...line[line.length - 1], dx / n, dy / n],
  ];
  return `
    <defs>
      <radialGradient id="${prefix}sea" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${logo.seaLight}"/><stop offset="1" stop-color="${logo.seaDark}"/></radialGradient>
      <clipPath id="${prefix}up"><polygon points="${poly(upper)}"/></clipPath>
      <clipPath id="${prefix}lo"><polygon points="${poly(lower)}"/></clipPath>
      <clipPath id="${prefix}disc"><circle cx="${cx}" cy="${cy}" r="${r + ring + brand.shift * k}"/></clipPath>
      <filter id="${prefix}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${18 * k}"/></filter>
      ${globe}
    </defs>
    ${extras ? rays(cx, cy, brand.rays, size, logo.ray, 0.55) + shock(cx, cy, r + ring, k) : ''}
    <g clip-path="url(#${prefix}disc)">
      <polyline points="${poly(line)}" fill="none" stroke="${c.accent}" stroke-width="${glowW * 2.4}" filter="url(#${prefix}blur)" stroke-linejoin="round"/>
      <polyline points="${poly(line)}" fill="none" stroke="${c.accent}" stroke-width="${glowW}" stroke-linejoin="round"/>
      <polyline points="${poly(line)}" fill="none" stroke="${logo.core}" stroke-width="${glowW * 0.35}" stroke-linejoin="round"/>
    </g>
    <g clip-path="url(#${prefix}up)" transform="translate(${ox},${oy})"><use href="#${prefix}globe"/></g>
    <g clip-path="url(#${prefix}lo)" transform="translate(${-ox},${-oy})"><use href="#${prefix}globe"/></g>
    ${debris(ends, k, brand.crackSeed + 11)}`;
}

// ---- Pages ------------------------------------------------------------------

const page = (w, h, body, bg) => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fonts}
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg};}
  svg{display:block}
  .display{font-family:'Lilita One';}
  .body{font-family:'Inter Variable';font-weight:800;}
</style></head><body>${body}</body></html>`;

function profile() {
  const { w, h } = sizes.profile;
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${c.background}"/>
    ${emblem(w, 'p', true)}
  </svg>`;
  return page(w, h, svg, c.background);
}

function watermark() {
  const { w, h } = sizes.watermark;
  // Small and simple: no rays or rings, a little margin for the debris.
  return page(w, h, `<svg width="${w}" height="${h}" viewBox="-40 -40 880 880">${emblem(800, 'w', false)}</svg>`, 'transparent');
}

function banner(guide) {
  const { w, h, safe, tablet } = sizes.banner;
  const proj = geoNaturalEarth1().fitExtent([[-60, 60], [w + 60, h + 160]], land);
  const gp = geoPath(proj);
  const shift = 16;
  // The crack comes in from the top left, runs through the logo, and leaves
  // at the bottom right, below the text block.
  const crackStartY = 430;
  const crackSlope = 0.37;
  const line = crack(-50, crackStartY, w + 50, crackStartY + crackSlope * (w + 100), 22, 50, brand.crackSeed + 3);
  const upper = [...line, [w + 100, -100], [-100, -100]];
  const lower = [...line, [w + 100, h + 100], [-100, h + 100]];

  const sx = (w - safe.w) / 2, sy = (h - safe.h) / 2;
  const emblemSize = 470;
  const ex = sx - 30 + emblemSize / 2, ey = h / 2; // logo center
  const title = 190;
  const textX = sx + emblemSize - 10;
  // Text block, top to bottom inside the safe area: tagline, title, chip.
  const taglineY = sy + 78;
  const titleY = sy + 252;
  const chipY = sy + 290;

  const guides = guide
    ? `<rect x="0" y="${(h - tablet.h) / 2}" width="${tablet.w}" height="${tablet.h}" fill="none" stroke="#00e5ff" stroke-width="6" stroke-dasharray="24 14"/>
       <rect x="${sx}" y="${sy}" width="${safe.w}" height="${safe.h}" fill="none" stroke="#ff2bd6" stroke-width="6"/>
       <text x="${sx + 12}" y="${sy - 18}" class="body" font-size="40" fill="#ff2bd6">SAFE AREA (ALL DEVICES) 1546x423</text>`
    : '';

  const k = emblemSize / 800;
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <clipPath id="up"><polygon points="${poly(upper)}"/></clipPath>
      <clipPath id="lo"><polygon points="${poly(lower)}"/></clipPath>
      <filter id="blur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
      <radialGradient id="vig" cx="0.5" cy="0.5" r="0.7"><stop offset="0.4" stop-color="${c.background}" stop-opacity="0"/><stop offset="1" stop-color="${c.shadow}" stop-opacity="0.7"/></radialGradient>
      <g id="world"><path d="${gp(land)}" fill="${c.paper}" stroke="${c.shadow}" stroke-width="4" stroke-linejoin="round"/></g>
    </defs>
    <rect width="${w}" height="${h}" fill="${c.background}"/>
    ${rays(ex, ey, 36, w * 1.5, c.paper, 0.35)}
    <polyline points="${poly(line)}" fill="none" stroke="${c.accent}" stroke-width="110" filter="url(#blur)"/>
    <polyline points="${poly(line)}" fill="none" stroke="${c.accent}" stroke-width="40" stroke-linejoin="round"/>
    <polyline points="${poly(line)}" fill="none" stroke="${logo.core}" stroke-width="10" stroke-linejoin="round"/>
    <g clip-path="url(#up)" transform="translate(-${shift / 2},-${shift})" opacity="0.85"><use href="#world"/></g>
    <g clip-path="url(#lo)" transform="translate(${shift / 2},${shift})" opacity="0.85"><use href="#world"/></g>
    <rect width="${w}" height="${h}" fill="url(#vig)"/>
    ${shock(ex, ey, (brand.globeRadius + brand.ring) * k, k * 1.4)}

    <svg x="${ex - emblemSize / 2}" y="${ey - emblemSize / 2}" width="${emblemSize}" height="${emblemSize}" viewBox="0 0 800 800" overflow="visible">${emblem(800, 'be', false)}</svg>

    <g class="display" font-size="${title}" letter-spacing="4">
      <text x="${textX + 12}" y="${titleY + 12}" fill="${c.shadow}">${brand.name}</text>
      <text x="${textX}" y="${titleY}" fill="${c.accent}" stroke="${c.sticker}" stroke-width="14" paint-order="stroke" stroke-linejoin="round">${brand.name}</text>
    </g>
    <text x="${textX + 8}" y="${taglineY}" class="body" font-size="46" letter-spacing="6" fill="${c.text}">${brand.tagline}</text>
    <g transform="translate(${textX + 8},${chipY})">
      <rect x="6" y="8" width="620" height="82" rx="41" fill="${c.shadow}"/>
      <rect width="620" height="82" rx="41" fill="${c.attacker}" stroke="${c.sticker}" stroke-width="6"/>
      <text x="310" y="57" text-anchor="middle" class="display" font-size="52" letter-spacing="3" fill="${c.onAttacker}">${brand.schedule}</text>
    </g>
    ${guides}
  </svg>`;
  return page(w, h, svg, c.background);
}

// ---- Export -----------------------------------------------------------------

await mkdir(path('brand'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-color-profile=srgb'] });
async function shoot(file, html, { w, h }, transparent = false) {
  const tab = await browser.newPage({ viewport: { width: w, height: h } });
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: path('brand', file), omitBackground: transparent });
  await tab.close();
  console.log(`[brand] brand/${file}`);
}

await shoot('profile.png', profile(), sizes.profile);
await shoot('banner.png', banner(false), sizes.banner);
await shoot('banner-guide.png', banner(true), sizes.banner);
await shoot('watermark.png', watermark(), sizes.watermark, true);
await browser.close();
