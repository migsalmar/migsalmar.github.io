// Relative cost per preset and per feature, measured with ?bench=N.
// Under headless SwiftShader (CPU rasterizer) absolute numbers mean nothing for a GPU;
// ratios between rows indicate where the fragment work goes.
const { chromium } = require('playwright');
const base = process.env.GAROA_URL || 'http://127.0.0.1:5173/';
const N = process.env.N || '6';
const cam = process.env.CAM || '1';
const configs = (process.env.CONFIGS ||
  'q=high;q=medium;q=low;q=medium&ssr=0;q=medium&volSteps=0;q=medium&rainStreaks=0&rainMist=0;q=medium&neonLights=0;q=high&shadows=0;q=high&msaa=0').split(';');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const c of configs) {
    await page.goto(`${base}?bench=${N}&cam=${cam}&t=60&${c}`);
    await page.waitForFunction(() => window.__garoa && window.__garoa.ready, null, { timeout: 600000, polling: 1000 });
    const b = await page.evaluate(() => window.__garoa.bench);
    console.log(`${c.padEnd(40)} ${b.msPerFrame.toFixed(0).padStart(6)} ms  calls=${b.calls} tris=${b.triangles}`);
  }
  if (errors.length) console.log('errors:', errors);
  await browser.close();
})();
