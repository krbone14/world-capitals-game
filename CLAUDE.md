# CLAUDE.md

A bilingual geography game — drag each capital, country or flag onto the right
spot of the map. It is a static page served from GitHub Pages, and the same page
wrapped by Capacitor as an Android app on Google Play.

**Read [`passation.md`](passation.md) before picking up work.** It carries what
this file deliberately does not: where the release stands, what was tried and
failed, and what was already agreed for the next update.

## Ground rules

**`index.html` is the whole game** — template and logic, one file. There is no
build step and no framework to install.

**Never edit what is generated.** `assets/data/`, `assets/geo/`, `assets/flags/`,
`assets/social-card.png`, `icons/` and `store/` are all produced by scripts. Edit
the sources in `tools/` and re-run the matching command — the README maps each
one to what it changes.

**Verify with both:**

```bash
node tools/validate-data.mjs    # data invariants, no browser, seconds
node tests/smoke.mjs            # end-to-end in a real Chromium
```

Add checks for what you change; the suite is the project's memory of its own
rules. Note that both the test and the screenshot script drive the game through
**French** selectors and pin the locale — the game follows the device's language,
so an unpinned run would behave differently on a French machine and on CI.

**A green suite is not proof.** It once passed while faithfully checking a wrong
intention, and a phone caught what it could not. Anything that changes how the
game feels gets tried on a real device before it merges.

## Working with Stéphane

He writes in French. The code, its comments and the commit messages are in
English — keep both.

Every change goes through a **branch and a pull request**, never a direct commit
to `main`: merging `main` deploys to GitHub Pages and changes the live site
immediately. Wait for both CI checks to be green, merge with `--rebase` to keep
the history linear, then rebuild the AAB if Android is affected.

**The notes are the exception.** `passation.md`, this file and `README.md` may be
committed straight to `main`. None of them ships: the dist whitelist is
`index.html`, `manifest.json`, `sw.js`, `assets` and `icons`, so a note never
reaches the app, and the Pages deploy republishes a site identical to the one
already live. The branch-and-PR rule exists to protect the public site, and on
these files it protects nothing while making the handover note expensive to keep
current — which is the one thing it must be.

Propose options and let him choose when a change involves a design trade-off.

## Android

```bash
npm run dist
npx cap sync android
android/gradlew -p android bundleRelease
```

`JAVA_HOME` must point at the **JDK 21** in `C:\AI\android-toolchain` — the
system default is a JRE 25, which Gradle rejects with an unhelpful message.

`versionCode` is the commit count, so it rises on its own; `-PversionCode=<n>`
overrides it. The signing key lives outside the repository and cannot be
replaced if lost — see `passation.md`.
