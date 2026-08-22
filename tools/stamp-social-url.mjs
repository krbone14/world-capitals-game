// Rewrites the three relative social URLs in index.html to absolute ones.
//
//   node stamp-social-url.mjs <base-url> [file]
//   node stamp-social-url.mjs https://example.org/game/
//
// Why this exists: og:image, og:url and rel=canonical have to be absolute —
// unfurlers do not resolve relative URLs reliably — but the repository must not
// know where it is deployed. So index.html keeps relative values and the deploy
// stamps them, using the URL the deployment itself reports. Nothing to edit when
// the site moves; see the deploy job in .github/workflows/ci.yml.
//
// It runs on the checkout inside the deploy job, never on your working tree.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const raw = process.argv[2];
if (!raw) die('usage: node stamp-social-url.mjs <base-url> [file]');
if (!/^https?:\/\//.test(raw)) die(`"${raw}" is not an absolute http(s) URL`);
const base = raw.endsWith('/') ? raw : raw + '/';

const file = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'index.html');
if (!fs.existsSync(file)) die(`${file} does not exist`);

// Anchored on the exact relative values index.html ships. A rename that breaks
// one of these fails the deploy rather than silently shipping a card no unfurler
// can fetch — which is the failure this whole mechanism exists to prevent, and
// the one that platform caches make expensive to notice late.
const RULES = [
  ['rel=canonical', '<link rel="canonical" href="./">', `<link rel="canonical" href="${base}">`],
  ['og:url', '<meta property="og:url" content="./">', `<meta property="og:url" content="${base}">`],
  ['og:image', '<meta property="og:image" content="assets/social-card.png">',
    `<meta property="og:image" content="${base}assets/social-card.png">`],
];

let html = fs.readFileSync(file, 'utf8');
const missing = [];
for (const [name, from, to] of RULES) {
  if (!html.includes(from)) { missing.push(name); continue; }
  html = html.replace(from, to);
}
if (missing.length) {
  die(`could not find the relative ${missing.join(', ')} tag(s) in ${path.relative(ROOT, file) || file}.\n` +
      `       Either index.html changed and RULES here needs updating, or this ran twice ` +
      `(the values are already absolute).`);
}

// The image is named by og:image, so a typo there ships a broken preview that
// the platforms then cache. Cheap to check while we are already here.
const img = path.join(path.dirname(file), 'assets', 'social-card.png');
if (!fs.existsSync(img)) die('assets/social-card.png is missing — run `npm run social`');

fs.writeFileSync(file, html);
console.log(`stamped ${base} into rel=canonical, og:url and og:image`);

function die(msg) { console.error(`stamp-social-url: ${msg}`); process.exit(1); }
