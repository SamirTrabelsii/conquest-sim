import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAtlas } from '../src/engine/atlas';

const flagDir = resolve(__dirname, '../node_modules/flag-icons/flags/4x3');
const atlas = loadAtlas();

describe('flag mapping', () => {
  it('every country has a flag-icons SVG', () => {
    const missing = [...atlas.countries.values()].filter(
      (c) => !existsSync(resolve(flagDir, `${c.code}.svg`)),
    );
    expect(missing.map((c) => `${c.code} ${c.name}`)).toEqual([]);
  });

  it('every territory belongs to a known country', () => {
    for (const t of atlas.territories) expect(atlas.countries.has(t.country)).toBe(true);
  });

  it('Antarctica is excluded', () => {
    expect(atlas.territories.some((t) => t.name === 'Antarctica')).toBe(false);
  });

  // Human-reviewable list of every country, its flag code and its map shapes.
  // Review the snapshot file whenever it changes.
  it('lists every country and flag code', async () => {
    const lines = [...atlas.countries.values()].map((c) => {
      const shapes = c.territories.map((i) => atlas.territories[i].name);
      const extra = shapes.length > 1 ? `  [${shapes.join(', ')}]` : '';
      return `${c.code}  ${c.name}${extra}`;
    });
    const text = `${lines.length} countries\n\n${lines.join('\n')}\n`;
    await expect(text).toMatchFileSnapshot('./__snapshots__/country-flags.txt');
  });
});
