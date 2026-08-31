// Assembles dist/ — the files, and only the files, that a player's browser
// actually loads.
//
//   node build-dist.mjs      (or: npm run dist)
//
// The web deploy has never needed this: GitHub Pages serves the checkout as it
// is, and tools/ and tests/ ride along harmlessly unused. An APK cannot afford
// the same shrug — Capacitor copies webDir wholesale into the package, so
// pointing it at the repository root would ship the build scripts, the test
// suite, the Natural Earth cache and .git to every phone.
//
// The list below is therefore the one authoritative answer to "what is the
// game?", and it is deliberately an allowlist: a new top-level file is left out
// until someone says otherwise, which fails loudly in testing rather than
// quietly bloating the download.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'dist');

const SHIP = ['index.html', 'manifest.json', 'sw.js', 'assets', 'icons'];

// Generated for the link-preview card and referenced only by the og:image meta
// tag, which nothing inside a packaged app ever reads. 60 kB of nothing.
const SKIP = new Set(['social-card.png']);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0, bytes = 0;
const missing = [];

for (const name of SHIP) {
  const from = path.join(ROOT, name);
  if (!fs.existsSync(from)) { missing.push(name); continue; }
  copy(from, path.join(OUT, name));
}

if (missing.length) die(`missing from the checkout: ${missing.join(', ')}`);

// The flags are the one part a build step has to produce, and forgetting it
// yields an app that looks fine until a player opens flag mode on a plane.
if (!fs.existsSync(path.join(OUT, 'assets', 'flags'))) {
  die('assets/flags/ is empty — run `npm run flags` first, or flag mode ships broken');
}

console.log(`dist OK — ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in dist/`);

function copy(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      if (SKIP.has(entry)) continue;
      copy(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  if (SKIP.has(path.basename(from))) return;
  fs.copyFileSync(from, to);
  files++;
  bytes += stat.size;
}

function die(msg) { console.error(msg); process.exit(1); }
