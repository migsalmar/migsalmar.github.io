// Drives the live app headless: walk with W, cycle quality with Q, jump viewpoints 1-3.
const { chromium } = require('playwright');
const base = process.env.GAROA_URL || 'http://127.0.0.1:5173/';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}?q=low&cam=1`);
  await page.waitForFunction(() => window.__garoa && window.__garoa.ready, null, { timeout: 300000, polling: 500 });
  const camPos = () => page.evaluate(() => window.__garoa.frames);
  const f0 = await camPos();
  // walking needs frames to advance; SwiftShader is slow, so hold W for several seconds
  await page.keyboard.down('w');
  await page.waitForTimeout(8000);
  await page.keyboard.up('w');
  const moved = await page.evaluate(() => window.__garoaDebug?.());
  const results = [];
  for (const expect of ['medium', 'high', 'low']) {
    await page.keyboard.press('q');
    await page.waitForFunction((q) => window.__garoa.quality === q, expect, { timeout: 60000 });
    const fStart = await camPos();
    await page.waitForFunction((f) => window.__garoa.frames > f + 1, fStart, { timeout: 300000, polling: 500 });
    results.push(expect);
  }
  for (const k of ['2', '3', '1']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(500);
  }
  const f1 = await camPos();
  console.log(JSON.stringify({ framesRendered: f1 - f0, qualityCycle: results, moved, errors }, null, 1));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
