// Downloads the country flags into assets/flags/, one PNG per ISO-2 code.
//
//   node build-flags.mjs           (or: npm run flags)
//   node build-flags.mjs --force   re-fetch the ones already on disk
//
// Why the game stopped pointing at flagcdn.com: the Android package ships the
// site inside the APK and serves it from a local origin, where the service
// worker that warmed the flag cache never runs. Flag mode would then want the
// network on a game whose whole point is that it works without one. Fetching
// them once at build time makes the payload self-contained — and the web
// version gets the same independence, plus 195 fewer requests on first play.
//
// ~600 kB in total, small enough to commit: that is what keeps a fresh clone
// playable without running this at all.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'assets', 'flags');

// w160 is what the game asked flagcdn for, and what the biggest on-screen flag
// (the fact card) is drawn at. Anything larger is bytes no player ever sees.
const SOURCE = (i2) => `https://flagcdn.com/w160/${i2}.png`;

// Enough to saturate a connection without looking like a scrape to the CDN.
const PARALLEL = 8;

const force = process.argv.includes('--force');

// The codes come out of the generated data rather than a list kept here, so
// adding a country never means remembering to edit this file too.
const src = fs.readFileSync(path.join(ROOT, 'assets', 'data', 'countries.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', src).call(sandbox, sandbox.window);
const countries = sandbox.window.WORLD_DATA.countries;

const codes = [...new Set(Object.values(countries).map((c) => c.i2))].sort();
if (!codes.length) die('no ISO-2 codes in assets/data/countries.js — run `npm run data` first');

fs.mkdirSync(OUT, { recursive: true });

const todo = codes.filter((i2) => force || !fs.existsSync(path.join(OUT, `${i2}.png`)));
if (!todo.length) {
  console.log(`flags OK — ${codes.length} already on disk, nothing to fetch (--force to re-fetch)`);
  process.exit(0);
}

console.log(`fetching ${todo.length} flag(s) from flagcdn.com...`);

const problems = [];
let done = 0;

// A plain worker pool: PARALLEL fetches walking one shared cursor.
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, async () => {
  while (cursor < todo.length) {
    const i2 = todo[cursor++];
    try {
      await fetchFlag(i2);
      done++;
    } catch (err) {
      problems.push(`${i2}: ${err.message}`);
    }
  }
}));

if (problems.length) {
  console.error(`\n${problems.length} flag(s) failed:`);
  for (const p of problems) console.error(`  ${p}`);
  die('incomplete — nothing was written for those, re-run to retry just them');
}

console.log(`flags OK — ${done} fetched, ${codes.length} on disk in assets/flags/`);

async function fetchFlag(i2) {
  const res = await fetch(SOURCE(i2));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  // A CDN that answers 200 with an error page would otherwise ship a file that
  // renders as a broken image in the game and nowhere else — check the PNG
  // signature rather than trusting the status line.
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`not a PNG (${buf.length} bytes)`);
  }
  // Written under a temporary name and renamed, so an interrupted run leaves no
  // half-file that the next one would skip as already present.
  const dest = path.join(OUT, `${i2}.png`);
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
}

function die(msg) { console.error(msg); process.exit(1); }
