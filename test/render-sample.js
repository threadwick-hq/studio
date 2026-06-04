// Dev helper (not part of the test suite): regenerates the shipped sample
// artifacts in samples/ from the real store + renderer, so they always match
// the current code. Rasterize the SVGs to PNG separately (see README).
import { writeFileSync, mkdirSync } from 'node:fs';
import { store } from '../js/state.js';
import { distributeRound } from '../js/rounds.js';
import { chartToSVG } from '../js/svg.js';

const dir = new URL('../samples/', import.meta.url);
mkdirSync(dir, { recursive: true });
const out = (name, data) => writeFileSync(new URL(name, dir), data);
const svg = () => chartToSVG(store.state, { legend: true, title: store.state.title });

// 1) The starter sample (identical to what main.js seeds on first run).
store.reset();
store.setTitle('Sample Granny Square');
store.setSymmetry({ order: 4, mirror: false });
store.addStitch({ type: 'mr', x: 0, y: 0 }, { symmetry: false, select: false });
store.addStitchesRaw(distributeRound({ radius: 44, count: 12, sequence: ['dc'], startAngle: -90, orient: 'radial' }), { select: false });
const s1 = store.addCluster({ name: '3 dc shell', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 52 });
for (const x of [-46, 0, 46]) store.addStitch({ type: 'dc', x, y: -120, rot: 0 }, { select: false });
store.addStitch({ type: s1, x: 122, y: -122 }, { select: false });
out('sample-granny.svg', svg());
out('basic-granny.stitchgrid.json', JSON.stringify(store.serialize(), null, 2));

// 2) Symbol reference sheet.
const clusterMap = {
  c_v: { name: '2 dc in 1 (V)', base: 'dc', legs: 2, joinBottom: true, joinTop: false, spread: 34 },
  c_shell: { name: '3 dc shell', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 52 },
  c_bobble: { name: '3 dc cluster', base: 'dc', legs: 3, joinBottom: true, joinTop: true },
  c_tog: { name: '3 dc together', base: 'dc', legs: 3, joinBottom: false, joinTop: true },
};
const stitches = [];
['ch', 'slst', 'sc', 'hdc', 'dc', 'tr', 'dtr', 'mr'].forEach((t, i) => stitches.push({ id: 'b' + i, type: t, x: i * 60 - 210, y: 0, rot: 0 }));
Object.keys(clusterMap).forEach((t, i) => stitches.push({ id: 'c' + i, type: t, x: i * 80 - 120, y: 120, rot: 0 }));
out('symbols.svg', chartToSVG({ title: 'stitchgrid symbols', stitches, clusterMap }, { legend: true, title: 'stitchgrid symbols' }));

// 3) The hero: a realistic multi-round granny square (nested dc edges +
//    colour-matched corner shells + a gold centre motif), all via 4-fold symmetry.
const NAVY = '#163a5f', TEAL = '#1f7a6b', GOLD = '#c98a1a';
store.reset();
store.setTitle('Classic Granny Square');
store.setSymmetry({ order: 4, mirror: false });
store.addStitch({ type: 'mr', x: 0, y: 0 }, { symmetry: false, select: false });
store.addStitchesRaw(distributeRound({ radius: 34, count: 8, sequence: ['dc'], startAngle: -90, orient: 'radial', color: GOLD }), { select: false });
const corner = store.addCluster({ name: '3 dc corner', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 56 });
const roundSquare = (E, xs, color) => {
  for (const x of xs) store.addStitch({ type: 'dc', x, y: -E, rot: 0, color }, { select: false });
  store.addStitch({ type: corner, x: E, y: -E, color }, { select: false });
};
roundSquare(74, [-40, 0, 40], NAVY);
roundSquare(124, [-92, -46, 0, 46, 92], TEAL);
roundSquare(176, [-148, -99, -49, 0, 49, 99, 148], NAVY);
out('granny-square.svg', svg());
out('granny-square.stitchgrid.json', JSON.stringify(store.serialize(), null, 2));

console.log('regenerated samples/: sample-granny, symbols, granny-square (+ 2 project files)');
