// One-shot helper: lifts the African anecdotes out of africa-capitals-game's
// index.html (where they are split between the `C` and `XF` objects) into the
// {ISO3: {fr:[], en:[]}} shape facts-source.mjs uses.
//
//   node extract-africa-facts.mjs ../../africa-capitals-game/index.html
//
// Prints the block to stdout; it was pasted into facts-source.mjs once and this
// script is kept only so the provenance of those 54 entries is reproducible.

import fs from 'node:fs';

const src = fs.readFileSync(process.argv[2] || '../../africa-capitals-game/index.html', 'utf8');

// The two objects are plain JS literals in the middle of a <script> block, so
// evaluate just those slices rather than trying to regex out every field.
const C = evalObject(src, '\n  C = {');
const XF = evalObject(src, '\n  XF = {');

const out = {};
for (const id of Object.keys(C)) {
  const extra = XF[id] || { ff: [], fe: [] };
  out[id] = {
    fr: [C[id].ff, ...(extra.ff || [])],
    en: [C[id].fe, ...(extra.fe || [])],
  };
}

const lines = Object.keys(out).sort().map((id) =>
  `  ${id}: { fr: ${JSON.stringify(out[id].fr)},\n        en: ${JSON.stringify(out[id].en)} },`);
console.log(lines.join('\n'));
console.error(`${Object.keys(out).length} countries, ${Object.values(out).reduce((n, f) => n + f.fr.length, 0)} facts`);

function evalObject(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`marker ${JSON.stringify(marker)} not found`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return new Function(`return ${text.slice(open, i + 1)}`)();
    }
  }
  throw new Error('unbalanced braces');
}
