// Generates assets/geo/<map>.js from Natural Earth.
//
//   node build-geo.mjs           # all maps
//   node build-geo.mjs europe    # one map, for iterating on a projection
//
// Output schema is the one africa-capitals-game already renders, so the engine
// needs no new shape of data:
//
//   window.WORLD_GEO.europe = {
//     W, H,                          // viewBox
//     tol,                           // hit-test radius in viewBox units
//     countries: [{id, d}],          // SVG path per country that has a shape
//     caps: {ISO3: {n, x, y, island}} // capital target; island:1 = dot, no shape
//   }
//
// Countries too small to draw at the map's scale get island:1 and are rendered
// as a circle target, exactly like Cape Verde and the Seychelles in the
// original game.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as d3 from 'd3-geo';
import { OVERRIDES } from './country-config.mjs';
import { loadNaturalEarth } from './ne-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'assets', 'geo');
const DATA = path.join(HERE, '..', 'assets', 'data');

// ---------------------------------------------------------------- map defs
// `clip` is the lon/lat window fitted into the viewBox. It is stated explicitly
// rather than derived from the members' bounding box so that one far-flung
// territory (French Guiana, Hawaii, the Chagos) cannot silently zoom a whole
// continent out.
const MAPS = {
  africa: {
    // Equirectangular, matching the framing of africa-capitals-game.
    W: 1000, H: 957, tol: 22,
    projection: () => d3.geoEquirectangular(),
    // East to 59° so Mauritius and the Seychelles land inside the frame; the
    // original game reserved the same sliver of ocean for them.
    clip: [[-26, 38.5], [59, -35.5]],
  },
  europe: {
    W: 1000, H: 900, tol: 16,
    projection: () => d3.geoConicConformal().parallels([43, 62]).rotate([-15, 0]),
    clip: [[-26, 71.5], [45, 34]],
  },
  asia: {
    W: 1100, H: 850, tol: 18,
    projection: () => d3.geoConicEqualArea().parallels([15, 55]).rotate([-95, 0]),
    clip: [[25, 56], [147, -11]],
  },
  'north-america': {
    W: 1000, H: 950, tol: 18,
    projection: () => d3.geoConicConformal().parallels([20, 55]).rotate([100, 0]),
    clip: [[-172, 72], [-52, 6]],
  },
  'south-america': {
    W: 800, H: 1000, tol: 20,
    projection: () => d3.geoConicEqualArea().parallels([-5, -42]).rotate([60, 0]),
    clip: [[-82, 13], [-34, -56]],
  },
  oceania: {
    // Rotated so the antimeridian sits mid-map instead of slicing Fiji and
    // Kiribati in half.
    W: 1100, H: 800, tol: 20,
    projection: () => d3.geoEquirectangular().rotate([-160, 0]),
    clip: [[110, 8], [-150, -48]],
  },
  world: {
    W: 1400, H: 720, tol: 12,
    projection: () => d3.geoNaturalEarth1(),
    clip: [[-180, 84], [180, -58]],
  },
};

// Simplification tolerance in viewBox units, and the minimum projected area a
// ring must cover to be worth drawing. Both are per-map: the world map can
// afford to be coarser because everything on it is smaller.
const SIMPLIFY = { world: 0.7, asia: 0.5, 'north-america': 0.5, default: 0.4 };
const MIN_RING_AREA = { world: 1.5, default: 1.0 };

// A country becomes a dot target unless its *largest* island covers at least
// this many square viewBox units. Summing the rings instead would keep Cape
// Verde as a shape on the strength of ten specks nobody can hit — the player
// aims at one island, not at the total.
const MIN_SHAPE_AREA = 30;

// Geometry is cut to the viewBox grown by this margin, so a country running off
// the edge keeps a clean border line just outside the visible area instead of
// showing the cut itself.
const EDGE = 12;

// ---------------------------------------------------------------- inputs
const countries = readGenerated('countries.js', 'countries');
const only = process.argv[2];
const mapsToBuild = only ? [only] : Object.keys(MAPS);
for (const m of mapsToBuild) if (!MAPS[m]) throw new Error(`unknown map "${m}" (have: ${Object.keys(MAPS).join(', ')})`);

const { countries: neCountries, capitals: neCapitals } = await loadNaturalEarth();

// map id -> the ISO3 codes it must show
const continents = readGenerated('regions.js', 'continents');
const membersOf = {};
for (const [contId, cont] of Object.entries(continents)) {
  const ids = cont.world
    ? Object.keys(countries)
    : Object.keys(countries).filter((id) => countries[id].cont === contId);
  membersOf[cont.geo] = ids;
}

fs.mkdirSync(OUT, { recursive: true });
const report = [];

for (const mapId of mapsToBuild) {
  const spec = MAPS[mapId];
  const ids = membersOf[mapId];
  if (!ids) throw new Error(`no continent in regions.js declares geo:"${mapId}"`);

  // Frame the map on the member countries themselves, not on the clip window:
  // fitting the window leaves broad empty margins wherever the continent does
  // not fill its bounding box. Vertices outside the window are excluded from
  // the fit, so Russia's Siberian half cannot zoom Europe out.
  const pad = 8;
  const fitPoints = [];
  for (const id of ids) {
    for (const geom of neCountries[id].geometries) {
      for (const ring of ringsOf(geom)) {
        for (const pt of ring) if (inClip(pt, spec.clip)) fitPoints.push(pt);
      }
    }
  }
  if (!fitPoints.length) throw new Error(`${mapId}: clip window excludes every member country`);
  const projection = spec.projection().fitExtent(
    [[pad, pad], [spec.W - pad, spec.H - pad]],
    { type: 'MultiPoint', coordinates: fitPoints },
  );
  const round = (n) => Math.round(n * 10) / 10;
  const simplifyTol = SIMPLIFY[mapId] ?? SIMPLIFY.default;
  const minRing = MIN_RING_AREA[mapId] ?? MIN_RING_AREA.default;

  const shapes = [];
  const caps = {};
  const dots = [];

  for (const id of ids) {
    const ne = neCountries[id];
    if (!ne) throw new Error(`${id}: no Natural Earth geometry`);

    // Project every ring, cut it down to the viewBox, drop what is too small to
    // see, then simplify. Clipping before simplifying is what keeps Siberia out
    // of the Europe file and the Galápagos out of South America's — without it
    // a single ring can carry thousands of points that never get rendered.
    const rings = [];
    for (const geom of ne.geometries) {
      for (const ring of ringsOf(geom)) {
        const pts = [];
        for (const [lon, lat] of ring) {
          const p = projection([lon, lat]);
          if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { pts.length = 0; break; }
          pts.push(p);
        }
        if (pts.length < 4) continue;
        const clipped = clipToBox(pts, -EDGE, -EDGE, spec.W + EDGE, spec.H + EDGE);
        if (clipped.length < 4) continue;
        if (Math.abs(ringArea(clipped)) < minRing) continue;
        const simple = simplify(clipped, simplifyTol);
        if (simple.length < 4) continue;
        rings.push(simple);
      }
    }

    const biggest = rings.reduce((max, r) => Math.max(max, Math.abs(ringArea(r))), 0);
    const hasShape = biggest >= MIN_SHAPE_AREA;
    if (hasShape) {
      shapes.push({ id, d: rings.map((r) => ringToPath(r, round)).join('') });
    } else {
      dots.push(id);
    }

    // Capital target.
    const ov = OVERRIDES[id] || {};
    const src = neCapitals[id];
    const lon = ov.lon ?? (src && src.lon);
    const lat = ov.lat ?? (src && src.lat);
    if (lon === undefined || lat === undefined) throw new Error(`${id}: no capital coordinates`);
    const p = projection([lon, lat]);
    if (!p || !Number.isFinite(p[0])) throw new Error(`${id}: capital does not project onto ${mapId}`);
    // A capital outside the viewBox is unreachable: the player can never drop
    // anything on it. Almost always it means the map's clip window is too tight
    // for one of its own members.
    if (p[0] < 0 || p[0] > spec.W || p[1] < 0 || p[1] > spec.H) {
      throw new Error(
        `${mapId}: ${id}'s capital lands at ${p.map((n) => n.toFixed(0)).join(',')}, outside the ` +
        `${spec.W}x${spec.H} viewBox — widen MAPS.${mapId}.clip to take it in`);
    }
    caps[id] = { n: countries[id].capEn, x: round(p[0]), y: round(p[1]), island: hasShape ? 0 : 1 };
  }

  const body =
`// GENERATED by tools/build-geo.mjs — do not edit by hand.
// Source: Natural Earth 1:50m (public domain). Re-run \`npm run geo\`.
window.WORLD_GEO = window.WORLD_GEO || {};
window.WORLD_GEO[${JSON.stringify(mapId)}] = ${JSON.stringify({
    W: spec.W, H: spec.H, tol: spec.tol,
    countries: shapes,
    caps,
  })};
`;
  const file = path.join(OUT, `${mapId}.js`);
  fs.writeFileSync(file, body);

  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  report.push({ mapId, n: ids.length, shapes: shapes.length, dots: dots.length, kb, dotIds: dots });
}

for (const r of report) {
  console.log(`${r.mapId.padEnd(15)} ${String(r.n).padStart(3)} countries · ${String(r.shapes).padStart(3)} shapes · ${String(r.dots).padStart(2)} dots · ${r.kb} KB`);
  if (r.dotIds.length) console.log(`${''.padEnd(16)}dots: ${r.dotIds.join(' ')}`);
}

// ---------------------------------------------------------------- helpers

// Reads a generated browser file by giving it the `window` it expects.
function readGenerated(name, key) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) throw new Error(`${name} missing — run \`npm run data\` first`);
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(file, 'utf8')).call(sandbox, sandbox.window);
  return sandbox.window.WORLD_DATA[key];
}

// Is a lon/lat inside the map's window? The window may wrap the antimeridian
// (Oceania runs 110°E to 150°W), in which case east < west and the longitude
// test is the union of the two halves rather than a plain range.
function inClip([lon, lat], [[west, north], [east, south]]) {
  if (lat > north || lat < south) return false;
  return east >= west ? (lon >= west && lon <= east) : (lon >= west || lon <= east);
}

function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

// Sutherland-Hodgman: clip a polygon ring against an axis-aligned rectangle.
// The rectangle is convex, so the result is a single valid ring (possibly with
// edges lying along the border, which fill and hit-testing handle fine).
function clipToBox(ring, x0, y0, x1, y1) {
  const edges = [
    { inside: (p) => p[0] >= x0, cut: (a, b) => cutX(a, b, x0) },
    { inside: (p) => p[0] <= x1, cut: (a, b) => cutX(a, b, x1) },
    { inside: (p) => p[1] >= y0, cut: (a, b) => cutY(a, b, y0) },
    { inside: (p) => p[1] <= y1, cut: (a, b) => cutY(a, b, y1) },
  ];

  let out = ring;
  for (const edge of edges) {
    if (!out.length) return [];
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      const prev = out[(i + out.length - 1) % out.length];
      const curIn = edge.inside(cur);
      const prevIn = edge.inside(prev);
      if (curIn) {
        if (!prevIn) next.push(edge.cut(prev, cur));
        next.push(cur);
      } else if (prevIn) {
        next.push(edge.cut(prev, cur));
      }
    }
    out = next;
  }
  return out;
}

function cutX(a, b, x) {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}

function cutY(a, b, y) {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

// Douglas-Peucker in projected space, so the tolerance is in the same pixels
// the player is aiming at.
function simplify(pts, tol) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;

  while (stack.length) {
    const [lo, hi] = stack.pop();
    let far = -1;
    let best = tol2;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist2(pts[i], pts[lo], pts[hi]);
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([lo, far], [far, hi]);
    }
  }

  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

function segDist2(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}

// Drops consecutive duplicate points after rounding, which is where most of the
// remaining bytes hide.
function ringToPath(pts, round) {
  let d = '';
  let px = null, py = null;
  for (let i = 0; i < pts.length; i++) {
    const x = round(pts[i][0]);
    const y = round(pts[i][1]);
    if (x === px && y === py) continue;
    d += (d === '' ? 'M' : 'L') + x + ' ' + y;
    px = x; py = y;
  }
  return d === '' ? '' : d + 'Z';
}
