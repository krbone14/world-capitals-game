// Renders the Google Play listing images into store/<lang>/.
//
//   node build-store-assets.mjs      (or: npm run store)
//
// Six phone screenshots and the 1024x500 feature graphic, in each language the
// listing is published in. Play keeps a separate set of images per language, and
// a French screenshot on an English listing is worse than none: it advertises an
// app the visitor cannot read.
//
// The screenshots are taken from the real game driven by a real browser rather
// than mocked up, so a listing cannot end up showing a screen the app does not
// have. Since the game follows the device's language, the locale of the browser
// context is what selects the language — there is no test-only switch involved,
// which is also what makes these a fair picture of what a visitor installs.
//
// Play's rules these sizes come from: a screenshot must be 16:9 or 9:16 with
// every side between 320 and 3840 px; the feature graphic must be exactly
// 1024x500, and Play draws its own controls near its edges, so nothing that has
// to be read goes there.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'store');

// 540x960 CSS pixels at 2x: a 9:16 phone, and 1080x1920 out.
const PHONE = { width: 540, height: 960 };
const SCALE = 2;

// `play` is the label on the button that opens a region — the one selector here
// written in the game's own words, so it travels with the locale.
const LANGS = [
  { code: 'fr', locale: 'fr-FR', play: 'Jouer' },
  { code: 'en', locale: 'en-US', play: 'Play' },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
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

const countries = load('data/countries.js', (w) => w.WORLD_DATA.countries);
const continents = load('data/regions.js', (w) => w.WORLD_DATA.continents);
const geo = load('geo/world.js', (w) => w.WORLD_GEO.world);

const browser = await launchChromium();
const written = [];

for (const lang of LANGS) {
  const dir = path.join(OUT, lang.code);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await screenshots(lang, dir);
  await featureGraphic(lang, dir);
}

await browser.close();
server.close();

for (const rel of written) {
  const b = fs.readFileSync(path.join(OUT, rel));
  console.log(`  ${rel.replace(/\\/g, '/').padEnd(26)} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  ${(b.length / 1024).toFixed(0)} kB`);
}
console.log(`store assets OK — ${written.length} images across ${LANGS.length} languages`);

// ---------------------------------------------------------------- screenshots
async function screenshots(lang, dir) {
  const page = await browser.newPage({
    viewport: PHONE,
    deviceScaleFactor: SCALE,
    locale: lang.locale,
  });

  // The service worker would serve a previous run's files.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get: () => ({ register: () => Promise.resolve() }),
    });
  });

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=/GÉOGRAPHIE|GEOGRAPHY/', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);

  // The language the game actually chose, rather than the one asked for: a
  // screenshot set silently captured in the wrong language would be discovered
  // on the listing, by a visitor.
  const got = await page.getAttribute('html', 'lang');
  if (got !== lang.code) {
    die(`${lang.locale} opened the game in "${got}", not "${lang.code}" — screenshots would be wrong`);
  }

  await shot('01-home');

  // A continent, with its region cards.
  await openContinent('europe');
  await page.waitForSelector(`button:has-text("${lang.play}")`, { timeout: 15000 });
  await settle();
  await shot('02-continent');

  // Mid-round, so a screenshot shows a board in progress rather than an
  // untouched one — and on a region big enough to leave the label tray full. A
  // five-country region placed half way leaves two labels and a lot of empty
  // screen.
  await playPartly('europe', 'eu-nord', 'cap', 0.5);
  await shot('03-capitals');

  // The anecdote popup, on the next correct answer.
  await placeNext();
  await shot('04-fact');

  // A different continent for flag mode: it fills the tray with sixteen of them,
  // and the listing then shows two of the seven maps rather than one twice.
  await playPartly('afrique', 'af-ouest', 'flag', 0.35);
  await shot('05-flags');

  // The result screen, from a round played correctly all the way through.
  await playPartly('europe', 'eu-ouest', 'country', 1);
  await page.waitForFunction(() => window.__dc.state.screen === 'result', { timeout: 15000 });
  await settle(1200);
  await shot('06-result');

  await page.close();

  async function shot(name) {
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    written.push(path.join(lang.code, `${name}.png`));
  }

  // Lets an animation, and the confetti, finish before the shutter.
  async function settle(ms = 700) { await page.waitForTimeout(ms); }

  // Opens a continent and waits for its map file, which loads on demand.
  async function openContinent(id) {
    await page.evaluate((c) => window.__dc.openContinent(c), id);
    await page.waitForFunction((c) => {
      const d = window.WORLD_DATA;
      return !!(window.WORLD_GEO || {})[d.continents[c].geo];
    }, id, { timeout: 15000 });
  }

  // Starts the level fresh in `mode` and plays `fraction` of it correctly.
  async function playPartly(contId, regionId, mode, fraction) {
    await openContinent(contId);
    await page.evaluate(async ({ contId, regionId, mode, fraction }) => {
      const c = window.__dc;
      c.setState({ mode, continentId: contId, screen: 'continent' });
      await new Promise((r) => setTimeout(r, 60));
      c.startLevel(regionId);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 140)));

      const ids = c.taskIds();
      const upto = Math.max(1, Math.round(ids.length * fraction));
      for (const id of ids.slice(0, upto)) {
        const box = c.mapBoxRef.current.getBoundingClientRect();
        const g = c.GEO, cap = g.caps[id];
        c.tryPlace(id, box.left + (cap.x / g.W) * box.width, box.top + (cap.y / g.H) * box.height);
        await new Promise((r) => setTimeout(r, 25));
        c._factAt = 0;          // skip the ghost-click guard on the fact popup
        c.closeFact();
        await new Promise((r) => setTimeout(r, 25));
      }
    }, { contId, regionId, mode, fraction });
    await settle();
  }

  // One more correct answer, leaving its anecdote popup open for the shutter.
  async function placeNext() {
    await page.evaluate(async () => {
      const c = window.__dc;
      const ids = c.taskIds();
      const id = ids.find((x) => !(c.state.done || {})[x]) || ids[ids.length - 1];
      const box = c.mapBoxRef.current.getBoundingClientRect();
      const g = c.GEO, cap = g.caps[id];
      c.tryPlace(id, box.left + (cap.x / g.W) * box.width, box.top + (cap.y / g.H) * box.height);
    });
    await settle();
  }
}

// ----------------------------------------------------------- feature graphic
async function featureGraphic(lang, dir) {
  const FW = 1024, FH = 500;

  const shapes = geo.countries.map((c) => {
    const cont = continents[(countries[c.id] || {}).cont];
    return `<path d="${c.d}" fill="${cont ? cont.bg : '#C9A86B'}" fill-opacity=".85" ` +
           `stroke="${cont ? cont.shadow : '#A98A5B'}" stroke-width="1.2" stroke-linejoin="round"/>`;
  }).join('');

  // Cover the banner with the map and bleed it off both sides. The banner is far
  // wider than it is tall, so it crops to the populated middle latitudes.
  const mapScale = FH / geo.H;
  const mapW = geo.W * mapScale;

  const fredoka = b64('asset_5.woff2');
  const nunito = b64('asset_15.woff2');

  // Each banner speaks one language. The subtitle used to carry the title in the
  // other one, to say the game is bilingual — but on an English listing a French
  // line under the title does not read as "bilingual", it reads as a mistake.
  // The last chip says it instead, where it is a feature rather than an error.
  const copy = lang.code === 'fr' ? {
    badge: 'GÉOGRAPHIE',
    title: 'Les Capitales<br>du Monde',
    sub: 'Apprends le monde en jouant',
    chips: ['Capitales', 'Pays', 'Drapeaux', '195 pays · FR / EN'],
  } : {
    badge: 'GEOGRAPHY',
    title: 'Capitals of<br>the World',
    sub: 'Learn the world by playing',
    chips: ['Capitals', 'Countries', 'Flags', '195 countries · EN / FR'],
  };

  const chipColours = ['#E2A24B', '#3F9E78', '#B06A9A', '#7A5CB0'];

  const html = `
<style>
  @font-face { font-family:'Fredoka'; src:url(data:font/woff2;base64,${fredoka}) format('woff2'); font-weight:300 700; }
  @font-face { font-family:'Nunito';  src:url(data:font/woff2;base64,${nunito})  format('woff2'); font-weight:200 1000; }
  * { box-sizing:border-box; margin:0; }
  body { width:${FW}px; height:${FH}px; overflow:hidden; }
  .card { position:relative; width:${FW}px; height:${FH}px; overflow:hidden;
          background:radial-gradient(120% 120% at 50% 0%, #FCF4E2 0%, #F6E9CD 100%); }
  .map  { position:absolute; top:0; left:${(FW - mapW) / 2}px; width:${mapW}px; height:${FH}px;
          filter:drop-shadow(0 6px 10px rgba(0,0,0,.10)); }
  /* A full-height panel rather than a floating card. The banner is only 500px
     tall, so a centred card leaves slivers of map above and below it — the tip
     of South America poking out under the title reads as a rendering fault
     rather than as geography. A panel that reaches both edges cannot do that. */
  .text { position:absolute; left:0; top:0; width:512px; height:${FH}px;
          display:flex; flex-direction:column; justify-content:center;
          background:#FFFDF7; border-right:3px solid #EAD7B0;
          box-shadow:14px 0 44px rgba(90,60,25,.18);
          padding:0 46px; }
  .badge { display:inline-flex; align-items:center; align-self:flex-start; gap:9px;
           background:#fff; border:2px solid #EAD7B0; border-radius:999px; padding:6px 15px 6px 8px;
           font-family:'Nunito'; font-weight:800; font-size:13px; letter-spacing:.5px; color:#B07B3A;
           box-shadow:0 3px 0 #EAD7B0; }
  .dot { width:20px; height:20px; border-radius:50%; background:#E2A24B; }
  h1 { font-family:'Fredoka'; font-weight:700; font-size:46px; line-height:1.02;
       letter-spacing:-1px; color:#3B2F27; margin:15px 0 0; }
  h2 { font-family:'Fredoka'; font-weight:500; font-size:27px; line-height:1.05;
       letter-spacing:-.5px; color:#A6825A; margin:6px 0 0; }
  .facts { display:flex; gap:8px; margin-top:18px; flex-wrap:wrap; }
  .chip { font-family:'Nunito'; font-weight:800; font-size:14px; color:#fff;
          border-radius:9px; padding:7px 13px; }
</style>
<div class="card">
  <svg class="map" viewBox="0 0 ${geo.W} ${geo.H}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>
  <div class="text">
    <div class="badge"><span class="dot"></span>${copy.badge}</div>
    <h1>${copy.title}</h1>
    <h2>${copy.sub}</h2>
    <div class="facts">
      ${copy.chips.map((c, i) => `<span class="chip" style="background:${chipColours[i]}">${c}</span>`).join('\n      ')}
    </div>
  </div>
</div>`;

  const page = await browser.newPage({ viewport: { width: FW, height: FH }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, 'feature-graphic.png') });
  await page.close();
  written.push(path.join(lang.code, 'feature-graphic.png'));
}

function load(rel, pick) {
  const file = path.join(ASSETS, rel);
  if (!fs.existsSync(file)) die(`assets/${rel} missing — run \`npm run data\` and \`npm run geo\` first`);
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(file, 'utf8')).call(sandbox, sandbox.window);
  return pick(sandbox.window);
}

function b64(name) { return fs.readFileSync(path.join(ASSETS, name)).toString('base64'); }
function die(msg) { console.error(msg); process.exit(1); }
