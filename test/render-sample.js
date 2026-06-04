// Dev helper (not part of the test suite): builds the sample square via the
// real store, plus a symbol reference sheet, and writes them to disk so the
// rendered output can be eyeballed / rasterized.
import { writeFileSync, mkdirSync } from 'node:fs';
import { store } from '../js/state.js';
import { distributeRound } from '../js/rounds.js';
import { chartToSVG } from '../js/svg.js';

// ---- the same sample main.js seeds ----------------------------------------
store.reset();
store.setTitle('Sample Granny Square');
store.setSymmetry({ order: 4, mirror: false });
store.addStitch({ type: 'mr', x: 0, y: 0 }, { symmetry: false, select: false });
store.addStitchesRaw(distributeRound({ radius: 44, count: 12, sequence: ['dc'], startAngle: -90, orient: 'radial' }), { select: false });
const shell = store.addCluster({ name: '3 dc shell', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 52 });
for (const x of [-46, 0, 46]) store.addStitch({ type: 'dc', x, y: -120, rot: 0 }, { select: false });
store.addStitch({ type: shell, x: 122, y: -122 }, { select: false });

mkdirSync(new URL('../samples/', import.meta.url), { recursive: true });
writeFileSync(new URL('../samples/basic-granny.stitchgrid.json', import.meta.url), JSON.stringify(store.serialize(), null, 2));
writeFileSync('/tmp/sample.svg', chartToSVG(store.state, { legend: true, title: store.state.title }));
console.log('sample stitches:', store.state.stitches.length);

// ---- symbol reference sheet ------------------------------------------------
const clusterMap = {
  c_v: { name: '2 dc in 1 (V)', base: 'dc', legs: 2, joinBottom: true, joinTop: false, spread: 34 },
  c_shell: { name: '3 dc shell', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 52 },
  c_bobble: { name: '3 dc cluster', base: 'dc', legs: 3, joinBottom: true, joinTop: true },
  c_tog: { name: '3 dc together', base: 'dc', legs: 3, joinBottom: false, joinTop: true },
};
const base = ['ch', 'slst', 'sc', 'hdc', 'dc', 'tr', 'dtr', 'mr'];
const stitches = [];
base.forEach((t, i) => stitches.push({ id: 'b' + i, type: t, x: i * 60 - 210, y: 0, rot: 0 }));
Object.keys(clusterMap).forEach((t, i) => stitches.push({ id: 'c' + i, type: t, x: i * 80 - 120, y: 120, rot: 0 }));
const sheet = { title: 'stitchgrid symbols', stitches, clusterMap };
writeFileSync('/tmp/symbols.svg', chartToSVG(sheet, { legend: true, title: 'stitchgrid symbols' }));
console.log('wrote /tmp/sample.svg and /tmp/symbols.svg');
