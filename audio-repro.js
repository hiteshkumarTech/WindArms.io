const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`));

  await page.addInitScript(() => {
    window.__audioLog = [];
    const OrigAudioContext = window.AudioContext;
    window.AudioContext = new Proxy(OrigAudioContext, {
      construct(target, args) {
        window.__audioLog.push('AudioContext created');
        const instance = new target(...args);
        const origCreateBufferSource = instance.createBufferSource.bind(instance);
        instance.createBufferSource = (...a) => {
          window.__audioLog.push('createBufferSource');
          return origCreateBufferSource(...a);
        };
        const origCreateOscillator = instance.createOscillator.bind(instance);
        instance.createOscillator = (...a) => {
          window.__audioLog.push('createOscillator');
          return origCreateOscillator(...a);
        };
        return instance;
      },
    });
  });

  await page.goto('http://localhost:3000/play', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);

  await page.getByText('Practice Offline', { exact: true }).click({ timeout: 15000, force: true });
  await page.waitForTimeout(1000);

  await page
    .getByText('Enter Arena', { exact: true })
    .click({ timeout: 8000, force: true })
    .catch((e) => console.log('Enter Arena click issue (continuing):', e.message));
  await page.waitForTimeout(2000);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  console.log('canvas box:', box);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);

  const results = {};
  for (let slot = 1; slot <= 7; slot++) {
    await page.keyboard.press(`Digit${slot}`);
    await page.waitForTimeout(400); // let switch animation settle
    await page.evaluate(() => {
      window.__audioLog.length = 0;
    });
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const log = await page.evaluate(() => window.__audioLog.slice());
    results[slot] = log;
  }

  await page.waitForTimeout(300);
  const pointerLocked = await page.evaluate(() => document.pointerLockElement !== null);

  console.log('=== pointerLocked ===', pointerLocked);
  console.log('=== per-weapon audioLog ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('=== console/page logs ===');
  console.log(logs.join('\n'));

  await browser.close();
})().catch((err) => {
  console.error('SCRIPT ERROR', err);
  process.exit(1);
});
