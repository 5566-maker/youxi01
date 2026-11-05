// Headless screenshots through the system Chrome, so the scene can be judged without a webcam.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = 'captures';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await page.goto((process.env.URL || 'http://127.0.0.1:5173/') + '?mute=1');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/1-title.png` });

await page.click('#b-mouse');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/2-tree.png` });

await page.mouse.move(720, 500);
await page.waitForTimeout(300);
await page.mouse.down();
await page.waitForTimeout(2400);
await page.screenshot({ path: `${out}/3-unleash.png` });

await page.mouse.move(1060, 430);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/4-rotated.png` });

await page.mouse.up();
await page.waitForTimeout(2400);
await page.screenshot({ path: `${out}/5-formed.png` });

console.log(JSON.stringify(await page.evaluate(() => window.__tree)));
console.log('errors:', JSON.stringify(errs.slice(0, 6)));
await browser.close();
