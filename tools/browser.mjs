// Launches Chromium for the preview and smoke scripts.
//
// The pre-installed browser under PLAYWRIGHT_BROWSERS_PATH may not match the
// revision this playwright build looks for, so fall back to launching it by
// path rather than downloading a second copy.

import fs from 'node:fs';
import { chromium } from 'playwright';

const FALLBACK = '/opt/pw-browsers/chromium';

export async function launchChromium(options = {}) {
  try {
    return await chromium.launch(options);
  } catch (err) {
    if (!fs.existsSync(FALLBACK)) throw err;
    return chromium.launch({ ...options, executablePath: FALLBACK });
  }
}
