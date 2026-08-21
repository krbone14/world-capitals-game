// Checks the generated data files against each other, without a browser.
//
//   node validate-data.mjs      (or: npm run validate)
//
// Fast enough to run after every regeneration. The rendering-side invariants —
// that every map paints, that a round can actually be won — live in
// tests/smoke.mjs, which needs a real browser.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (msg) => problems.push(msg);

const countries = load('data/countries.js', (w) => w.WORLD_DATA.countries);
const { continents, continentOrder, worldId } = load('data/regions.js', (w) => w.WORLD_DATA);
const facts = load('data/facts.js', (w) => w.WORLD_DATA.facts);

const ids = Object.keys(countries);

// ---- roster ----------------------------------------------------------------
for (const id of ids) {
  const c = countries[id];
  if (!/^[A-Z]{3}$/.test(id)) fail(`${id}: not an ISO 3166-1 alpha-3 code`);
  if (!/^[a-z]{2}$/.test(c.i2)) fail(`${id}: "${c.i2}" is not a lowercase alpha-2 code, so its flag URL will 404`);
  if (c.tier !== 1 && c.tier !== 2) fail(`${id}: tier is ${c.tier}, expected 1 or 2`);
  for (const field of ['cf', 'ce', 'capFr', 'capEn']) {
    if (!c[field]) fail(`${id}: ${field} is empty`);
  }
  if (!continents[c.cont]) fail(`${id}: continent "${c.cont}" is not in regions.js`);
  else if (!continents[c.cont].regions.some((r) => r.id === c.reg)) {
    fail(`${id}: region "${c.reg}" does not belong to continent "${c.cont}"`);
  }
}

// ---- regions ---------------------------------------------------------------
for (const contId of continentOrder) {
  const cont = continents[contId];
  if (!cont) { fail(`continentOrder names "${contId}", which regions.js does not define`); continue; }
  for (const r of cont.regions) {
    const members = ids.filter((id) => countries[id].reg === r.id);
    if (!members.length) fail(`region ${r.id} (${contId}) has no countries`);
    if (!members.some((id) => countries[id].tier === 1)) {
      fail(`region ${r.id} (${contId}) is all micro-states, so its level would deal nothing`);
    }
  }
}
if (!continents[worldId]) fail(`worldId "${worldId}" is not a continent in regions.js`);

// ---- anecdotes -------------------------------------------------------------
for (const id of ids) {
  const f = facts[id];
  if (!f) { fail(`${id}: no anecdote`); continue; }
  if (!f.fr.length) fail(`${id}: no French anecdote`);
  if (f.fr.length !== f.en.length) {
    fail(`${id}: ${f.fr.length} French anecdotes but ${f.en.length} English — the popup shows one index in both languages`);
  }
  f.fr.forEach((s, i) => { if (!s || !s.trim()) fail(`${id}: French anecdote ${i} is blank`); });
  f.en.forEach((s, i) => { if (!s || !s.trim()) fail(`${id}: English anecdote ${i} is blank`); });
}
for (const id of Object.keys(facts)) if (!countries[id]) fail(`${id}: anecdote for a country not in the roster`);

// ---- maps ------------------------------------------------------------------
for (const contId of [...continentOrder, worldId]) {
  const cont = continents[contId];
  if (!cont) continue;
  const g = load(`geo/${cont.geo}.js`, (w) => w.WORLD_GEO[cont.geo]);
  if (!g) { fail(`geo/${cont.geo}.js does not define WORLD_GEO["${cont.geo}"]`); continue; }
  if (!(g.W > 0 && g.H > 0 && g.tol > 0)) fail(`${cont.geo}: W, H and tol must all be positive`);

  const members = contId === worldId ? ids : ids.filter((id) => countries[id].cont === contId);
  const shaped = new Set(g.countries.map((c) => c.id));

  for (const id of members) {
    const cap = g.caps[id];
    if (!cap) { fail(`${cont.geo}: ${id} has no capital target`); continue; }
    if (cap.x < 0 || cap.x > g.W || cap.y < 0 || cap.y > g.H) {
      fail(`${cont.geo}: ${id}'s capital is at ${cap.x},${cap.y}, outside the ${g.W}x${g.H} viewBox — unreachable`);
    }
    if (!shaped.has(id) && !cap.island) {
      fail(`${cont.geo}: ${id} has neither a shape nor island:1, so nothing renders a target for it`);
    }
    if (shaped.has(id) && cap.island) {
      fail(`${cont.geo}: ${id} is marked island:1 but also has a shape`);
    }
  }
  for (const c of g.countries) {
    if (!members.includes(c.id)) fail(`${cont.geo}: draws ${c.id}, which does not belong to this map`);
    if (!/^M/.test(c.d)) fail(`${cont.geo}: ${c.id}'s path does not start with a moveto`);
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ` + problems.join('\n  '));
  process.exit(1);
}

const tier1 = ids.filter((id) => countries[id].tier === 1).length;
const nFacts = ids.reduce((n, id) => n + facts[id].fr.length, 0);
console.log(`data OK — ${ids.length} countries (${tier1} playable), ` +
            `${continentOrder.length} continents, ${continentOrder.reduce((n, c) => n + continents[c].regions.length, 0)} regions, ` +
            `${nFacts} anecdotes per language, ${continentOrder.length + 1} maps`);

// Runs a generated browser file by handing it the `window` it expects.
function load(rel, pick) {
  const file = path.join(ROOT, 'assets', rel);
  if (!fs.existsSync(file)) {
    console.error(`assets/${rel} missing — run \`npm run data\` and \`npm run geo\` first`);
    process.exit(1);
  }
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(file, 'utf8')).call(sandbox, sandbox.window);
  return pick(sandbox.window);
}
