// Generates the Android launcher icons and splash screens from icons/icon-512.png.
//
//   node build-android-icons.mjs      (or: npm run android:icons)
//
// Capacitor scaffolds its own placeholder icon, which is the one thing in a
// generated Android project that a player actually sees. Rather than keep a
// second set of hand-made PNGs in the repository, every size is rendered here
// from the same 512px icon the PWA already ships, and the colours are read from
// manifest.json — so the app in the launcher cannot drift from the app on the
// web.
//
// The adaptive icon (Android 8+) is a foreground layer over a solid background:
// icon-512 is full-bleed orange with the pin centred, so it serves as the
// foreground as-is and the background colour is sampled from its own corner.
// Whatever shape the launcher masks with, it only ever crops flat orange.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(RES)) die('android/ is missing — run `npx cap add android` first');

const SOURCE = path.join(ROOT, 'icons', 'icon-512.png');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// Launcher icons are specified in dp; these are the five density buckets Android
// asks for, as the pixel size each one wants for a 48dp legacy icon and for the
// 108dp adaptive layer.
const DENSITIES = [
  ['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4],
];

// The splash is a plain window background, so it only has to cover the screen;
// these are the sizes Capacitor's own template ships, kept as they are.
const SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-port-mdpi', 320, 480], ['drawable-land-mdpi', 480, 320],
  ['drawable-port-hdpi', 480, 800], ['drawable-land-hdpi', 800, 480],
  ['drawable-port-xhdpi', 720, 1280], ['drawable-land-xhdpi', 1280, 720],
  ['drawable-port-xxhdpi', 960, 1600], ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-port-xxxhdpi', 1280, 1920], ['drawable-land-xxxhdpi', 1920, 1280],
];

const icon = 'data:image/png;base64,' + fs.readFileSync(SOURCE).toString('base64');

const browser = await launchChromium();
const page = await browser.newPage();
await page.setContent('<body style="margin:0">');

const jobs = [];
for (const [density, scale] of DENSITIES) {
  jobs.push([`mipmap-${density}/ic_launcher.png`, 'square', Math.round(48 * scale)]);
  jobs.push([`mipmap-${density}/ic_launcher_round.png`, 'round', Math.round(48 * scale)]);
  jobs.push([`mipmap-${density}/ic_launcher_foreground.png`, 'square', Math.round(108 * scale)]);
}

const { corner, images } = await page.evaluate(async ({ icon, jobs, splashes, splashBg }) => {
  const img = new Image();
  img.src = icon;
  await img.decode();

  const draw = (size, shape) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (shape === 'round') {
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      g.clip();
    }
    g.drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  };

  // The flat field the pin sits on, read two pixels in from the corner so a
  // stray edge pixel cannot decide the whole background colour.
  const probe = document.createElement('canvas');
  probe.width = probe.height = img.width;
  probe.getContext('2d').drawImage(img, 0, 0);
  const [r, g, b] = probe.getContext('2d').getImageData(2, 2, 1, 1).data;
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

  const images = {};
  for (const [file, shape, size] of jobs) images[file] = draw(size, shape);

  // Splash: the app's own background colour with the icon centred at a quarter
  // of the short edge, which is what the web app fades in from. Masked to a
  // circle — icon-512 is a full-bleed square, and dropping that square whole
  // onto the cream reads as a rendering mistake rather than a logo.
  for (const [dir, w, h] of splashes) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = splashBg;
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    const s = Math.round(Math.min(w, h) / 4);
    g.save();
    g.beginPath();
    g.arc(w / 2, h / 2, s / 2, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, Math.round((w - s) / 2), Math.round((h - s) / 2), s, s);
    g.restore();
    images[dir + '/splash.png'] = c.toDataURL('image/png');
  }

  return { corner: hex, images };
}, { icon, jobs, splashes: SPLASHES, splashBg: manifest.background_color });

await browser.close();

let written = 0;
for (const [rel, dataUrl] of Object.entries(images)) {
  const dest = path.join(RES, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(dataUrl.split(',')[1], 'base64'));
  written++;
}

// The adaptive icon's background layer. Sampled rather than written down, so
// restyling icon-512.png is the only edit a new look needs.
fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${corner}</color>\n</resources>\n`);

console.log(`android icons OK — ${written} images written, background sampled as ${corner}`);

function die(msg) { console.error(msg); process.exit(1); }
