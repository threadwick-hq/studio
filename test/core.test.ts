// Dependency-free tests for the DOM-free core, run with vitest.
import { test } from 'vitest';
import assert from 'node:assert/strict';

import * as geo from '../src/core/geometry';
import { STITCHES, isRealStitch, isStart, defaultLen } from '../src/core/symbols';
import { topOfStitch, contentBounds, chartToSVG, buildStitchShapes } from '../src/core/render';
import {
  chainOrder, spacesForRound, pickBase, successorInRound, chainFrom,
  defaultOriginId, basePoint,
} from '../src/core/connectivity';
import { newProject, newPattern, normalizeProject, projectToFile, projectFromFile, startRowId, activeVersion, publishedVersion, draftVersion } from '../src/core/model';
import { store } from '../src/core/store';
import { summarizeRound } from '../src/core/files';
import { sampleProject } from '../src/core/sample';
import type { Stitch, Base, StitchType } from '../src/core/types';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ---- geometry --------------------------------------------------------------
test('polar round-trips', () => {
  for (const [x, y] of [[10, 0], [0, 25], [-12, 7], [3, -19]]) {
    const { r, a } = geo.toPolar(x!, y!);
    const p = geo.fromPolar(r, a);
    assert.ok(near(p.x, x!, 1e-9) && near(p.y, y!, 1e-9));
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
  const h = (t: StitchType) => buildStitchShapes(t).height;
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
  assert.ok(head.y < -10);
});
test('contentBounds covers placed stitches', () => {
  const b = contentBounds([{ type: 'dc', x: 0, y: 0, rot: 0, len: 30 }]);
  assert.ok(b.minY <= -30 && b.maxY >= 0);
});

// ---- connectivity ----------------------------------------------------------
function ring(round: string): Stitch { return { id: 'ring', round, type: 'mr', origin: null, base: null, x: 0, y: 0, rot: 0, len: null, color: null, mirror: false }; }
function dc(id: string, round: string, origin: string | null, x: number, y: number): Stitch {
  return { id, round, type: 'dc', origin, base: { kind: 'stitch', id: 'ring' }, x, y, rot: 0, len: 30, color: null, mirror: false };
}

test('chainOrder follows origin links', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 10, 0), dc('b', 'R', 'a', 20, 0), dc('c', 'R', 'b', 30, 0)];
  assert.deepEqual(chainOrder(s, 'R').map((x) => x.id), ['ring', 'a', 'b', 'c']);
});
test('spacesForRound = real-1 between consecutive real stitches', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 0, -30), dc('b', 'R', 'a', 30, -30), dc('c', 'R', 'b', 60, -30)];
  const sp = spacesForRound(s, 'R');
  assert.equal(sp.length, 2);
  assert.ok(near(sp[0]!.point.x, 15) && near(sp[0]!.point.y, -60));
});
test('pickBase prefers the nearest space/stitch', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 0, -30), dc('b', 'R', 'a', 40, -30)];
  assert.equal(pickBase(s, 20, -60)!.kind, 'space');
  const atHead = pickBase(s, 0, -60)!;
  assert.equal(atHead.kind, 'stitch');
  assert.equal(atHead.kind === 'stitch' && atHead.id, 'a');
  assert.equal(pickBase(s, 999, 999), null);
});
test('successorInRound + chainFrom', () => {
  const s = [ring('R'), dc('a', 'R', 'ring', 0, 0), dc('b', 'R', 'a', 0, 0), dc('c', 'R', 'b', 0, 0)];
  assert.equal(successorInRound(s, 'a', 'R')!.id, 'b');
  assert.deepEqual(chainFrom(s, 'b', 'R').map((x) => x.id), ['b', 'c']);
});
test('defaultOriginId = tail of round, else previous round tail', () => {
  const rounds = [{ id: 'R1', name: 'R1' }, { id: 'R2', name: 'R2' }];
  const s = [ring('R1'), dc('a', 'R1', 'ring', 0, 0), dc('b', 'R1', 'a', 0, 0)];
  assert.equal(defaultOriginId(s, rounds, 'R1'), 'b');
  assert.equal(defaultOriginId(s, rounds, 'R2'), 'b');
});
test('basePoint resolves stitch + space', () => {
  const s = [dc('a', 'R', null, 0, -30), dc('b', 'R', 'a', 40, -30)];
  const byId = new Map(s.map((x) => [x.id, x]));
  assert.ok(near(basePoint(byId, { kind: 'stitch', id: 'a' })!.y, -60));
  assert.ok(near(basePoint(byId, { kind: 'space', ids: ['a', 'b'] })!.x, 20));
});

// ---- model -----------------------------------------------------------------
test('newProject / newPattern shape', () => {
  const p = newProject('X');
  assert.equal(p.name, 'X');
  assert.equal(p.versions.length, 1);
  assert.equal(p.versions[0]!.status, 'draft');
  assert.equal(p.activeVersionId, p.versions[0]!.id);
  assert.deepEqual(Object.keys(activeVersion(p).resources).sort(), ['links', 'notes', 'variations', 'yarns']);
  const pat = newPattern('Sq');
  assert.equal(pat.type, 'granny');
  assert.equal(pat.rounds.length, 2);            // Start row + Round 1 from the outset
  assert.equal(pat.rounds[0]!.name, 'Start');
  assert.equal(pat.activeRound, pat.rounds[0]!.id); // opens on the Start row
});
test('normalizeProject tolerates junk + drops orphan stitches', () => {
  const p = normalizeProject({ name: 'M', patterns: [{ type: 'granny', rounds: [{ id: 'r1', name: 'R1' }], stitches: [{ type: 'dc', round: 'r1', x: 1, y: 2 }, { type: 'dc', round: 'GONE' }, { junk: true }] }] });
  assert.equal(activeVersion(p).patterns[0]!.stitches.length, 1);
});
test('normalizeProject migrates a legacy project into one draft version', () => {
  const p = normalizeProject({ name: 'Legacy', patterns: [{ type: 'granny', rounds: [{ id: 'r1', name: 'R1' }], stitches: [] }], resources: { yarns: [{ name: 'Cotton' }] } });
  assert.equal(p.versions.length, 1);
  assert.equal(p.versions[0]!.status, 'draft');
  assert.equal(activeVersion(p).patterns.length, 1);
  assert.equal(activeVersion(p).resources.yarns[0]!.name, 'Cotton');
});
test('projectToFile / projectFromFile round-trip', () => {
  const p = sampleProject();
  const file = projectToFile(p);
  assert.equal(file.format, 'threadwick-studio');
  const back = projectFromFile(JSON.parse(JSON.stringify(file)))!;
  assert.equal(activeVersion(back).patterns[0]!.stitches.length, activeVersion(p).patterns[0]!.stitches.length);
  assert.ok(projectFromFile(p));
});
test('normalizeProject migrates a start that shared a working row', () => {
  const p = normalizeProject({ name: 'M', patterns: [{ type: 'granny', rounds: [{ id: 'r1', name: 'Round 1' }], activeRound: 'r1',
    stitches: [{ id: 'ring', type: 'mr', round: 'r1', x: 0, y: 0 }, { id: 'd', type: 'dc', round: 'r1', origin: 'ring', x: 0, y: 0 }] }] });
  const pat = activeVersion(p).patterns[0]!;
  assert.equal(pat.rounds.length, 2);
  const r = pat.stitches.find((s) => s.type === 'mr')!;
  assert.equal(r.round, pat.rounds[0]!.id);
  assert.equal(pat.stitches.filter((s) => s.round === pat.rounds[0]!.id).length, 1);
});

// ---- store -----------------------------------------------------------------
test('store: create, start, chain, splice, repair, undo/redo', () => {
  const pid = store.createProject('T');
  const patId = store.createPattern(pid, 'Sq')!;
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern()!;
  const ringId = store.setStart('mr')!;
  assert.equal(pat().stitches.length, 1);
  const round = pat().activeRound;
  const a = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: ringId })!;
  const b = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: a })!;
  const c = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: b })!;
  assert.deepEqual(chainOrder(pat().stitches, round).map((s) => s.id), [a, b, c]);
  const x = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: ringId })!;
  assert.equal(pat().stitches.find((s) => s.id === a)!.origin, x);
  assert.equal(pat().stitches.find((s) => s.id === x)!.origin, ringId);
  assert.deepEqual(chainOrder(pat().stitches, round).map((s) => s.id), [x, a, b, c]);
  store.setSelection([a]); store.deleteSelection();
  assert.equal(pat().stitches.find((s) => s.id === b)!.origin, x);
  const n = pat().stitches.length;
  store.undo(); assert.equal(pat().stitches.length, n + 1);
  store.redo(); assert.equal(pat().stitches.length, n);
});
test('store: start marker lives alone in the Start row', () => {
  const pid = store.createProject('Z');
  const patId = store.createPattern(pid, 'Sq')!;
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern()!;
  assert.equal(pat().rounds[0]!.name, 'Start');
  assert.equal(pat().activeRound, pat().rounds[0]!.id); // opens on the Start row
  const before = pat().rounds.length;
  store.setStart('mr');
  assert.equal(pat().rounds.length, before, 'no new row added — the Start row pre-exists');
  assert.equal(startRowId(pat()), pat().rounds[0]!.id);
  assert.notEqual(pat().activeRound, pat().rounds[0]!.id, 'advances to a working row');
  assert.equal(pat().stitches.filter((s) => s.round === pat().rounds[0]!.id).length, 1); // ring alone in Start
});
test('store: chains auto-align evenly between non-chain neighbours', () => {
  const pid = store.createProject('CH');
  const patId = store.createPattern(pid, 'Sq')!;
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern()!;
  const ringId = store.setStart('mr')!;
  const round = pat().activeRound;
  const A = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: -40, y: 0, rot: 0, len: 30, originId: ringId })!;
  let o = A; const chs: string[] = [];
  for (let i = 0; i < 3; i++) { o = store.placeStitch({ type: 'ch', base: { kind: 'stitch', id: o }, x: 0, y: 0, rot: 0, len: null, originId: o })!; chs.push(o); }
  store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 40, y: 0, rot: 0, len: 30, originId: o });
  const order = chainOrder(pat().stitches, round).filter((s) => s.type === 'ch');
  assert.equal(order.length, 3);
  assert.ok(order.every((s) => near(s.y, -30, 0.01)));
  assert.ok(near(order[1]!.x - order[0]!.x, 20, 0.01) && near(order[2]!.x - order[1]!.x, 20, 0.01));
  store.setSelection([order[1]!.id]);
  store.moveSelectionBy(0, -25);
  const mid = () => pat().stitches.find((s) => s.id === order[1]!.id)!;
  assert.equal(mid().auto, false);
  assert.ok(mid().y < -40);
  store.setSelection([order[1]!.id]);
  store.setChainAuto(true);
  assert.ok(near(mid().y, -30, 0.01));
});
test('store: live drag + slider coalesce into one undo entry', () => {
  const pid = store.createProject('LD');
  const patId = store.createPattern(pid, 'Sq')!;
  store.openPattern(pid, patId);
  const pat = () => store.currentPattern()!;
  const ringId = store.setStart('mr')!;
  const a = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: ringId }, x: 0, y: 0, rot: 0, len: 30, originId: ringId })!;
  const aOf = () => pat().stitches.find((s) => s.id === a)!;

  store.setSelection([a]);
  const beforeDrag = store.undoStack.length;
  store.dragBegin();
  store.dragBy(5, 0); store.dragBy(5, 0); store.dragBy(5, 0);
  store.commitGesture();
  assert.equal(store.undoStack.length, beforeDrag + 1, 'one undo entry for the whole drag');
  assert.ok(near(aOf().x, 15, 1e-9));
  store.undo();
  assert.ok(near(aOf().x, 0, 1e-9), 'undo restores the pre-drag position');

  store.setSelection([a]);
  const beforeSlide = store.undoStack.length;
  store.liveUpdateSelection({ len: 40 }); store.liveUpdateSelection({ len: 50 }); store.endLive();
  assert.equal(store.undoStack.length, beforeSlide + 1, 'one undo entry for the slider drag');
  assert.equal(aOf().len, 50);
  store.undo();
  assert.equal(aOf().len, 30, 'undo restores the pre-slider length');
});
test('store: pattern type guard + resources', () => {
  const pid = store.createProject('R');
  assert.equal(store.createPattern(pid, 'Flat thing', 'flat'), null);
  const yid = store.addResource(pid, 'yarns', { name: 'Cotton', hex: '#fff' })!;
  assert.ok(yid);
  store.updateResource(pid, 'yarns', yid, { brand: 'Acme' });
  assert.equal(activeVersion(store.getProject(pid)!).resources.yarns[0]!.brand, 'Acme');
  store.removeResource(pid, 'yarns', yid);
  assert.equal(activeVersion(store.getProject(pid)!).resources.yarns.length, 0);
});
test('store: evenRound fans stitches to equal radius', () => {
  const pid = store.createProject('E');
  const patId = store.createPattern(pid, 'Sq')!;
  store.openPattern(pid, patId);
  const r = store.setStart('mr')!;
  const round = store.currentPattern()!.activeRound; // working row after setStart auto-advances
  let o = r;
  for (const [, ] of [[10, -20], [22, 3], [-5, 25], [-18, -9]]) o = store.placeStitch({ type: 'dc', base: { kind: 'stitch', id: r }, x: 0, y: 0, rot: Math.random() * 90, len: 10 + Math.random() * 30, originId: o })!;
  store.evenRound(round);
  const dcs = chainOrder(store.currentPattern()!.stitches, round).filter((s) => s.type === 'dc');
  const cx = dcs.reduce((a, s) => a + s.x, 0) / dcs.length, cy = dcs.reduce((a, s) => a + s.y, 0) / dcs.length;
  const radii = dcs.map((s) => { const h = topOfStitch(s); return Math.hypot(h.x - cx, h.y - cy); });
  const avg = radii.reduce((a, b) => a + b, 0) / radii.length;
  assert.ok(radii.every((r2) => Math.abs(r2 - avg) < 1.5));
});

test('store: version lifecycle — publish, new draft, outdate, isolation', () => {
  const pid = store.createProject('V');
  // a fresh project has a single draft
  const prj = () => store.getProject(pid)!;
  assert.equal(prj().versions.length, 1);
  assert.equal(activeVersion(prj()).status, 'draft');

  // edit the draft
  const pat1 = store.createPattern(pid, 'Sq')!;
  assert.ok(pat1);

  // publish it
  store.publishVersion(pid);
  assert.equal(publishedVersion(prj())!.label, 'v1');
  assert.equal(draftVersion(prj()), undefined);
  assert.ok(publishedVersion(prj())!.publishedAt);

  // published version is read-only: createPattern is refused
  assert.equal(store.createPattern(pid, 'Nope'), null);
  assert.equal(activeVersion(prj()).patterns.length, 1);

  // start a new draft — snapshots the published content into a fresh version
  const draftId = store.createDraft(pid)!;
  assert.equal(prj().versions.length, 2);
  assert.equal(draftVersion(prj())!.id, draftId);
  assert.equal(draftVersion(prj())!.label, 'v2');
  assert.equal(draftVersion(prj())!.patterns.length, 1, 'draft copies the published patterns');
  assert.notEqual(draftVersion(prj())!.patterns[0]!.id, publishedVersion(prj())!.patterns[0]!.id, 'snapshot gets fresh ids');

  // calling createDraft again just returns the existing draft (one at a time)
  assert.equal(store.createDraft(pid), draftId);
  assert.equal(prj().versions.length, 2);

  // editing the draft must not touch the still-published v1
  const pubPatCount = publishedVersion(prj())!.patterns.length;
  store.createPattern(pid, 'Extra');
  assert.equal(draftVersion(prj())!.patterns.length, 2);
  assert.equal(publishedVersion(prj())!.patterns.length, pubPatCount, 'published version is undisturbed');

  // publishing the draft outdates the old published version
  store.publishVersion(pid);
  assert.equal(publishedVersion(prj())!.label, 'v2');
  assert.equal(prj().versions.filter((v) => v.status === 'outdated').length, 1);
  assert.equal(prj().versions.find((v) => v.label === 'v1')!.status, 'outdated');

  // discard a fresh draft → falls back to the published version
  store.createDraft(pid);
  assert.equal(prj().versions.length, 3);
  store.discardDraft(pid);
  assert.equal(prj().versions.length, 2);
  assert.equal(activeVersion(prj()).status, 'published');
});

// ---- files -----------------------------------------------------------------
test('summarizeRound collapses runs', () => {
  const pat = newPattern('S');
  const rid = pat.rounds[0]!.id;
  const s = (id: string, type: StitchType, origin: string | null): Stitch => ({ id, round: rid, type, origin, base: null as Base, x: 0, y: 0, rot: 0, len: null, color: null, mirror: false });
  pat.stitches = [s('r', 'mr', null), s('1', 'dc', 'r'), s('2', 'dc', '1'), s('3', 'dc', '2'), s('4', 'ch', '3'), s('5', 'ch', '4'), s('6', 'dc', '5')];
  assert.equal(summarizeRound(pat, rid), '3 dc, ch 2, dc');
});
test('chartToSVG emits a valid root with a legend', () => {
  const svg = chartToSVG(activeVersion(sampleProject()).patterns[0]!, { title: 'X' });
  assert.ok(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
  assert.ok(svg.includes('Legend'));
});
