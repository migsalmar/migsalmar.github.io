// Headless review screenshots from the three fixed viewpoints.
// Usage: node scripts/shoot.cjs [outDir] [quality] [time]
// Needs the dev server running (npm run dev).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = process.argv[2] || 'shots';
const q = process.argv[3] || 'high';
const t = process.argv[4] || '14';
const base = process.env.GAROA_URL || 'http://127.0.0.1:5173/';
const W = parseInt(process.env.W || '1280', 10);
const H = parseInt(process.env.H || '720', 10);
const cams = (process.env.CAMS || '1,2,3').split(',').map(Number);

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  for (const cam of cams) {
    const extra = process.env.EXTRA ? '&' + process.env.EXTRA : '';
    const url = `${base}?shot&cam=${cam}&q=${q}&t=${t}${extra}`;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    try {
      await Promise.race([
        page.waitForFunction(() => window.__garoa && window.__garoa.ready, null, { timeout: 300000, polling: 1000 }),
        new Promise((_, rej) => page.once('pageerror', (e) => rej(new Error('page error: ' + e.message)))),
      ]);
    } catch (e) {
      console.log('timeout; console:\n' + errors.join('\n'));
      throw e;
    }
    const info = await page.evaluate(() => window.__garoa.info);
    const file = path.join(outDir, `cam${cam}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log(`cam${cam} -> ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s) calls=${info.calls} tris=${info.triangles}`);
  }
  if (errors.length) console.log('console:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
