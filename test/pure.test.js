// Headless tests for the DOM-free core. Run with `npm test` (node test/...).
import assert from 'node:assert/strict';

import * as geo from '../js/geometry.js';
import { STITCHES, postShapes, SLASH_COUNT } from '../js/stitches.js';
import { buildCluster, PRESET_CLUSTERS } from '../js/clusters.js';
import { symmetryOrbit, orbitSize } from '../js/symmetry.js';
import { distributeRound } from '../js/rounds.js';
import { chartToSVG, buildStitchShapes, contentBounds } from '../js/svg.js';
import { store } from '../js/state.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
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
test('radialRotation points outward on +x axis', () => {
  assert.ok(near(geo.radialRotation(50, 0), 90));
});
test('snapTo rounds to step', () => {
  assert.equal(geo.snapTo(13, 15), 15);
  assert.equal(geo.snapTo(7, 15), 0);
});
test('snapPolar lands on nearest ring + spoke', () => {
  const p = geo.snapPolar(31, 2, { rings: [30, 64], spokeStep: 90, snapRing: true, snapSpoke: true });
  const { r, a } = geo.toPolar(p.x, p.y);
  assert.ok(near(r, 30, 1e-6));
  assert.ok(near(geo.norm360(a) % 90, 0, 1e-6));
});

// ---- stitches --------------------------------------------------------------
test('every base stitch builds non-empty shapes', () => {
  for (const k of Object.keys(STITCHES)) {
    const { shapes } = STITCHES[k].build();
    assert.ok(Array.isArray(shapes) && shapes.length > 0, k);
  }
});
test('dc has exactly one slash, tr two, hdc none', () => {
  const slashCount = (h, sl) => postShapes(h, sl).filter((s) => s.k === 'line').length;
  // post + topBar + slashes
  assert.equal(slashCount(30, SLASH_COUNT.hdc), 2); // post + bar
  assert.equal(slashCount(30, SLASH_COUNT.dc), 3); // post + bar + 1 slash
  assert.equal(slashCount(30, SLASH_COUNT.tr), 4); // post + bar + 2 slash
});

// ---- clusters --------------------------------------------------------------
test('increase cluster fans N legs from a shared base', () => {
  const { shapes } = buildCluster({ legs: 3, joinBottom: true, joinTop: false });
  assert.equal(shapes.filter((s) => s.k === 'group').length, 3);
});
test('decrease cluster converges N legs', () => {
  const { shapes } = buildCluster({ legs: 4, joinBottom: false, joinTop: true });
  const legs = shapes.filter((s) => s.k === 'line' && s.x2 === 0 && s.y2 < 0);
  assert.equal(legs.length, 4);
});
test('bobble cluster bulges with curved legs', () => {
  const { shapes } = buildCluster({ legs: 5, joinBottom: true, joinTop: true });
  assert.equal(shapes.filter((s) => s.k === 'path').length, 5);
});
test('all presets build', () => {
  for (const p of PRESET_CLUSTERS) assert.ok(buildCluster(p).shapes.length > 0, p.name);
});

// ---- symmetry --------------------------------------------------------------
test('4-fold orbit has 4 members at 90deg apart', () => {
  const orbit = symmetryOrbit({ x: 50, y: 0, rot: 90, mirror: false }, { order: 4, mirror: false });
  assert.equal(orbit.length, 4);
  // member positions: (50,0) -> (0,50) -> (-50,0) -> (0,-50)
  assert.ok(near(orbit[1].x, 0, 1e-6) && near(orbit[1].y, 50, 1e-6));
  assert.ok(near(orbit[2].x, -50, 1e-6));
});
test('dihedral orbit doubles the count', () => {
  const sym = { order: 4, mirror: true };
  assert.equal(symmetryOrbit({ x: 30, y: 10, rot: 0, mirror: false }, sym).length, orbitSize(sym));
  assert.equal(orbitSize(sym), 8);
});
test('orbit is start-invariant (regen from any member matches)', () => {
  const sym = { order: 6, mirror: false };
  const src = { x: 40, y: 12, rot: 30, mirror: false };
  const orbit = symmetryOrbit(src, sym);
  const fromMember = symmetryOrbit(orbit[3], sym);
  const key = (o) => `${o.x.toFixed(4)},${o.y.toFixed(4)}`;
  const a = new Set(orbit.map(key));
  const b = new Set(fromMember.map(key));
  assert.equal(a.size, b.size);
  for (const k of a) assert.ok(b.has(k), 'missing ' + k);
});

// ---- distribute ------------------------------------------------------------
test('distributeRound places count items evenly', () => {
  const items = distributeRound({ radius: 64, count: 8, sequence: ['dc'] });
  assert.equal(items.length, 8);
  for (const it of items) assert.ok(near(geo.toPolar(it.x, it.y).r, 64, 1e-6));
});
test('distributeRound cycles a sequence', () => {
  const items = distributeRound({ radius: 64, count: 6, sequence: ['dc', 'ch'] });
  assert.deepEqual(items.map((i) => i.type), ['dc', 'ch', 'dc', 'ch', 'dc', 'ch']);
});

// ---- renderer --------------------------------------------------------------
test('chartToSVG emits a well-formed svg with content', () => {
  const s = { title: 'T', stitches: [{ id: 'a', type: 'dc', x: 0, y: -40, rot: 0 }], clusterMap: {} };
  const svg = chartToSVG(s, { legend: true });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('Legend'));
  assert.ok(svg.includes('viewBox='));
});
test('buildStitchShapes falls back to dc for unknown type', () => {
  assert.ok(buildStitchShapes('bogus', {}).shapes.length > 0);
});
test('contentBounds expands around a stitch', () => {
  const b = contentBounds([{ id: 'a', type: 'dc', x: 0, y: 0, rot: 0 }], {});
  assert.ok(b.maxX > b.minX && b.maxY > b.minY);
});

// ---- store (symmetry-aware editing) ---------------------------------------
test('store.addStitch with 4-fold symmetry creates a linked group of 4', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0, rot: 90 });
  assert.equal(ids.length, 4);
  const g = store.byId(ids[0]).group;
  assert.equal(store.groupMembers(g).length, 4);
});
test('moving one member keeps the group symmetric', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0 });
  store.setStitchPos(ids[0], 80, 0);
  const radii = store.state.stitches.map((s) => Math.round(Math.hypot(s.x, s.y)));
  assert.deepEqual(radii, [80, 80, 80, 80]);
  assert.equal(store.state.stitches.length, 4);
});
test('breakSymmetry detaches the group', () => {
  store.reset();
  store.setSymmetry({ order: 4 });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0 });
  store.setSelection(ids);
  store.breakSymmetry();
  assert.ok(store.state.stitches.every((s) => s.group === null));
});
test('undo / redo round-trips a placement', () => {
  store.reset();
  const before = store.state.stitches.length;
  store.addStitch({ type: 'dc', x: 60, y: 0 });
  const after = store.state.stitches.length;
  assert.ok(after > before);
  store.undo();
  assert.equal(store.state.stitches.length, before);
  store.redo();
  assert.equal(store.state.stitches.length, after);
});
test('clusters resolve through the renderer; orphans fall back', () => {
  store.reset();
  const clId = store.addCluster({ name: 'My shell', base: 'dc', legs: 3, joinBottom: true });
  store.setSymmetry({ order: 1, mirror: false });
  store.addStitch({ type: clId, x: 0, y: -60 });
  const svg = chartToSVG({ ...store.state, clusterMap: store.state.clusterMap }, { legend: true });
  assert.ok(svg.includes('My shell'));
});
test('serialize / load round-trips state', () => {
  store.reset();
  store.setSymmetry({ order: 6 });
  store.addStitch({ type: 'tr', x: 50, y: 0 });
  const json = JSON.parse(JSON.stringify(store.serialize()));
  const count = store.state.stitches.length;
  store.reset();
  assert.equal(store.state.stitches.length, 0);
  store.load(json);
  assert.equal(store.state.stitches.length, count);
  assert.equal(store.state.settings.symmetry.order, 6);
});

test('drag moves the group so the GRABBED member lands on target (regression)', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0 });
  store.setSelection(ids);
  const grabbed = store.state.stitches.find((s) => Math.round(s.x) === 0 && Math.round(s.y) === 60);
  assert.ok(grabbed, 'found a non-first group member');
  store.dragBegin();
  store.dragSelectionTo(grabbed.id, 0, 90);
  assert.ok(store.byId(grabbed.id), 'grabbed id still valid after a drag frame');
  assert.deepEqual(store.state.stitches.map((s) => Math.round(Math.hypot(s.x, s.y))).sort(), [90, 90, 90, 90]);
  store.dragSelectionTo(grabbed.id, 0, 110); // second frame must keep working
  assert.equal(Math.round(store.byId(grabbed.id).y), 110);
});

test('editing a group uses its creation symmetry, not the live global (regression)', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0 });
  store.setSymmetry({ order: 6, mirror: true }); // change global AFTER creation
  store.setSelection(ids);
  store.rotateSelectionBy(30);
  assert.equal(store.state.stitches.length, 4, 'still 4 members, not 12');
});

test('selection has no dangling ids after a group-regenerating edit (regression)', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0 });
  store.setSelection(ids);
  store.rotateSelectionBy(45);
  const live = new Set(store.state.stitches.map((s) => s.id));
  assert.equal(store.selection.size, 4);
  for (const id of store.selection) assert.ok(live.has(id), 'live selection id');
});

test('per-group symmetry survives serialize / load', () => {
  store.reset();
  store.setSymmetry({ order: 6, mirror: false });
  store.addStitch({ type: 'dc', x: 50, y: 0 });
  const json = JSON.parse(JSON.stringify(store.serialize()));
  store.reset();
  store.setSymmetry({ order: 3, mirror: false });
  store.load(json);
  store.setSelection(store.state.stitches.map((s) => s.id));
  store.rotateSelectionBy(10);
  assert.equal(store.state.stitches.length, 6, 'loaded group keeps its order 6');
});

test('round labels stay unique after remove + add (regression)', () => {
  store.reset();
  store.removeRound(store.state.rounds[1].id);
  store.addRound(999);
  const labels = store.state.rounds.map((r) => r.label);
  assert.equal(new Set(labels).size, labels.length, 'no duplicate labels');
});

test('a no-op drag leaves no undo entry; a real drag leaves exactly one', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [id] = store.addStitch({ type: 'dc', x: 40, y: 0 });
  store.setSelection([id]);
  const before = store.undoStack.length;
  store.dragBegin();
  store.dragSelectionTo(id, 40, 0); // no movement
  assert.equal(store.undoStack.length, before, 'no snapshot for a no-op drag');
  store.dragSelectionTo(id, 70, 0); // real movement
  assert.equal(store.undoStack.length, before + 1, 'one snapshot for the gesture');
});

test('snapPoint snaps near-centre clicks to the chart centre (polar)', () => {
  store.reset();
  store.setSnap({ mode: 'polar', ring: true, spoke: true });
  assert.deepEqual(store.snapPoint(6, -5), { x: 0, y: 0 });
});

test('placing at the centre makes a single stitch despite symmetry', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'mr', x: 0, y: 0 });
  assert.equal(ids.length, 1);
  assert.equal(store.state.stitches.length, 1);
});

test('addStitch records origin/target on the seed', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [a] = store.addStitch({ type: 'dc', x: 40, y: 0, origin: 'src', target: 'tgt' });
  const st = store.byId(a);
  assert.equal(st.origin, 'src');
  assert.equal(st.target, 'tgt');
});

test('consecutive placement chains origin to the last-placed stitch', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [a] = store.addStitch({ type: 'dc', x: 40, y: 0, origin: store.currentOriginId() });
  const [b] = store.addStitch({ type: 'dc', x: 50, y: 10, origin: store.currentOriginId() });
  assert.equal(store.byId(a).origin, null, 'first has no prior stitch');
  assert.equal(store.byId(b).origin, a, 'second chains from the first');
  assert.equal(store.currentOriginId(), b, 'working position is the latest stitch');
});

test('symmetric copies do not carry the seed connectivity', () => {
  store.reset();
  store.setSymmetry({ order: 4, mirror: false });
  const ids = store.addStitch({ type: 'dc', x: 60, y: 0, origin: 'src', target: 'tgt' });
  assert.equal(store.byId(ids[0]).origin, 'src');
  assert.equal(store.byId(ids[1]).origin, null);
  assert.equal(store.byId(ids[1]).target, null);
});

test('suggestTarget picks the nearest inner-round stitch', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [inner] = store.addStitch({ type: 'dc', x: 30, y: 0 }); // r=30
  store.addStitch({ type: 'dc', x: 200, y: 0 }); // far away, r=200
  assert.equal(store.suggestTarget(60, 0), inner, 'targets the close inner stitch');
  assert.equal(store.suggestTarget(10, 0), null, 'nothing inner of r=10');
});

test('currentOriginId clears when the working stitch is deleted', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [a] = store.addStitch({ type: 'dc', x: 40, y: 0 });
  assert.equal(store.currentOriginId(), a);
  store.setSelection([a]);
  store.deleteSelection();
  assert.equal(store.currentOriginId(), null, 'dangling working position is dropped');
});

test('pickTarget distinguishes a stitch from a space between two stitches', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [a] = store.addStitch({ type: 'dc', x: -20, y: 40 });
  const [b] = store.addStitch({ type: 'dc', x: 20, y: 40 });
  const onB = store.pickTarget(20, 84);
  assert.equal(onB.kind, 'stitch');
  assert.equal(onB.id, b);
  const between = store.pickTarget(0, 84);
  assert.equal(between.kind, 'space');
  assert.deepEqual(new Set(between.ids), new Set([a, b]));
});

test('targetPoint returns the midpoint for a space target', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [a] = store.addStitch({ type: 'dc', x: -20, y: 40 });
  const [b] = store.addStitch({ type: 'dc', x: 20, y: 40 });
  assert.deepEqual(store.targetPoint({ kind: 'space', ids: [a, b] }), { x: 0, y: 40 });
});

test('setOrigin re-anchors the working position', () => {
  store.reset();
  store.setSymmetry({ order: 1, mirror: false });
  const [a] = store.addStitch({ type: 'dc', x: 30, y: 0 });
  const [b] = store.addStitch({ type: 'dc', x: 60, y: 0 });
  assert.equal(store.currentOriginId(), b);
  store.setOrigin(a);
  assert.equal(store.currentOriginId(), a);
});

console.log(`\n  ${passed} tests passed\n`);
