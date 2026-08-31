// Draws the app icon into icons/, at the three sizes the web app references.
//
//   node build-icon.mjs      (or: npm run icon)
//
// The icon is the world the game is about, with the pin the player drops on it.
// It is drawn from assets/geo/world.js in the continent colours of
// assets/data/regions.js rather than kept as an opaque PNG someone once
// exported, so recolouring a continent or adding a country reaches the icon too.
//
// Everything bleeds to the edge on purpose. Android masks the launcher icon to
// whatever shape the launcher likes — circle, squircle, rounded square — and an
// icon drawn with a margin loses that margin twice: once to the mask, once to
// the adaptive icon's own 108dp-to-72dp crop. Filling the square means the mask
// only ever eats ocean.
//
// Run `npm run android-icons` after this to push the change into android/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'icons');

// 512 is what the manifest and the Play listing want, 192 the manifest's other
// entry, 180 the apple-touch-icon in index.html.
const SIZES = [512, 192, 180];

// How much of the world to show. At 1 the whole map fits and the continents are
// too small to tell apart at 48px; this crops to Europe, Africa and western Asia
// — the densest, most recognisable part of the map the game draws.
const ZOOM = 1.6;

// Lighter than the game's own ocean, so the landmasses stay the darker element
// and the silhouette survives being shrunk.
const OCEAN = '#8FC0E4';

const countries = load('data/countries.js', (w) => w.WORLD_DATA.countries);
const continents = load('data/regions.js', (w) => w.WORLD_DATA.continents);
const geo = load('geo/world.js', (w) => w.WORLD_GEO.world);

// A heavier stroke than the map uses in play: a hairline border disappears at
// icon sizes and the continents bleed into one another.
const shapes = geo.countries.map((c) => {
  const cont = continents[(countries[c.id] || {}).cont];
  return `<path d="${c.d}" fill="${cont ? cont.bg : '#C9A86B'}" ` +
         `stroke="${cont ? cont.shadow : '#A98A5B'}" stroke-width="3" stroke-linejoin="round"/>`;
}).join('');

// The pin the game has always used, as a path so it can carry an outline. The
// outline is what keeps it legible against a busy map at 48px — without it the
// white shape dissolves into the pale ocean.
const PIN = 'M32 4C19.3 4 9 14.3 9 27c0 15.5 19.5 31.6 22 33.4.5.4 1.3.4 1.8 0' +
            'C35.4 58.6 55 42.5 55 27 55 14.3 44.7 4 32 4z';

const vb = {
  x: geo.W * (1 - 1 / ZOOM) / 2,
  y: geo.H * (1 - 1 / ZOOM) / 2,
  w: geo.W / ZOOM,
  h: geo.H / ZOOM,
};

const html = `
<style>
  * { box-sizing:border-box; margin:0; }
  body { width:512px; height:512px; }
  .icon { position:relative; width:512px; height:512px; overflow:hidden; background:${OCEAN}; }
  .map { position:absolute; inset:0; width:100%; height:100%; }
  .pin { position:absolute; left:50%; top:50%; transform:translate(-50%,-52%); width:46%;
         filter:drop-shadow(0 7px 9px rgba(30,50,80,.35)); }
  .pin svg { width:100%; height:auto; display:block; }
</style>
<div class="icon">
  <svg class="map" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}"
       preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <rect x="-9999" y="-9999" width="99999" height="99999" fill="${OCEAN}"/>
    ${shapes}
  </svg>
  <div class="pin">
    <svg viewBox="0 0 64 68" xmlns="http://www.w3.org/2000/svg">
      <path d="${PIN}" fill="#FFFDF7" stroke="#3B2F27" stroke-width="2.5"/>
      <circle cx="32" cy="26" r="9.5" fill="#E2A24B"/>
    </svg>
  </div>
</div>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.setContent(html);

for (const size of SIZES) {
  // Rendered at each size rather than downscaled from one 512, so the stroke
  // weights are resolved by the renderer instead of being blurred by a resample.
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate((s) => {
    const scale = s / 512;
    const el = document.querySelector('.icon');
    el.style.transform = `scale(${scale})`;
    el.style.transformOrigin = 'top left';
    document.body.style.width = document.body.style.height = `${s}px`;
  }, size);
  await page.screenshot({ path: path.join(OUT, `icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
}

await browser.close();

for (const size of SIZES) {
  const b = fs.readFileSync(path.join(OUT, `icon-${size}.png`));
  console.log(`  icon-${size}.png`.padEnd(20) + `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  ${(b.length / 1024).toFixed(0)} kB`);
}
console.log(`icons OK — ${SIZES.length} written from ${geo.countries.length} shapes`);

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
