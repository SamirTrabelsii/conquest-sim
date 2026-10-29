import { feature } from 'topojson-client';
import { geoArea } from 'd3-geo';
import countries from 'i18n-iso-countries';
import type { Topology, GeometryCollection, GeometryObject } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import worldAtlas from 'world-atlas/countries-50m.json';
import { config } from '../config';

// A map shape from world-atlas. Several territories can belong to one country
// (e.g. Australia + Indian Ocean Ter.), and a country is the unit that fights.
export interface Territory {
  index: number;
  name: string;
  country: string; // ISO alpha-2, lower case, also the flag-icons file name
  feature: Feature<Geometry>;
  area: number; // steradians, from d3.geoArea
}

export interface Country {
  code: string;
  name: string;
  territories: number[];
}

export interface Atlas {
  topology: Topology;
  geometries: GeometryObject[];
  territories: Territory[];
  countries: Map<string, Country>;
  totalArea: number;
}

// Shapes Natural Earth ships without an ISO numeric id. Each starts out owned by
// the country with that code (the recognized or administering state).
const CODE_BY_NAME: Record<string, string> = {
  Kosovo: 'xk',
  Somaliland: 'so',
  'N. Cyprus': 'cy',
  'Indian Ocean Ter.': 'au',
  'Siachen Glacier': 'in',
};

// Natural Earth abbreviates long names; spell them out for on-screen text.
const DISPLAY_NAME: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Republic',
  'Dominican Rep.': 'Dominican Republic',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Eq. Guinea': 'Equatorial Guinea',
  'S. Sudan': 'South Sudan',
  'W. Sahara': 'Western Sahara',
  'Antigua and Barb.': 'Antigua and Barbuda',
  'St. Vin. and Gren.': 'St. Vincent and the Grenadines',
  'St. Kitts and Nevis': 'St. Kitts and Nevis',
  'St. Pierre and Miquelon': 'St. Pierre and Miquelon',
  'Marshall Is.': 'Marshall Islands',
  'N. Mariana Is.': 'Northern Mariana Islands',
  'U.S. Virgin Is.': 'U.S. Virgin Islands',
  'British Virgin Is.': 'British Virgin Islands',
  'S. Geo. and the Is.': 'South Georgia',
  'Br. Indian Ocean Ter.': 'British Indian Ocean Territory',
  'Pitcairn Is.': 'Pitcairn Islands',
  'Falkland Is.': 'Falkland Islands',
  'Cayman Is.': 'Cayman Islands',
  'Turks and Caicos Is.': 'Turks and Caicos',
  'Solomon Is.': 'Solomon Islands',
  'Cook Is.': 'Cook Islands',
  'Wallis and Futuna Is.': 'Wallis and Futuna',
  'Fr. Polynesia': 'French Polynesia',
  'Fr. S. Antarctic Lands': 'French Southern Lands',
  'Faeroe Is.': 'Faroe Islands',
  'Heard I. and McDonald Is.': 'Heard and McDonald Islands',
  'Indian Ocean Ter.': 'Indian Ocean Territories',
  'Ashmore and Cartier Is.': 'Ashmore and Cartier Islands',
  'N. Cyprus': 'Northern Cyprus',
  'São Tomé and Principe': 'São Tomé and Príncipe',
};

function codeFor(geometry: GeometryObject): string {
  const name = (geometry.properties as { name: string }).name;
  if (geometry.id === undefined) {
    const code = CODE_BY_NAME[name];
    if (!code) throw new Error(`No ISO code for map shape "${name}"`);
    return code;
  }
  const alpha2 = countries.numericToAlpha2(String(geometry.id));
  if (!alpha2) throw new Error(`Unknown ISO numeric id ${geometry.id} (${name})`);
  return alpha2.toLowerCase();
}

export function loadAtlas(): Atlas {
  const topology = worldAtlas as unknown as Topology;
  const all = (topology.objects.countries as GeometryCollection).geometries;
  const excluded = new Set(config.map.excludedIds);
  const geometries = all.filter((g) => !excluded.has(String(g.id)));

  const territories: Territory[] = geometries.map((geometry, index) => {
    const f = feature(topology, geometry) as Feature<Geometry>;
    const rawName = (geometry.properties as { name: string }).name;
    return {
      index,
      name: DISPLAY_NAME[rawName] ?? rawName,
      country: codeFor(geometry),
      feature: f,
      area: geoArea(f),
    };
  });

  // A country is named after its largest territory.
  const countryMap = new Map<string, Country>();
  const byArea = [...territories].sort((a, b) => b.area - a.area);
  for (const t of byArea) {
    const existing = countryMap.get(t.country);
    if (existing) existing.territories.push(t.index);
    else countryMap.set(t.country, { code: t.country, name: t.name, territories: [t.index] });
  }
  // Stable, data-independent iteration order for determinism.
  const sorted = new Map([...countryMap.entries()].sort(([a], [b]) => a.localeCompare(b)));
  for (const c of sorted.values()) c.territories.sort((a, b) => a - b);

  const totalArea = territories.reduce((sum, t) => sum + t.area, 0);
  return { topology, geometries, territories, countries: sorted, totalArea };
}
