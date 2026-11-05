// Checks that the hand moves the scene the way the user asked for: right hand → scene right, open palm → zoom in.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const URL = (process.env.URL || 'http://127.0.0.1:8765/') + '?mute=1&still=1';

await page.goto(URL);
await page.waitForTimeout(2500);
await page.click('#b-mouse');
await page.waitForTimeout(1500);

const W = 1440, H = 900;
const state = () => page.evaluate(() => window.__tree);

// --- horizontal: hand at 20% then 80%
await page.mouse.move(W * 0.2, H * 0.5);
await page.waitForTimeout(1600);
const L = await state();
await page.mouse.move(W * 0.8, H * 0.5);
await page.waitForTimeout(1600);
const R = await state();

console.log('hand.x   left=%s right=%s', L.hand.x.toFixed(2), R.hand.x.toFixed(2));
console.log('cam.az   left=%s right=%s  → %s', L.cam.az, R.cam.az, R.cam.az < L.cam.az ? 'az decreases (scene drags right)' : 'az increases (scene drags left)');

// Neptune is the slowest orbiter, so its screen shift is dominated by the camera, not by its own revolution
const nx = (t, name) => t.planets.find((p) => p.name === name).nx;
for (const name of ['海王星', '天王星', '木星']) {
  const a = nx(L, name), b = nx(R, name);
  console.log('%s nx  left=%s right=%s  → %s', name, a, b, b > a ? 'moves RIGHT ✓' : 'moves LEFT ✗');
}

// --- vertical: hand high then low
await page.mouse.move(W * 0.5, H * 0.2);
await page.waitForTimeout(1600);
const U = await state();
await page.mouse.move(W * 0.5, H * 0.8);
await page.waitForTimeout(1600);
const D = await state();
console.log('cam.polar up=%s down=%s', U.cam.polar, D.cam.polar);

// --- zoom: fist (button up) then open (button down)
await page.mouse.move(W * 0.5, H * 0.5);
await page.waitForTimeout(1400);
const fist = await state();
await page.mouse.down();
await page.waitForTimeout(1800);
const open = await state();
await page.mouse.up();

console.log('fist     spread=%s dist=%s', fist.cam.spread, fist.cam.dist);
console.log('open     spread=%s dist=%s', open.cam.spread, open.cam.dist);
console.log('verdict  open palm is %s', open.cam.dist < fist.cam.dist ? 'CLOSER (zoom in) ✓' : 'FARTHER (zoom out) ✗');
console.log('errors:', JSON.stringify(errs));


// --- X flips the horizontal mapping
await page.keyboard.press('x');
await page.mouse.move(W * 0.2, H * 0.5);
await page.waitForTimeout(1600);
const L2 = await state();
await page.mouse.move(W * 0.8, H * 0.5);
await page.waitForTimeout(1600);
const R2 = await state();
console.log('after X  az left=%s right=%s → %s', L2.cam.az, R2.cam.az, R2.cam.az > L2.cam.az ? 'flipped OK' : 'NOT flipped');
await browser.close();
