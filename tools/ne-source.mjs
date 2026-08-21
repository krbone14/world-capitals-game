// Shared Natural Earth loader: downloads the 1:50m country polygons and
// populated places once into tools/.cache/, then hands back the two lookups
// both build scripts need. Natural Earth is public domain.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache');
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

const FILES = {
  countries: 'ne_50m_admin_0_countries.geojson',
  places: 'ne_50m_populated_places.geojson',
};

async function fetchCached(file) {
  const dest = path.join(CACHE, file);
  if (fs.existsSync(dest)) return JSON.parse(fs.readFileSync(dest, 'utf8'));
  fs.mkdirSync(CACHE, { recursive: true });
  process.stderr.write(`downloading ${file}…\n`);
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(dest, text);
  return JSON.parse(text);
}

// Natural Earth splits a few states across several features and codes disputed
// territories with a -99 ISO_A3. ADM0_A3 is always present and always matches
// between the country layer and the populated-places layer, so it is the join
// key; ISO_A3_EH is preferred for the *published* id when it exists.
function iso3Of(p) {
  if (p.ISO_A3_EH && p.ISO_A3_EH !== '-99') return p.ISO_A3_EH;
  if (p.ISO_A3 && p.ISO_A3 !== '-99') return p.ISO_A3;
  return p.ADM0_A3;
}

export async function loadNaturalEarth() {
  const [rawCountries, rawPlaces] = await Promise.all([
    fetchCached(FILES.countries),
    fetchCached(FILES.places),
  ]);

  // iso3 -> { en, fr, iso2, geometries[] }. A country can own several features
  // (mainland + far-flung islands); their geometries are merged.
  const countries = {};
  for (const f of rawCountries.features) {
    const p = f.properties;
    const id = iso3Of(p);
    if (!countries[id]) {
      countries[id] = {
        en: p.NAME_EN || p.NAME,
        fr: p.NAME_FR || p.NAME_EN || p.NAME,
        iso2: (p.ISO_A2_EH && p.ISO_A2_EH !== '-99') ? p.ISO_A2_EH : p.ISO_A2,
        geometries: [],
      };
    }
    countries[id].geometries.push(f.geometry);
  }

  // iso3 -> capital. 'Admin-0 capital' wins over 'Admin-0 capital alt' so that
  // countries with a second seat (e.g. South Africa) get the primary one.
  const capitals = {};
  for (const f of rawPlaces.features) {
    const p = f.properties;
    if (p.FEATURECLA !== 'Admin-0 capital' && p.FEATURECLA !== 'Admin-0 capital alt') continue;
    const id = iso3Of(p);
    const primary = p.FEATURECLA === 'Admin-0 capital';
    if (capitals[id] && !primary) continue;
    if (capitals[id] && capitals[id].primary && !primary) continue;
    capitals[id] = {
      en: p.NAME_EN || p.NAME,
      fr: p.NAME_FR || p.NAME_EN || p.NAME,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      primary,
    };
  }

  return { countries, capitals };
}
