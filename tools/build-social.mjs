// Renders assets/social-card.png, the 1200x630 image that unfurlers show when
// the link is shared (og:image).
//
//   node build-social.mjs      (or: npm run social)
//
// Built from the generated data rather than drawn by hand, so the card cannot
// drift from the game: the shapes are assets/geo/world.js, and every country is
// filled with its own continent's colour out of assets/data/. Adding a country
// or restyling a continent and re-running this keeps the two in step.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ASSETS, 'social-card.png');

// The size every unfurler expects. Below 600x315 most of them fall back to the
// small square layout, which is what this card exists to avoid.
const W = 1200, H = 630;

const countries = load('data/countries.js', (w) => w.WORLD_DATA.countries);
const continents = load('data/regions.js', (w) => w.WORLD_DATA.continents);
const geo = load('geo/world.js', (w) => w.WORLD_GEO.world);

// Latin subsets of the two families the game uses, inlined as data: URIs so the
// render needs no server and no network.
const fredoka = b64('asset_5.woff2');
const nunito = b64('asset_15.woff2');

// Scale the map to cover the card, then bleed it off both sides rather than
// letterboxing: at 1400x720 it is almost exactly a card's aspect ratio already.
const scale = H / geo.H;
const mapW = geo.W * scale;

const shapes = geo.countries.map((c) => {
  const cont = continents[(countries[c.id] || {}).cont];
  return `<path d="${c.d}" fill="${cont ? cont.bg : '#C9A86B'}" fill-opacity=".85" ` +
         `stroke="${cont ? cont.shadow : '#A98A5B'}" stroke-width="1.2" stroke-linejoin="round"/>`;
}).join('');

const html = `
<style>
  @font-face { font-family:'Fredoka'; src:url(data:font/woff2;base64,${fredoka}) format('woff2'); font-weight:300 700; }
  @font-face { font-family:'Nunito';  src:url(data:font/woff2;base64,${nunito})  format('woff2'); font-weight:200 1000; }
  * { box-sizing:border-box; margin:0; }
  body { width:${W}px; height:${H}px; overflow:hidden; }
  .card { position:relative; width:${W}px; height:${H}px; overflow:hidden;
          background:radial-gradient(120% 120% at 50% 0%, #FCF4E2 0%, #F6E9CD 100%); }
  .map  { position:absolute; top:0; left:${(W - mapW) / 2}px; width:${mapW}px; height:${H}px;
          filter:drop-shadow(0 6px 10px rgba(0,0,0,.10)); }
  /* A card in the game's own visual language rather than a gradient veil over
     half the image: the title gets solid contrast inside a defined shape, and
     the map stays fully saturated everywhere around it — including over the
     Americas, which a left-hand veil washed out on a card titled "the World". */
  .text { position:absolute; left:52px; top:50%; transform:translateY(-50%); width:556px;
          background:#FFFDF7; border:2px solid #EAD7B0; border-radius:30px;
          box-shadow:0 10px 0 rgba(234,215,176,.55), 0 26px 50px rgba(90,60,25,.16);
          padding:38px 40px 40px; }
  .badge { display:inline-flex; align-items:center; gap:10px; align-self:flex-start;
           background:#fff; border:2px solid #EAD7B0; border-radius:999px; padding:7px 18px 7px 9px;
           font-family:'Nunito'; font-weight:800; font-size:15px; letter-spacing:.5px; color:#B07B3A;
           box-shadow:0 3px 0 #EAD7B0; }
  .dot { width:24px; height:24px; border-radius:50%; background:#E2A24B; }
  h1 { font-family:'Fredoka'; font-weight:700; font-size:56px; line-height:1.02;
       letter-spacing:-1px; color:#3B2F27; margin:18px 0 0; }
  h2 { font-family:'Fredoka'; font-weight:500; font-size:34px; line-height:1.05;
       letter-spacing:-.5px; color:#A6825A; margin:8px 0 0; }
  .facts { display:flex; gap:9px; margin-top:22px; flex-wrap:wrap; }
  .chip { font-family:'Nunito'; font-weight:800; font-size:16px; color:#fff;
          border-radius:10px; padding:8px 15px; }
</style>
<div class="card">
  <svg class="map" viewBox="0 0 ${geo.W} ${geo.H}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>
  <div class="text">
    <div class="badge"><span class="dot"></span>GÉOGRAPHIE · GEOGRAPHY</div>
    <h1>Les Capitales<br>du Monde</h1>
    <h2>Capitals of the World</h2>
    <div class="facts">
      <span class="chip" style="background:#E2A24B">Capitales</span>
      <span class="chip" style="background:#3F9E78">Pays</span>
      <span class="chip" style="background:#B06A9A">Drapeaux</span>
      <span class="chip" style="background:#7A5CB0">195 pays · FR / EN</span>
    </div>
  </div>
</div>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);   // or the first paint ships fallback glyphs
await page.screenshot({ path: OUT });
await browser.close();

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`social-card.png  ${W}×${H}  ${kb} kB  ${geo.countries.length} shapes`);

function load(rel, pick) {
  const file = path.join(ASSETS, rel);
  if (!fs.existsSync(file)) {
    console.error(`assets/${rel} missing — run \`npm run data\` and \`npm run geo\` first`);
    process.exit(1);
  }
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(file, 'utf8')).call(sandbox, sandbox.window);
  return pick(sandbox.window);
}

function b64(name) { return fs.readFileSync(path.join(ASSETS, name)).toString('base64'); }
