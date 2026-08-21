// Renders each generated map to tools/.preview/<map>.png so a projection or a
// simplification tolerance can be judged by eye instead of by byte count.
// Capitals are drawn as dots, island (dot-target) countries in a second colour.
//
//   node preview-geo.mjs           # all maps
//   node preview-geo.mjs europe

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GEO = path.join(HERE, '..', 'assets', 'geo');
const OUT = path.join(HERE, '.preview');

const only = process.argv[2];
const files = fs.readdirSync(GEO).filter((f) => f.endsWith('.js') && (!only || f === `${only}.js`));
if (!files.length) throw new Error(only ? `no assets/geo/${only}.js` : 'no maps generated yet');

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchChromium();

for (const file of files) {
  const mapId = file.replace(/\.js$/, '');
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(GEO, file), 'utf8')).call(sandbox, sandbox.window);
  const g = sandbox.window.WORLD_GEO[mapId];

  const paths = g.countries
    .map((c) => `<path d="${c.d}" fill="#E8D9BC" stroke="#B08A4B" stroke-width="1" stroke-linejoin="round"/>`)
    .join('');
  const capDots = Object.entries(g.caps).map(([id, c]) =>
    `<circle cx="${c.x}" cy="${c.y}" r="${c.island ? 6 : 3}" fill="${c.island ? '#C4553F' : '#3B2F27'}"/>`).join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.W} ${g.H}" width="${g.W}" height="${g.H}">` +
    `<rect width="${g.W}" height="${g.H}" fill="#F6E9CD"/>${paths}${capDots}</svg>`;

  const page = await browser.newPage({ viewport: { width: g.W, height: g.H } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: path.join(OUT, `${mapId}.png`) });
  await page.close();
  console.log(`${mapId}.png  ${g.W}×${g.H}  ${g.countries.length} shapes`);
}

await browser.close();
