// End-to-end smoke test. Serves the folder, drives a real Chromium, and checks
// the things a data regression would break first: every map loads and draws,
// every capital sits inside its viewBox, a full round can be won in all three
// modes, and no screen renders "undefined".
//
//   node tests/smoke.mjs            # run it
//   node tests/smoke.mjs --shots    # also save screenshots to tests/.shots/
//
// Screenshots are for reviewing a projection by eye; the assertions are what
// makes this a test.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../tools/browser.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', '.shots');
const wantShots = process.argv.includes('--shots');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

let failures = 0;
const check = (ok, what) => {
  if (!ok) { failures++; console.error(`  FAIL  ${what}`); }
  else console.log(`  ok    ${what}`);
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Two classes of console noise are expected and say nothing about the app:
//
//  - the <x-dc> template sits in the document as inert HTML until dc-runtime
//    compiles it, so the SVG parser first sees attributes still holding a
//    "{{ mustache }}" and complains once about each;
//  - flag images come from flagcdn.com, which a sandboxed runner may have no
//    route to. Flag *placement* is tested above and needs no image to load.
//
// Both patterns are matched narrowly so a genuine error still fails the run.
const EXPECTED = [
  /attribute \w+: .*"\{\{.*\}\}"/,
  /net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/,
];
const errors = [];
let blockedFlags = 0;
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (EXPECTED.some((re) => re.test(text))) { blockedFlags++; return; }
  errors.push(text);
});

// Keep the service worker out of the run: it would serve stale files from a
// previous one. index.html feature-detects with `'serviceWorker' in navigator`,
// so hand it a register() that does nothing rather than removing the property.
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    get: () => ({ register: () => Promise.resolve() }),
  });
});
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('text=/GÉOGRAPHIE|GEOGRAPHY/', { timeout: 15000 });

console.log('\nhome screen');
const contCards = await page.locator('button:has-text("Jouer")').count();
check(contCards === 6, `six continent cards (saw ${contCards})`);
check(await page.locator('text=Le Monde').count() > 0, 'the world challenge card is there');
if (wantShots) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'home.png') }); }

// ---- every map loads, draws, and keeps its capitals in frame ----
const maps = await page.evaluate(async () => {
  const out = [];
  const D = window.WORLD_DATA;
  for (const contId of [...D.continentOrder, D.worldId]) {
    const mapId = D.continents[contId].geo;
    await new Promise((resolve, reject) => {
      if ((window.WORLD_GEO || {})[mapId]) return resolve();
      const s = document.createElement('script');
      s.src = 'assets/geo/' + mapId + '.js';
      s.onload = resolve; s.onerror = () => reject(new Error(mapId));
      document.head.appendChild(s);
    });
    const g = window.WORLD_GEO[mapId];
    const members = Object.keys(D.countries).filter((id) =>
      contId === D.worldId || D.countries[id].cont === contId);
    const shaped = new Set(g.countries.map((c) => c.id));
    out.push({
      mapId,
      members: members.length,
      missing: members.filter((id) => !g.caps[id]),
      offscreen: members.filter((id) => {
        const c = g.caps[id];
        return c && (c.x < 0 || c.x > g.W || c.y < 0 || c.y > g.H);
      }),
      // A country with no shape must be flagged island:1, or nothing renders a
      // target for it and the level becomes unwinnable.
      untargetable: members.filter((id) => !shaped.has(id) && !(g.caps[id] && g.caps[id].island)),
      strays: g.countries.map((c) => c.id).filter((id) => !members.includes(id)),
    });
  }
  return out;
});

console.log('\nmap data');
for (const m of maps) {
  check(m.missing.length === 0, `${m.mapId}: every one of its ${m.members} countries has a capital${m.missing.length ? ' — missing ' + m.missing.join(' ') : ''}`);
  check(m.offscreen.length === 0, `${m.mapId}: no capital outside the viewBox${m.offscreen.length ? ' — ' + m.offscreen.join(' ') : ''}`);
  check(m.untargetable.length === 0, `${m.mapId}: every country has a shape or a dot${m.untargetable.length ? ' — ' + m.untargetable.join(' ') : ''}`);
  check(m.strays.length === 0, `${m.mapId}: no country drawn that does not belong to it${m.strays.length ? ' — ' + m.strays.join(' ') : ''}`);
}

// ---- each continent opens and renders its map ----
console.log('\nnavigation');
for (const contId of await page.evaluate(() => [...window.WORLD_DATA.continentOrder, window.WORLD_DATA.worldId])) {
  await page.evaluate((id) => window.__dc.openContinent(id), contId);
  await page.waitForFunction((id) => {
    const d = window.WORLD_DATA;
    return !!(window.WORLD_GEO || {})[d.continents[id].geo];
  }, contId, { timeout: 15000 });
  const regions = await page.locator('button:has-text("Jouer")').count();
  check(regions > 0, `${contId}: region cards rendered (${regions})`);

  // Enter the first region so the SVG actually paints.
  await page.locator('button:has-text("Jouer")').first().click();
  await page.waitForSelector('svg path[data-id]', { timeout: 10000 });
  const drawn = await page.locator('svg path[data-id]').count();
  check(drawn > 0, `${contId}: ${drawn} country shapes painted`);
  if (wantShots) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${contId}.png`) }); }

  await page.evaluate(() => window.__dc.setState({ screen: 'home', continentId: null }));
  await page.waitForSelector('text=/GÉOGRAPHIE|GEOGRAPHY/', { timeout: 10000 });
}

// ---- a full round, in all three modes ----
console.log('\nplaying a full round (South America / Southern Cone)');
for (const mode of ['cap', 'country', 'flag']) {
  const res = await playRound(page, 'amerique-sud', 'sa-cone-sud', mode);
  check(res.finished, `${mode}: round completed`);
  check(res.stars === 3, `${mode}: three stars for a clean run (got ${res.stars})`);
  check(res.score === res.total * 10, `${mode}: ${res.total * 10} points (got ${res.score})`);
  check(res.saved && res.saved.stars === 3, `${mode}: progress written to localStorage`);
}

// ---- both languages, on every screen ----
console.log('\nlanguages');
for (const lang of ['fr', 'en']) {
  await page.evaluate((l) => window.__dc.setState({ lang: l, screen: 'home', continentId: null }), lang);
  await page.waitForTimeout(120);
  const homeText = await page.locator('.g-home').innerText();
  check(!/undefined/.test(homeText), `${lang}: home screen has no "undefined"`);
  await page.evaluate(() => window.__dc.openContinent('europe'));
  await page.waitForTimeout(250);
  const contText = await page.locator('.g-home').innerText();
  check(!/undefined/.test(contText), `${lang}: continent screen has no "undefined"`);
}

console.log('\nconsole');
check(errors.length === 0, `no unexpected page errors${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
if (blockedFlags) console.log(`  note  ${blockedFlags} expected console message(s) ignored (inert template attributes, unreachable flagcdn)`);

await browser.close();
server.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);

// Plays every country of a region correctly, by dropping each label on its own
// capital coordinates, and reports what the game scored.
async function playRound(page, contId, regionId, mode) {
  return page.evaluate(async ({ contId, regionId, mode }) => {
    const c = window.__dc;
    c.setState({ mode, continentId: contId, screen: 'continent' });
    await new Promise((r) => setTimeout(r, 50));
    c.startLevel(regionId);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));

    const ids = c.taskIds();
    for (const id of ids) {
      const box = c.mapBoxRef.current.getBoundingClientRect();
      const g = c.GEO, cap = g.caps[id];
      // Country and flag modes want a point inside the shape; the capital is
      // inside it by construction, and is the dot target for island states.
      c.tryPlace(id, box.left + (cap.x / g.W) * box.width, box.top + (cap.y / g.H) * box.height);
      await new Promise((r) => setTimeout(r, 20));
      c._factAt = 0;            // skip the ghost-click guard on the fact popup
      c.closeFact();
      await new Promise((r) => setTimeout(r, 20));
    }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('worldcapitals_v1'))[mode + ':' + contId + ':' + regionId]; } catch (e) {}
    return { finished: c.state.screen === 'result', stars: c.state.resStars, score: c.state.score, total: ids.length, saved };
  }, { contId, regionId, mode });
}
