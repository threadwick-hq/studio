// DOM integration smoke test: loads index.html in jsdom and boots the real
// app (main.js) to catch wiring bugs — bad element ids, broken imports, panels
// that throw on init. Requires jsdom: `npm install jsdom` then
// `node test/dom.smoke.js`. (The default `npm test` stays dependency-free.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
global.SVGElement = dom.window.SVGElement;
global.Image = dom.window.Image;
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

await import('../js/main.js');

const $ = (id) => document.getElementById(id);
assert.equal($('palette-stitches').children.length, 7, 'seven base stitches in palette');
assert.equal($('palette-starts').children.length, 3, 'three round-0 start elements');
assert.ok($('canvas').children.length > 0, 'canvas rendered something');
assert.ok($('legend-box').children.length > 0, 'legend populated from sample');
assert.ok(/Nothing selected/.test($('inspector').textContent), 'inspector shows empty state');
assert.ok(window.threadwick.store.state.stitches.length > 0, 'sample stitches present');
assert.ok($('rounds-list').children.length > 0, 'rounds listed');

// exercise a few interactions through the store + renderer
const { store } = window.threadwick;
const n0 = store.state.stitches.length;
store.setSymmetry({ order: 4, mirror: false });
store.addStitch({ type: 'tr', x: 70, y: 0 });
assert.equal(store.state.stitches.length, n0 + 4, 'placing with 4-fold symmetry added 4');
store.undo();
assert.equal(store.state.stitches.length, n0, 'undo removed them');
assert.ok($('canvas').querySelectorAll('[data-id]').length > 0, 'stitches are hit-testable');

console.log('\n  DOM smoke test passed\n');
