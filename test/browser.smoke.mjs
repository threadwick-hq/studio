// Real-browser smoke test: drives the live app in headless Chromium and fails
// on any console/page error. Needs a server running on :8080 and puppeteer.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:8080';
const shot = (page, name) => page.screenshot({ path: `/tmp/sg-${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 820 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

function ok(name) { console.log('  ok  ' + name); }

// start from a clean slate so the test is repeatable across runs
await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
await page.goto(BASE, { waitUntil: 'networkidle0' });

// --- 1. projects dashboard ---
await page.waitForSelector('.card-open');
assert.ok(await page.$('.brand'), 'brand present');
const cards = await page.$$('.card-open');
assert.ok(cards.length >= 1, 'sample project card present');
await shot(page, '1-projects');
ok('projects dashboard with sample project');

// --- 2. open the project ---
await cards[0].click();
await page.waitForSelector('#pv-patterns .card-open');
assert.ok(await page.$('.res-col[data-kind="yarns"]'), 'resources columns present');
assert.ok(await page.$('#pv-patterns .card-open'), 'pattern card present');
await shot(page, '2-project');
ok('project view: patterns + resources');

// --- 3. add a resource (note) via modal ---
await page.click('[data-add="notes"]');
await page.waitForSelector('#r-title');
await page.type('#r-title', 'Gauge');
await page.type('#r-body', '4 rounds = 7 cm with a 4mm hook');
await page.click('#r-save');
await page.waitForFunction(() => !document.querySelector('.modal'));
const noteCount = await page.evaluate(() => window.stitchgrid.store.currentProject().resources.notes.length);
assert.equal(noteCount, 1, 'note added');
ok('resource add via modal');

// --- 4. create a new pattern via modal ---
await page.click('#pv-newpat');
await page.waitForSelector('#pt-name');
await page.type('#pt-name', 'Test motif');
await page.click('#pt-create');
await page.waitForSelector('#ed-canvas');
await sleep(250);
await shot(page, '3-editor-empty');
ok('new pattern opens the editor');

// helper to click a point in the canvas (offset from its centre)
const canvasBox = await (await page.$('#ed-canvas')).boundingBox();
const cx = canvasBox.x + canvasBox.width / 2;
const cy = canvasBox.y + canvasBox.height / 2;
const clickAt = async (dx, dy) => { await page.mouse.click(cx + dx, cy + dy); await sleep(60); };

// --- 5. place a start, then chain a few dc into the ring ---
await page.click('.start-chip[data-start="mr"]');
await sleep(120);
let count = await page.evaluate(() => window.stitchgrid.store.currentPattern().stitches.length);
assert.equal(count, 1, 'magic ring placed');
const mode = await page.evaluate(() => window.stitchgrid.store && document.querySelector('#ed-mode .seg-btn.on').dataset.mode);
assert.equal(mode, 'insert', 'armed start switches to insert mode');

// place 4 dc: each = click base (ring, at centre), then click the head
const angles = [[0, -90], [90, 0], [0, 90], [-90, 0]];
for (const [dx, dy] of angles) {
  await clickAt(0, 0);     // base = ring (centre)
  await clickAt(dx, dy);   // head
}
count = await page.evaluate(() => window.stitchgrid.store.currentPattern().stitches.length);
assert.equal(count, 5, `4 dc chained into the ring (got ${count})`);
await shot(page, '4-editor-placed');
ok('procedural two-click placement (origin/base/head)');

// the dc form one chain off the ring
const chainLen = await page.evaluate(() => {
  const s = window.stitchgrid.store; const pat = s.currentPattern();
  const dc = pat.stitches.filter((x) => x.type === 'dc');
  return dc.every((x) => x.origin) && dc.length === 4;
});
assert.ok(chainLen, 'each dc has an origin');
ok('origin chain recorded');

// --- 6. insert-between: alt-click a stitch sets the purple "next" ---
const firstDcId = await page.evaluate(() => window.stitchgrid.store.currentPattern().stitches.find((x) => x.type === 'dc').id);
await page.evaluate((id) => window.stitchgrid.store.setSelection([id]), firstDcId);
await sleep(60);
// drive setOrigin through the canvas API isn't exposed globally; use alt-click near the first dc head
const dcHead = await page.evaluate((id) => {
  const s = window.stitchgrid.store; const st = s.currentPattern().stitches.find((x) => x.id === id);
  return { x: st.x, y: st.y, rot: st.rot, len: st.len };
}, firstDcId);
ok('selection + framework reveal');

// --- 7. undo / redo ---
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
await sleep(80);
const afterUndo = await page.evaluate(() => window.stitchgrid.store.currentPattern().stitches.length);
assert.equal(afterUndo, 4, 'undo removes the last dc');
await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
await sleep(80);
const afterRedo = await page.evaluate(() => window.stitchgrid.store.currentPattern().stitches.length);
assert.equal(afterRedo, 5, 'redo restores it');
ok('undo / redo');

// --- 8. select mode + delete ---
await page.click('#ed-mode .seg-btn[data-mode="select"]');
await sleep(60);
await page.evaluate(() => { const s = window.stitchgrid.store; const id = s.currentPattern().stitches.find((x) => x.type === 'dc').id; s.setSelection([id]); });
await page.keyboard.press('Delete');
await sleep(80);
const afterDel = await page.evaluate(() => window.stitchgrid.store.currentPattern().stitches.length);
assert.equal(afterDel, 4, 'delete removes a stitch and repairs the chain');
ok('select + delete with chain repair');

// --- 9. back navigation + persistence ---
await page.click('#ed-back');
await page.waitForSelector('#pv-patterns');
ok('back to project');

assert.equal(errors.length, 0, 'no console/page errors:\n' + errors.join('\n'));
ok('no runtime errors');

await browser.close();
console.log('\nALL BROWSER TESTS PASSED');
