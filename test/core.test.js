// Dependency-free tests for the DOM-free core. Run: `npm test` (just node).
import assert from 'node:assert/strict';

import * as geo from '../js/geometry.js';
import { STITCHES, isRealStitch, isStart, defaultLen } from '../js/symbols.js';
import { topOfStitch, contentBounds, chartToSVG, buildStitchShapes } from '../js/render.js';
import {
  chainOrder, spacesForRound, pickBase, successorInRound, chainFrom,
  defaultOriginId, basePoint,
} from '../js/connectivity.js';
import { newProject, newPattern, normalizeProject, projectToFile, projectFromFile, startRoundId } from '../js/model.js';
import { store } from '../js/store.js';
import { summarizeRound } from '../js/files.js';
import { sampleProject } from '../js/sample.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('FAIL  ' + name + '\n      ' + (e && e.message)); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---- geometry --------------------------------------------------------------
test('polar round-trips', () => {
  for (const [x, y] of [[10, 0], [0, 25], [-12, 7], [3, -19]]) {
    const { r, a } = geo.toPolar(x, y);
    const p = geo.fromPolar(r, a);
    assert.ok(near(p.x, x, 1e-9) && near(p.y, y, 1e-9));
  }
});

// ---- symbols ---------------------------------------------------------------
test('real vs non-real stitches', () => {
  assert.equal(isRealStitch('dc'), true);
  assert.equal(isRealStitch('ch'), false);
  assert.equal(isRealStitch('slst'), false);
  assert.equal(isRealStitch('mr'), false);
  assert.equal(isStart('mr'), true);
  assert.equal(isStart('dc'), false);
});
test('post heights grow sc<hdc<dc<tr<dtr', () => {
  const h = (t) => buildStitchShapes(t).height;
  assert.ok(h('sc') < h('hdc') && h('hdc') < h('dc') && h('dc') < h('tr') && h('tr') < h('dtr'));
  assert.equal(defaultLen('dc'), STITCHES.dc.build().height);
});

// ---- render ----------------------------------------------------------------
test('topOfStitch is above the base for an upright dc', () => {
  const head = topOfStitch({ type: 'dc', x: 0, y: 0, rot: 0, len: 32 });
  assert.ok(near(head.x, 0) && near(head.y, -32));
});
test('topOfStitch rotates with the stitch', () => {
  const head = topOfStitch({ type: 'dc', x: 0, y: 0, rot: 90, len: 20 });
  assert.ok(near(head.x, 20, 1e-6) && near(head.y, 0, 1e-6));
});
test('chain head is the far end, buffered off the anchor', () => {
  const head = topOfStitch({ type: 'ch', x: 0, y: 0, rot: 0, len: null });
  assert.ok(near(head.x, 0, 1e-9));
  assert.ok(head.y < -10, 'head lies along local up, past the buffer + oval');
});
test('contentBounds covers placed stitches', () => {
  const b = contentBounds([{ type: 'dc', x: 0, y: 0, rot: 0, len: 30 }]);
  assert.ok(b.minY <= -30 && b.maxY >= 0);
});

// ---- connectivity ----------------------------------------------------------
function ring(round) { return { id: 'ring', round, type: 'mr', origin: null, base: null, x: 0, y: 0, rot: 0, len: null }; }
function dc(id, round, origin, x, y) { return { id, round, type: 'dc', origin, base: { kind: 'stitch', id: 'ring' }, x, y, rot: 0, len: 30 }; }

test('chainOrder follows origin links', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 10, 0), dc('b', 'R', 'a', 20, 0), dc('c', 'R', 'b', 30, 0)];
  assert.deepEqual(chainOrder(s, 'R').map((x) => x.id), ['ring', 'a', 'b', 'c']);
});
test('spacesForRound = real-1 between consecutive real stitches', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 0, -30), dc('b', 'R', 'a', 30, -30), dc('c', 'R', 'b', 60, -30)];
  const sp = spacesForRound(s, 'R'); // ring is not real -> 3 dc -> 2 spaces
  assert.equal(sp.length, 2);
  // first space is midway between a's and b's heads
  assert.ok(near(sp[0].point.x, 15) && near(sp[0].point.y, -60));
});
test('pickBase prefers the nearest space/stitch', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 0, -30), dc('b', 'R', 'a', 40, -30)];
  // a.head=(0,-60), b.head=(40,-60), space=(20,-60)
  const atSpace = pickBase(s, 20, -60);
  assert.equal(atSpace.kind, 'space');
  const atHead = pickBase(s, 0, -60);
  assert.equal(atHead.kind, 'stitch');
  assert.equal(atHead.id, 'a');
  assert.equal(pickBase(s, 999, 999), null);
});
test('successorInRound + chainFrom', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 0, 0), dc('b', 'R', 'a', 0, 0), dc('c', 'R', 'b', 0, 0)];
  assert.equal(successorInRound(s, 'a', 'R').id, 'b');
  assert.deepEqual(chainFrom(s, 'b', 'R').map((x) => x.id), ['b', 'c']);
});
test('defaultOriginId = tail of round, else previous round tail', () => {
  const rounds = [{ id: 'R1' }, { id: 'R2' }];
  const s = [ring('R1'), dc('a', 'R1', 'ring', 0, 0), dc('b', 'R1', 'a', 0, 0)];
  assert.equal(defaultOriginId(s, rounds, 'R1'), 'b'); // tail of R1
  assert.equal(defaultOriginId(s, rounds, 'R2'), 'b'); // R2 empty -> tail of R1
});
test('basePoint resolves stitch + space', () => {
  const s = [dc('a', 'R', null, 0, -30), dc('b', 'R', 'a', 40, -30)];
  const byId = new Map(s.map((x) => [x.id, x]));
  assert.ok(near(basePoint(byId, { kind: 'stitch', id: 'a' }).y, -60));
  assert.ok(near(basePoint(byId, { kind: 'space', ids: ['a', 'b'] }).x, 20));
});

// ---- model -----------------------------------------------------------------
test('newProject / newPattern shape', () => {
  const p = newProject('X');
  assert.equal(p.name, 'X');
  assert.deepEqual(Object.keys(p.resources).sort(), ['links', 'notes', 'variations', 'yarns']);
  const pat = newPattern('Sq');
  assert.equal(pat.type, 'granny');
  assert.equal(pat.rounds.length, 1);
  assert.equal(pat.activeRound, pat.rounds[0].id);
});
test('normalizeProject tolerates junk + drops orphan stitches', () => {
  const p = normalizeProject({ name: 'M', patterns: [{ type: 'granny', rounds: [{ id: 'r1', name: 'R1' }], stitches: [{ type: 'dc', round: 'r1', x: 1, y: 2 }, { type: 'dc', round: 'GONE' }, { junk: true }] }] });
  assert.equal(p.patterns[0].stitches.length, 1); // orphan + junk dropped
});
test('projectToFile / projectFromFile round-trip', () => {
  const p = sampleProject();
  const file = projectToFile(p);
  assert.equal(file.format, 'stitchgrid-studio');
  const back = projectFromFile(JSON.parse(JSON.stringify(file)));
  assert.equal(back.patterns[0].stitches.length, p.patterns[0].stitches.length);
  // also accepts a bare project object
  assert.ok(projectFromFile(p));
});

// ---- store: the procedural model end to end --------------------------------
test('store: create, start, chain, splice, repair, undo/redo', () => {
  const pid = store.createProject('T');
  const patId = store.createPattern(pid, 'Sq');
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern();

  const ringId = store.setStart('mr');
  assert.equal(pat().stitches.length, 1);
  const round = pat().activeRound; // working row; the ring lives alone in Round 0

  // chain 3 dc off the ring (they go in the active working row, not Round 0)
  const a = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: ringId });
  const b = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: a });
  const c = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: b });
  assert.deepEqual(chainOrder(pat().stitches, round).map((s) => s.id), [a, b, c]);

  // insert X between ring and a (a comes out of the ring): a should now come out of X
  const x = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: ringId });
  assert.equal(pat().stitches.find((s) => s.id === a).origin, x, 'splice re-points the next stitch');
  assert.equal(pat().stitches.find((s) => s.id === x).origin, ringId);
  assert.deepEqual(chainOrder(pat().stitches, round).map((s) => s.id), [x, a, b, c]);

  // delete a -> b should reroute to x's-successor's origin (a.origin == x)
  store.setSelection([a]);
  store.deleteSelection();
  assert.equal(pat().stitches.find((s) => s.id === b).origin, x, 'chain repaired on delete');

  // undo restores a; redo removes it again
  const n = pat().stitches.length;
  store.undo();
  assert.equal(pat().stitches.length, n + 1);
  store.redo();
  assert.equal(pat().stitches.length, n);
});
test('store: start marker lives alone in Round 0', () => {
  const pid = store.createProject('Z');
  const patId = store.createPattern(pid, 'Sq');
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern();
  const before = pat().rounds.length;             // 1 working row
  store.setStart('mr');
  assert.equal(pat().rounds.length, before + 1, 'a Round 0 was prepended');
  assert.equal(startRoundId(pat()), pat().rounds[0].id, 'ring is in Round 0');
  assert.notEqual(pat().activeRound, pat().rounds[0].id, 'active row is a working row');
  store.setActiveRound(pat().rounds[0].id);
  assert.notEqual(pat().activeRound, pat().rounds[0].id, 'setActiveRound rejects Round 0');
  assert.equal(pat().stitches.filter((s) => s.round === pat().rounds[0].id).length, 1, 'only the start sits in Round 0');
});
test('normalizeProject migrates a start that shared a working row', () => {
  const p = normalizeProject({ name: 'M', patterns: [{ type: 'granny', rounds: [{ id: 'r1', name: 'Round 1' }], activeRound: 'r1',
    stitches: [{ id: 'ring', type: 'mr', round: 'r1', x: 0, y: 0 }, { id: 'd', type: 'dc', round: 'r1', origin: 'ring', x: 0, y: 0 }] }] });
  const pat = p.patterns[0];
  assert.equal(pat.rounds.length, 2, 'a Round 0 was split out');
  const ring = pat.stitches.find((s) => s.type === 'mr');
  assert.equal(ring.round, pat.rounds[0].id, 'ring moved to Round 0');
  assert.equal(pat.stitches.filter((s) => s.round === pat.rounds[0].id).length, 1, 'Round 0 holds only the start');
});
test('store: chains auto-align evenly between non-chain neighbours', () => {
  const pid = store.createProject('CH');
  const patId = store.createPattern(pid, 'Sq');
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern();
  const ring = store.setStart('mr');
  const round = pat().activeRound;
  const A = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ring }, x: -40, y: 0, rot: 0, len: 30, originId: ring }); // head (-40,-30)
  let o = A; const chs = [];
  for (let i = 0; i < 3; i++) { o = store.placeStitch({ type: 'ch', base: { kind: 'stitch', id: o }, x: 0, y: 0, rot: 0, len: null, originId: o }); chs.push(o); }
  store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ring }, x: 40, y: 0, rot: 0, len: 30, originId: o }); // B head (40,-30)
  const order = chainOrder(pat().stitches, round).filter((s) => s.type === 'ch');
  assert.equal(order.length, 3);
  assert.ok(order.every((s) => near(s.y, -30, 0.01)), 'chains land on the segment line');
  assert.ok(near(order[1].x - order[0].x, 20, 0.01) && near(order[2].x - order[1].x, 20, 0.01), 'evenly spaced');
  // moving a chain by hand opts it out; re-enabling snaps it back
  store.setSelection([order[1].id]);
  store.moveSelectionBy(0, -25);
  const mid = () => pat().stitches.find((s) => s.id === order[1].id);
  assert.equal(mid().auto, false, 'manual move disables auto');
  assert.ok(mid().y < -40, 'manually-moved chain stays put');
  store.setSelection([order[1].id]);
  store.setChainAuto(true);
  assert.ok(near(mid().y, -30, 0.01), 're-enabling auto snaps it back');
});
test('store: pattern type guard + resources', () => {
  const pid = store.createProject('R');
  assert.equal(store.createPattern(pid, 'Flat thing', 'flat'), null, 'unavailable type rejected');
  const yid = store.addResource(pid, 'yarns', { name: 'Cotton', hex: '#fff' });
  assert.ok(yid);
  store.updateResource(pid, 'yarns', yid, { brand: 'Acme' });
  assert.equal(store.getProject(pid).resources.yarns[0].brand, 'Acme');
  store.removeResource(pid, 'yarns', yid);
  assert.equal(store.getProject(pid).resources.yarns.length, 0);
});
test('store: evenRound fans stitches to equal radius', () => {
  const pid = store.createProject('E');
  const patId = store.createPattern(pid, 'Sq');
  store.openPattern(pid, patId);
  const round = store.currentPattern().rounds[0].id;
  const r = store.setStart('mr');
  let o = r;
  for (const [x, y] of [[10, -20], [22, 3], [-5, 25], [-18, -9]]) o = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: r }, x: 0, y: 0, rot: Math.random() * 90, len: 10 + Math.random() * 30, originId: o });
  store.evenRound(round);
  const dcs = chainOrder(store.currentPattern().stitches, round).filter((s) => s.type === 'dc');
  const cx = dcs.reduce((a, s) => a + s.x, 0) / dcs.length, cy = dcs.reduce((a, s) => a + s.y, 0) / dcs.length;
  const radii = dcs.map((s) => { const h = topOfStitch(s); return Math.hypot(h.x - cx, h.y - cy); });
  const avg = radii.reduce((a, b) => a + b, 0) / radii.length;
  assert.ok(radii.every((r2) => Math.abs(r2 - avg) < 1.5), 'all heads ~equal radius');
});

// ---- files: written instructions ------------------------------------------
test('summarizeRound collapses runs', () => {
  const pat = newPattern('S');
  const rid = pat.rounds[0].id;
  pat.stitches = [
    { id: 'r', round: rid, type: 'mr', origin: null, base: null, x: 0, y: 0 },
    { id: '1', round: rid, type: 'dc', origin: 'r', x: 0, y: 0 },
    { id: '2', round: rid, type: 'dc', origin: '1', x: 0, y: 0 },
    { id: '3', round: rid, type: 'dc', origin: '2', x: 0, y: 0 },
    { id: '4', round: rid, type: 'ch', origin: '3', x: 0, y: 0 },
    { id: '5', round: rid, type: 'ch', origin: '4', x: 0, y: 0 },
    { id: '6', round: rid, type: 'dc', origin: '5', x: 0, y: 0 },
  ];
  assert.equal(summarizeRound(pat, rid), '3 dc, ch 2, dc');
});

// ---- export ----------------------------------------------------------------
test('chartToSVG emits a valid root with a legend', () => {
  const svg = chartToSVG(sampleProject().patterns[0], { title: 'X' });
  assert.ok(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
  assert.ok(svg.includes('Legend'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
