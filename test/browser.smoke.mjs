// Real-browser smoke test (headless Chromium via Puppeteer). Drives the live
// app — place, select, drag, undo, zoom — and fails on any uncaught error or
// console error. Requires: npm i puppeteer && npx puppeteer browsers install
// chrome, and a running server (PORT below). Captures a screenshot.
import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:8080';
const errors = [];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('#canvas .stitch', { timeout: 8000 });

const snap = () => page.evaluate(() => ({
  stitches: window.threadwick.store.state.stitches.length,
  sel: window.threadwick.store.selection.size,
  tool: window.threadwick.canvas.getTool(),
}));
const box = await page.$eval('#canvas', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const cx = box.x + box.w / 2;
const cy = box.y + box.h / 2;

const before = await snap();

// place a stitch (default tool is Place; 4-fold symmetry should add a group)
await page.mouse.click(cx + 95, cy - 60);
await page.waitForFunction((n) => window.threadwick.store.state.stitches.length > n, {}, before.stitches);
const afterPlace = await snap();

// select + drag a stitch (pointerdown selects its group, then a drag moves it)
await page.keyboard.press('v');
const sb = await page.$eval('#canvas .stitch', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const posBefore = await page.evaluate(() => window.threadwick.store.state.stitches.map((s) => [Math.round(s.x), Math.round(s.y)]));
await page.mouse.move(sb.x, sb.y);
await page.mouse.down();
await page.mouse.move(sb.x + 55, sb.y - 10, { steps: 10 });
await page.mouse.up();
const afterDrag = await snap();
const posAfter = await page.evaluate(() => window.threadwick.store.state.stitches.map((s) => [Math.round(s.x), Math.round(s.y)]));
const moved = JSON.stringify(posBefore) !== JSON.stringify(posAfter);

// undo twice (revert drag, then revert place)
for (let i = 0; i < 2; i++) {
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 80));
}
const afterUndo = await snap();

// zoom with the wheel (viewBox path)
await page.mouse.move(cx, cy);
await page.mouse.wheel({ deltaY: -360 });
await new Promise((r) => setTimeout(r, 120));

await page.screenshot({ path: '/tmp/browser.png' });
await browser.close();

const result = { before, afterPlace, afterDrag, afterUndo, moved, errors };
console.log(JSON.stringify(result, null, 2));

let ok = true;
if (errors.length) { console.error('FAIL: browser errors'); ok = false; }
if (!(afterPlace.stitches > before.stitches)) { console.error('FAIL: place added no stitches'); ok = false; }
if (afterPlace.tool !== 'place') { console.error('FAIL: default tool not place'); ok = false; }
if (afterDrag.tool !== 'select' || afterDrag.sel < 1) { console.error('FAIL: select/drag state'); ok = false; }
if (!moved) { console.error('FAIL: drag did not move anything'); ok = false; }
if (afterUndo.stitches !== before.stitches) { console.error('FAIL: undo did not restore count'); ok = false; }
console.log(ok ? '\n  BROWSER SMOKE OK\n' : '\n  BROWSER SMOKE FAILED\n');
process.exit(ok ? 0 : 1);
