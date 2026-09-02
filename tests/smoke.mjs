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
// The locale is pinned because the game now reads it: without this the suite
// would exercise French on a French machine and English on a CI runner, and the
// selectors below are French — "Jouer" is not a button in English.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });

// One class of console noise is expected and says nothing about the app: the
// <x-dc> template sits in the document as inert HTML until dc-runtime compiles
// it, so the SVG parser first sees attributes still holding a "{{ mustache }}"
// and complains once about each.
//
// The flags used to be a second class — they came from flagcdn.com, which a
// sandboxed runner may have no route to. They ship with the game now, so a flag
// that fails to load is a real failure, and playing flag mode below is what
// catches it: nothing excuses a network error here any more.
//
// The pattern is matched narrowly so a genuine error still fails the run.
const EXPECTED = [
  /attribute \w+: .*"\{\{.*\}\}"/,
];
const errors = [];
let ignoredNoise = 0;
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (EXPECTED.some((re) => re.test(text))) { ignoredNoise++; return; }
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

// ---- the review round ----
// The rounds above are flawless, so they never reach it. This one misses on
// purpose, then checks the invariant that makes a review round safe: it deals
// a subset of the region, so its result must not touch the region's stars.
console.log('\nreview round');
const rev = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = 'cap:amerique-sud:sa-cone-sud';
  localStorage.removeItem('worldcapitals_v1');
  c.setState({ mode: 'cap', continentId: 'amerique-sud', screen: 'continent', progress: {} });
  await sleep(50);

  // Drops `id`'s label either on its own capital, or on another country's —
  // which is a genuine miss, since tryPlace only ever tests the dragged id.
  const play = async (ids, missing) => {
    for (const id of ids) {
      const g = c.GEO;
      const target = missing.includes(id) ? g.caps[ids.find((x) => x !== id)] : g.caps[id];
      const b = c.mapBoxRef.current.getBoundingClientRect();
      c.tryPlace(id, b.left + (target.x / g.W) * b.width, b.top + (target.y / g.H) * b.height);
      await sleep(20);
      if (missing.includes(id)) {   // now place it properly, so the round can end
        const cap = c.GEO.caps[id], bb = c.mapBoxRef.current.getBoundingClientRect();
        c.tryPlace(id, bb.left + (cap.x / c.GEO.W) * bb.width, bb.top + (cap.y / c.GEO.H) * bb.height);
        await sleep(20);
      }
      c._factAt = 0; c.closeFact();
      await sleep(20);
    }
  };

  c.startLevel('sa-cone-sud');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  const all = c.taskIds();
  const missed = all.slice(0, 2);
  await play(all, missed);

  const afterFirst = {
    total: all.length,
    stars: c.state.resStars,
    reported: c.state.resMissed.slice().sort(),
    expected: missed.slice().sort(),
    saved: JSON.parse(localStorage.getItem('worldcapitals_v1') || '{}')[key],
  };

  // Now the review round, played clean: three stars on two countries.
  c.startLevel('sa-cone-sud', c.state.resMissed);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  const dealt = c.taskIds().slice().sort();
  await play(c.taskIds(), []);
  const afterReview = {
    dealt,
    stars: c.state.resStars,
    saved: JSON.parse(localStorage.getItem('worldcapitals_v1') || '{}')[key],
  };

  // Back to the whole region: every chip must be dealt again, not just the two
  // the review left in the cached chip order.
  c.startLevel('sa-cone-sud');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  const backToFull = { dealt: c.taskIds().length, chips: c.shuffleStable(c.taskIds()).length };

  return { afterFirst, afterReview, backToFull };
});

check(JSON.stringify(rev.afterFirst.reported) === JSON.stringify(rev.afterFirst.expected),
  `the two missed countries are reported for review (${rev.afterFirst.reported.join(' ')})`);
check(rev.afterFirst.stars === 2, `3 of 5 first try scores 2 stars (got ${rev.afterFirst.stars})`);
check(rev.afterFirst.saved && rev.afterFirst.saved.stars === 2, 'the region is saved at 2 stars');
check(JSON.stringify(rev.afterReview.dealt) === JSON.stringify(rev.afterFirst.expected),
  'the review round deals exactly the missed countries');
check(rev.afterReview.stars === 3, `a clean review round scores 3 stars (got ${rev.afterReview.stars})`);
check(rev.afterReview.saved && rev.afterReview.saved.stars === 2,
  `the review leaves the region at 2 stars (got ${rev.afterReview.saved && rev.afterReview.saved.stars})`);
check(rev.backToFull.dealt === 5 && rev.backToFull.chips === 5,
  `replaying the whole region deals all 5 again (${rev.backToFull.dealt} ids, ${rev.backToFull.chips} chips)`);

// ---- the hint, and what it costs ----
// The point of the hint is that it is not free: it reveals the answer, so the
// round banks nothing. This checks the threshold that unlocks it and, above
// all, that a hinted round cannot overwrite stars the player really earned.
console.log('\nhint');
const hint = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = 'cap:amerique-sud:sa-cone-sud';
  const saved = () => JSON.parse(localStorage.getItem('worldcapitals_v1') || '{}')[key];
  const at = (id) => {                       // client point of id's own capital
    const g = c.GEO, cap = g.caps[id], b = c.mapBoxRef.current.getBoundingClientRect();
    return [b.left + (cap.x / g.W) * b.width, b.top + (cap.y / g.H) * b.height];
  };
  const drop = async (id, onto) => { c.tryPlace(id, ...at(onto)); await sleep(20); };
  const settle = async () => { c._factAt = 0; c.closeFact(); await sleep(20); };

  localStorage.removeItem('worldcapitals_v1');
  c.setState({ mode: 'cap', continentId: 'amerique-sud', screen: 'continent', progress: {} });
  await sleep(50);

  // A clean round first, so there are real stars on record to try to clobber.
  c.startLevel('sa-cone-sud');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  for (const id of c.taskIds()) { await drop(id, id); await settle(); }
  const earned = saved();

  // Now a round that asks for help.
  c.startLevel('sa-cone-sud');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  const ids = c.taskIds(), stuck = ids[0], elsewhere = ids[1];
  const gate = [];
  gate.push(c.canHint(stuck));               // 0 misses: no
  await drop(stuck, elsewhere);
  gate.push(c.canHint(stuck));               // 1 miss: still no
  c.showHint(stuck);
  const refusedEarly = !c.state.hinted[stuck];
  await drop(stuck, elsewhere);
  gate.push(c.canHint(stuck));               // 2 misses: yes
  c.showHint(stuck);
  const shown = !!c.state.hinted[stuck];

  await drop(stuck, stuck); await settle();
  for (const id of ids.slice(1)) { await drop(id, id); await settle(); }

  return {
    earned, refusedEarly, shown, gate,
    stars: c.state.resStars,
    flagged: c.state.resUsedHint,
    after: saved(),
  };
});

check(hint.earned && hint.earned.stars === 3, 'a clean round banks 3 stars first');
check(JSON.stringify(hint.gate) === JSON.stringify([false, false, true]),
  `the hint unlocks only on the 2nd miss (${JSON.stringify(hint.gate)})`);
check(hint.refusedEarly, 'asking for it before the 2nd miss does nothing');
check(hint.shown, 'asking for it after the 2nd miss reveals the country');
check(hint.stars === 0, `a hinted round scores 0 stars (got ${hint.stars})`);
check(hint.flagged, 'the result screen is told the hint was used');
check(hint.after && hint.after.stars === 3 && hint.after.best === hint.earned.best,
  `the hinted round banks nothing, leaving 3 stars and ${hint.earned && hint.earned.best} points`);

// ---- how the anecdote is shown ----
// Short levels keep the popup; long ones show the anecdote beside the map, and
// the switch turns it off entirely. The structural part is that finishing used
// to be a side effect of dismissing the last popup — these two paths have no
// popup to dismiss, so the round has to end on its own.
console.log('\nanecdotes');
const facts = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const enter = async (contId, regionId) => {
    c.setState({ mode: 'cap', continentId: contId, screen: 'continent' });
    await sleep(50);
    c.startLevel(regionId);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
  };
  // Plays a whole level, never touching closeFact unless told to.
  const play = async (dismiss) => {
    let sawPopup = false, sawCard = false;
    for (const id of c.taskIds()) {
      const g = c.GEO, cap = g.caps[id];
      const b = c.mapBoxRef.current.getBoundingClientRect();
      c.tryPlace(id, b.left + (cap.x / g.W) * b.width, b.top + (cap.y / g.H) * b.height);
      await sleep(25);
      if (c.state.factOpen) sawPopup = true;
      if (c.state.factCardId) sawCard = true;
      if (dismiss) { c._factAt = 0; c.closeFact(); await sleep(20); }
    }
    await sleep(120);
    return { sawPopup, sawCard, screen: c.state.screen };
  };

  // The real threshold, on the real levels.
  await enter('amerique-sud', 'sa-cone-sud');
  const shortLevel = { n: c.taskIds().length, long: c.longLevel() };
  await enter('europe', 'all');
  const europeAll = { n: c.taskIds().length, long: c.longLevel() };
  await enter('monde', 'all');
  const worldAll = { n: c.taskIds().length, long: c.longLevel() };

  // Short level, anecdotes on: the popup, dismissed as before.
  c.setState({ factsOn: true });
  await enter('amerique-sud', 'sa-cone-sud');
  const popup = await play(true);

  // Same level forced over the threshold: the card, and nothing to dismiss.
  const realMax = c.FACT_MODAL_MAX;
  c.FACT_MODAL_MAX = 2;
  await enter('amerique-sud', 'sa-cone-sud');
  const beside = await play(false);
  c.FACT_MODAL_MAX = realMax;

  // Switched off: neither, and the round still ends.
  c.setState({ factsOn: false });
  await enter('amerique-sud', 'sa-cone-sud');
  const off = await play(false);
  c.setState({ factsOn: true });

  return { shortLevel, europeAll, worldAll, popup, beside, off };
});

check(!facts.shortLevel.long, `a ${facts.shortLevel.n}-country region keeps the popup`);
check(facts.europeAll.long, `all of Europe (${facts.europeAll.n}) shows anecdotes beside the map`);
check(facts.worldAll.long, `the whole world (${facts.worldAll.n}) shows anecdotes beside the map`);
check(facts.popup.sawPopup && !facts.popup.sawCard, 'short level: the popup, not the card');
check(facts.popup.screen === 'result', 'short level: dismissing the last popup still finishes it');
check(facts.beside.sawCard && !facts.beside.sawPopup, 'long level: the card, and no popup at all');
check(facts.beside.screen === 'result', 'long level: the round finishes with nothing to dismiss');
check(!facts.off.sawPopup && !facts.off.sawCard, 'switched off: no anecdote of either kind');
check(facts.off.screen === 'result', 'switched off: the round still finishes');

// ---- micro-states, overall progress, and the lazy label points ----
console.log('\nmicro-states, overall, label points');
const extras = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const enter = async (contId, regionId) => {
    c.setState({ continentId: contId, screen: 'continent' });
    await sleep(50);
    c.startLevel(regionId);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
  };

  // --- the switch changes the roster, and only when it is on ---
  c.setState({ mode: 'cap', microOn: false, progress: {} });
  await sleep(50);
  const off = { euSud: c.idsOfRegion('europe', 'eu-sud').length, world: c.idsOfRegion('monde', 'all').length };
  c.setState({ microOn: true });
  await sleep(50);
  const on = { euSud: c.idsOfRegion('europe', 'eu-sud').length, world: c.idsOfRegion('monde', 'all').length };

  // --- and it files its stars separately ---
  c.setState({ continentId: 'europe', regionId: 'eu-sud' });
  await sleep(30);
  const keyMicro = c.progKey();
  c.setState({ microOn: false });
  await sleep(30);
  const keyPlain = c.progKey();

  // --- overall counter follows the mode and the progress ---
  const blank = c.overallStars();
  c.setState({ progress: { 'cap:europe:eu-nord': { stars: 3, best: 9 },
                           'cap:europe:eu-sud': { stars: 2, best: 9 },
                           'cap:afrique:af-nord': { stars: 3, best: 9 },
                           'flag:europe:eu-nord': { stars: 3, best: 9 } } });
  await sleep(30);
  const capMode = c.overallStars();
  c.setState({ mode: 'flag' });
  await sleep(30);
  const flagMode = c.overallStars();
  c.setState({ mode: 'cap', progress: {} });
  await sleep(30);

  // --- label points: skipped in capital mode with names off, computed the
  //     moment they are actually needed ---
  await enter('monde', 'all');
  const lazySkipped = c._labelPts === null;
  const t0 = performance.now();
  c.setState({ showNames: true });
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 900)));
  const computedOnDemand = !!c._labelPts && Object.keys(c._labelPts).length > 0;
  const ms = Math.round(performance.now() - t0);
  c.setState({ showNames: false });

  return { off, on, keyMicro, keyPlain, blank, capMode, flagMode, lazySkipped, computedOnDemand };
});

check(extras.on.euSud > extras.off.euSud && extras.on.world === extras.off.world + 23,
  `the switch deals the 23 micro-states (world ${extras.off.world} -> ${extras.on.world}, Southern Europe ${extras.off.euSud} -> ${extras.on.euSud})`);
check(extras.keyMicro !== extras.keyPlain && /:micro$/.test(extras.keyMicro),
  `with and without them are different levels ("${extras.keyPlain}" vs "${extras.keyMicro}")`);
check(extras.blank === '★ 0 / 23', `a blank slate reads ${extras.blank}`);
check(extras.capMode === '★ 2 / 23', `only three-starred regions count (${extras.capMode})`);
check(extras.flagMode === '★ 1 / 23', `the counter is per mode (flags: ${extras.flagMode})`);
check(extras.lazySkipped, 'capital mode with names off never computes the label points');
check(extras.computedOnDemand, 'turning names on computes them, at that moment');

// ---- zoom, hit tolerance and placed labels ----
//
// Two things testers asked for, and both are about the same countries: the ones
// small enough to be a few pixels wide on a world map. One is being able to zoom
// far enough to see them; the other is the labels of already-placed answers
// sitting on top of them.
console.log('\nzoom and placed labels');
const zoomBits = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  c.setState({ mode: 'cap', continentId: 'afrique', screen: 'continent' });
  await sleep(60);
  c.startLevel('af-ouest');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 140)));

  const base = c.GEO.tol;

  // setZoom and the pinch handler both clamp; this checks the one they share.
  c.setZoom(999);
  const maxed = c.state.zoom;
  c.setZoom(0.1);
  const floored = c.state.zoom;

  c.setZoom(2);
  const tolAt2 = c.tol();
  c.setZoom(c.MAX_ZOOM);
  const tolAtMax = c.tol();

  // Country mode never scaled its tolerance with the zoom, and still must not.
  c.setState({ mode: 'country' });
  const tolCountry = c.tol();
  c.setState({ mode: 'cap' });
  c.setZoom(1);
  await sleep(80);

  // A placed answer, so there is a label on the map to look at.
  const id = c.taskIds()[0];
  const box = c.mapBoxRef.current.getBoundingClientRect();
  const g = c.GEO, cap = g.caps[id];
  c.tryPlace(id, box.left + (cap.x / g.W) * box.width, box.top + (cap.y / g.H) * box.height);
  await sleep(40);
  c._factAt = 0;
  c.closeFact();
  await sleep(140);

  // Found by computed style rather than by matching the style attribute: React
  // normalises inline styles, so the literal string never appears there. This is
  // the only element in the document with an opacity transition.
  const label = () => [...document.querySelectorAll('div')]
    .find((el) => getComputedStyle(el).transitionProperty === 'opacity');
  const scaleOf = (el) => {
    const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
    return m ? parseFloat(m[1].split(',')[0]) : null;
  };
  const found = !!label();
  const idle = found ? getComputedStyle(label()).opacity : null;

  c.setState({ dragId: c.taskIds()[0] });
  await sleep(140);
  const dragging = found ? getComputedStyle(label()).opacity : null;
  c.setState({ dragId: null });
  await sleep(140);

  // On-screen size = the label's own scale times the map's. It has to stay 1 at
  // every zoom. Shrinking it with the zoom looks like a way to give the map room
  // back, and is not: a constant-size label already covers less ground the
  // further in you go, so shrinking only makes it unreadable. This is here
  // because that was tried.
  const screenSize = async (z) => {
    c.setZoom(z);
    await sleep(140);
    const el = label();
    return el ? scaleOf(el) * z : null;
  };
  const screenSizes = [];
  for (const z of [1, 2, 4, c.MAX_ZOOM]) screenSizes.push([z, await screenSize(z)]);

  c.setZoom(1);
  c.setState({ screen: 'home', continentId: null });
  await sleep(80);

  return { maxed, floored, base, tolAt2, tolAtMax, tolCountry, found, idle, dragging,
           screenSizes, MAX: c.MAX_ZOOM, TOL: c.TOL_ZOOM };
});

check(zoomBits.maxed === zoomBits.MAX, `zoom reaches x${zoomBits.MAX} (saw x${zoomBits.maxed})`);
check(zoomBits.floored === 1, `and never drops below x1 (saw x${zoomBits.floored})`);
check(Math.abs(zoomBits.tolAt2 - zoomBits.base / 2) < 1e-6,
  'under the cap, the hit tolerance still tightens in step with the zoom');
check(Math.abs(zoomBits.tolAtMax - zoomBits.base / zoomBits.TOL) < 1e-6,
  `over it the tolerance holds, so zooming buys accuracy (${zoomBits.tolAtMax.toFixed(2)} at x${zoomBits.MAX}, not ${(zoomBits.base / zoomBits.MAX).toFixed(2)})`);
check(zoomBits.tolCountry === zoomBits.base, 'country mode is still untouched by the zoom');
check(zoomBits.found, 'a placed answer leaves a label on the map');
check(Number(zoomBits.idle) === 1, `that label is opaque with nothing in hand (saw ${zoomBits.idle})`);
check(Number(zoomBits.dragging) < 0.5,
  `and steps aside while an answer is held (saw ${zoomBits.dragging})`);
const wrongSize = zoomBits.screenSizes.filter(([, s]) => Math.abs(s - 1) > 0.02);
check(wrongSize.length === 0,
  `a label keeps its on-screen size at every zoom (${zoomBits.screenSizes.map(([z, s]) => 'x' + z + ':' + s.toFixed(2)).join(', ')})`);

// ---- preferences and the reset ----
console.log('\npreferences');
const prefs = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Sound is a preference like the language, not a per-session default. Its
  // button lives in the play bar, so the round has to be open to reach it.
  c.setState({ mode: 'cap', continentId: 'amerique-sud', screen: 'continent' });
  await sleep(50);
  c.startLevel('sa-cone-sud');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
  c.renderVals().onToggleSound();
  await sleep(40);
  const soundWritten = localStorage.getItem('worldcapitals_sound');
  const soundState = c.state.soundOn;

  // The reset control only exists once there is progress to erase.
  c.setState({ screen: 'home', continentId: null, progress: {} });
  await sleep(40);
  const emptyHidesIt = c.renderVals().canReset === false;

  c.setState({ progress: { 'cap:europe:eu-nord': { stars: 3, best: 90 },
                           'cap:europe:eu-sud': { stars: 2, best: 70 } } });
  localStorage.setItem('worldcapitals_v1', JSON.stringify(c.state.progress));
  await sleep(40);
  const v = c.renderVals();
  const offered = { canReset: v.canReset, body: v.resetBody };

  v.onConfirmReset();
  await sleep(60);
  return {
    soundWritten, soundState, emptyHidesIt, offered,
    after: Object.keys(c.state.progress).length,
    storage: localStorage.getItem('worldcapitals_v1'),
  };
});

check(prefs.soundWritten === 'off' && prefs.soundState === false,
  `muting is remembered (worldcapitals_sound = "${prefs.soundWritten}")`);
check(prefs.emptyHidesIt, 'no reset control when there is nothing to erase');
check(prefs.offered.canReset, 'the reset control appears once levels have results');
check(/2/.test(prefs.offered.body), `the confirmation counts what is at stake ("${prefs.offered.body}")`);
check(prefs.after === 0 && prefs.storage === null,
  `resetting clears both the state and localStorage (${prefs.after} left, storage ${prefs.storage})`);

// ---- the colour scheme is declared ----
// Not decoration: without this tag Chrome on Android inverts the whole game by
// itself, and the inversion pushes a country's fill and its border to the same
// darkness — the borders vanish where two selected countries meet. A tester hit
// exactly that. "only light" is what turns the mechanism off.
console.log('\ncolour scheme');
const scheme = await page.evaluate(() =>
  (document.querySelector('meta[name="color-scheme"]') || {}).content);
check(scheme === 'only light',
  `the page declares it has no dark mode (saw "${scheme}")`);

// ---- the social preview ----
// The tags ship relative and the deploy stamps them absolute. Both halves have
// to agree: these are the exact values tools/stamp-social-url.mjs matches on,
// so a change here that forgot that script would ship a preview no unfurler can
// fetch — and platform caches make that expensive to notice late.
console.log('\nsocial preview');
const og = await page.evaluate(() => {
  const meta = (p) => (document.querySelector(`meta[property="${p}"]`) || {}).content;
  return {
    canonical: (document.querySelector('link[rel="canonical"]') || {}).getAttribute?.('href'),
    url: meta('og:url'),
    image: meta('og:image'),
    title: meta('og:title'),
    description: meta('og:description'),
    width: meta('og:image:width'),
    height: meta('og:image:height'),
    card: (document.querySelector('meta[name="twitter:card"]') || {}).content,
  };
});
check(!!og.title && !!og.description, 'og:title and og:description are set');
check(og.card === 'summary_large_image', `twitter:card asks for the large layout (saw "${og.card}")`);
check(og.canonical === './' && og.url === './' && og.image === 'assets/social-card.png',
  'the three stamped URLs ship relative, exactly as the stamp script expects them');

const card = path.join(ROOT, 'assets', 'social-card.png');
check(fs.existsSync(card), 'assets/social-card.png exists');
if (fs.existsSync(card)) {
  // PNG header: width and height are big-endian uint32 at bytes 16 and 20.
  const head = fs.readFileSync(card).subarray(0, 24);
  const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
  check(String(w) === og.width && String(h) === og.height,
    `og:image:width/height match the file (${w}x${h} vs ${og.width}x${og.height})`);
  check(w === 1200 && h === 630, `the card is 1200x630 (saw ${w}x${h})`);
}

// ---- leaving a level ----
// Nothing about a half-played round is saved anywhere, so the back button asks
// before discarding it — but only once there is something to discard.
console.log('\nleaving a level');
const quit = await page.evaluate(async () => {
  const c = window.__dc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const enter = async () => {
    c.setState({ mode: 'cap', continentId: 'amerique-sud', screen: 'continent' });
    await sleep(50);
    c.startLevel('sa-cone-sud');
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  };
  const placeOne = async () => {
    const id = c.taskIds()[0], g = c.GEO, cap = g.caps[id];
    const b = c.mapBoxRef.current.getBoundingClientRect();
    c.tryPlace(id, b.left + (cap.x / g.W) * b.width, b.top + (cap.y / g.H) * b.height);
    await sleep(20); c._factAt = 0; c.closeFact(); await sleep(20);
  };

  // Nothing placed: straight out, no dialog.
  await enter();
  c.tryLeaveLevel();
  const untouched = { asked: c.state.quitOpen, screen: c.state.screen };

  // One placed: it asks, and staying really does stay.
  await enter();
  await placeOne();
  c.tryLeaveLevel();
  const asked = { asked: c.state.quitOpen, screen: c.state.screen, body: c.renderVals().quitBody };
  c.setState({ quitOpen: false });                     // "keep playing"
  const stayed = { screen: c.state.screen, placed: Object.keys(c.state.placed).length };

  // Confirming leaves for real.
  c.tryLeaveLevel();
  c.leaveLevel();
  const left = { screen: c.state.screen, asked: c.state.quitOpen };

  return { untouched, asked, stayed, left };
});

check(!quit.untouched.asked && quit.untouched.screen === 'continent',
  'backing out of an untouched level does not ask');
check(quit.asked.asked && quit.asked.screen === 'play',
  'backing out after placing one asks, and stays on the map meanwhile');
check(/1 \/ 5/.test(quit.asked.body), `the dialog says what is at stake ("${quit.asked.body}")`);
check(quit.stayed.screen === 'play' && quit.stayed.placed === 1,
  'keeping playing leaves the round exactly as it was');
check(quit.left.screen === 'continent' && !quit.left.asked, 'confirming leaves the level');

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
  const declared = await page.getAttribute('html', 'lang');
  check(declared === lang, `${lang}: <html lang> follows the language (saw "${declared}")`);
}

// The button is not the only way in: a returning player has their language
// restored from localStorage before touching anything, and that is the path
// where a hardcoded lang="fr" would ship English text as French.
await page.evaluate(() => localStorage.setItem('worldcapitals_lang', 'en'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=/GEOGRAPHY/', { timeout: 15000 });
const restored = await page.getAttribute('html', 'lang');
check(restored === 'en', `a reload with English saved declares lang="en" (saw "${restored}")`);

// With nothing saved, the device decides. This is a player's very first launch,
// and it is what a localised store listing promises: an English listing that
// opened in French would contradict the name they installed it under. German is
// here for the fallback — every language without its own translation gets
// English, matching res/values/strings.xml.
for (const [locale, want] of [['en-US', 'en'], ['fr-FR', 'fr'], ['de-DE', 'en']]) {
  const fresh = await browser.newPage({ locale });
  await fresh.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get: () => ({ register: () => Promise.resolve() }),
    });
  });
  await fresh.goto(base, { waitUntil: 'networkidle' });
  await fresh.waitForSelector('text=/GÉOGRAPHIE|GEOGRAPHY/', { timeout: 15000 });
  const got = await fresh.getAttribute('html', 'lang');
  check(got === want, `a fresh ${locale} device opens in "${want}" (saw "${got}")`);
  await fresh.close();
}

console.log('\nconsole');
check(errors.length === 0, `no unexpected page errors${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
if (ignoredNoise) console.log(`  note  ${ignoredNoise} expected console message(s) ignored (inert template attributes)`);

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
