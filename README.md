# 🌍 Les Capitales du Monde · Capitals of the World

[![CI](https://github.com/krbone14/world-capitals-game/actions/workflows/ci.yml/badge.svg)](https://github.com/krbone14/world-capitals-game/actions/workflows/ci.yml)

An educational geography game: drag (or tap) each capital — or country, or flag —
onto the right spot of the map. Seven maps, 195 countries, playable on desktop and
mobile, installable and playable offline.

Only interested in Africa? Its own game lives at
[krbone14/africa-capitals-game](https://github.com/krbone14/africa-capitals-game),
and this one grew out of it.

## Features

- **Three game modes** — place the capitals, the countries, or the flags
- **Six continents, 23 regions**, plus a whole-continent challenge for each
- **A world map** as the ultimate challenge: play one continent on it, or all
  172 countries at once
- **Bilingual** — French / English, switchable at any time, remembered
- **Fun facts & flags** — every correct answer shows the country's flag and one
  of 360 rotating anecdotes. Short levels pause on a popup for it; levels of
  more than 20 countries show it beside the map instead and play straight on,
  because 172 popups to dismiss is not a reward. A 📖 button turns them off
- **Mobile friendly** — tap a label then tap the map, pinch to zoom, responsive
- **Installable PWA** — add it to your home screen and play fully offline
- **Score, stars & best-score tracking**, per mode, per continent, per region
- **A hint when you are stuck** — after missing the same country twice, its
  label offers to show you where it is. The round then scores no stars and
  banks nothing, and says so: the stars stay a record of what you knew unaided
- **Replay just your mistakes** — the result screen deals back the countries
  you missed, and only those. It leaves the region's saved stars alone, since
  it is a fraction of the level
- **Sound effects** and confetti 🎉

## Which countries?

195 in the data: the 193 UN member states plus the Vatican and Palestine.

**172 of them are dealt in the rounds.** The 23 micro-states — anything under
1 000 km², from Monaco to Tuvalu — are in the data with their flag, capital and
anecdote, but stay out of the levels because they are too small to aim at. They
carry `tier: 2` in `assets/data/countries.js`; the threshold is one constant
(`MICRO_KM2` in `tools/country-config.mjs`) and the engine reads nothing but the
tier, so bringing them back into play is a small change.

Africa's five island states (Cape Verde, Comoros, Mauritius, São Tomé, the
Seychelles) are exempt and stay playable, because they always were in the Africa
game and the two should not contradict each other.

## Run locally

No build step — it is a static page. Serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Project structure

```
index.html              # the whole game: UI template + game logic
manifest.json           # PWA manifest
sw.js                   # service worker: offline cache
assets/
  data/countries.js     # 195 countries: names, capitals, continent, region, tier
  data/regions.js       # 6 continents + the world map, and their regions
  data/facts.js         # 360 bilingual anecdotes
  geo/<map>.js          # SVG paths + capital coordinates, one file per map
  social-card.png       # 1200x630 link preview (generated, do not edit)
  vendor/               # React 18.3.1 UMD, served from this origin
  dc-runtime.js         # declarative-component runtime (generated, do not edit)
  asset_*.woff2         # Fredoka & Nunito (self-hosted)
tools/                  # build scripts — never served to the browser
tests/smoke.mjs         # end-to-end test, drives a real Chromium
```

Country flags come from [flagcdn.com](https://flagcdn.com) and are cached by the
service worker in the background after install, so flag mode works offline too.

## Regenerating the data

Everything under `assets/data/` and `assets/geo/` is generated. Edit the sources
in `tools/`, never the output.

```bash
cd tools && npm install

npm run data       # countries.js, regions.js, facts.js
npm run geo        # the seven maps  (npm run geo -- europe for just one)
npm run validate   # check the generated files against each other
npm run social     # assets/social-card.png, the link-preview image
node preview-geo.mjs   # render each map to tools/.preview/*.png for review
```

| To change | Edit |
|---|---|
| which countries exist, and their region | `REGION_MEMBERS` in `tools/country-config.mjs` |
| a wrong name or capital | `OVERRIDES` in `tools/country-config.mjs` |
| which states count as micro | `MICRO_KM2` and `AREA_KM2`, same file |
| region names, colours, order | `CONTINENTS`, same file |
| an anecdote | `tools/facts-world.mjs` (Africa: `tools/facts-africa.mjs`) |
| a map's projection or framing | `MAPS` in `tools/build-geo.mjs` |
| the link-preview card | `tools/build-social.mjs`, then `npm run social` |

Map geometry comes from [Natural Earth](https://www.naturalearthdata.com/)
1:50m (public domain), downloaded once into `tools/.cache/`. Each map gets its
own projection, is framed on the countries it actually shows, clipped to its
viewBox and simplified in projected space. A capital that would land outside its
viewBox fails the build rather than shipping an unreachable target.

## Tests

```bash
node tools/validate-data.mjs    # data invariants, no browser, fast
node tests/smoke.mjs            # end-to-end; --shots also saves screenshots
```

The smoke test opens every continent, checks all seven maps for missing,
offscreen or untargetable capitals, and plays a full region to three stars in
each of the three modes.

Both run on every push and pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), as two parallel jobs
so a data regression is reported without waiting for a browser download. The
smoke job uploads its screenshots as an artifact when it fails. A third job then
deploys to GitHub Pages, so only a commit that passed both ever reaches players.

## Contributing

Anecdotes, translations and corrections are welcome. Anecdotes live in
`tools/facts-world.mjs` — one short sentence a child can picture, French and
English, and the two arrays must stay the same length and order. Then run
`npm run data` and commit the regenerated file alongside your edit.

## License

MIT. Map data from Natural Earth (public domain); flags from flagcdn.com.
