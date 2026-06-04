// main.js — bootstrap: wire the store, canvas, panels, keyboard, autosave.

import { store } from './state.js';
import { initCanvas } from './canvas.js';
import { initToolbar } from './toolbar.js';
import { initPalette } from './palette.js';
import { initInspector } from './inspector.js';
import { initRoundsPanel } from './roundsPanel.js';
import { initLegend } from './legend.js';
import { initClusterEditor } from './clusterEditor.js';
import { initExport } from './export.js';
import { initHelp } from './help.js';
import { distributeRound } from './rounds.js';

const SAVE_KEY = 'stitchgrid:autosave:v1';

const canvas = initCanvas(store);
const clusterEditor = initClusterEditor(store);
const exporter = initExport(store, canvas);
const toolbar = initToolbar(store, canvas, exporter);
const palette = initPalette(store, canvas, clusterEditor);
clusterEditor.setOnSaved((id) => palette.choose('cluster:' + id));
initInspector(store);
initRoundsPanel(store, canvas);
initLegend(store);
initHelp();

// ---- autosave (the container is ephemeral; keep work between reloads) ------
let saveTimer = null;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(store.serialize())); } catch {}
  }, 400);
});

function tryRestore() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.stitches) && data.stitches.length) {
      store.load(data);
      return true;
    }
  } catch {}
  return false;
}

// A worked example so the tool opens on something real (and shows what a clean,
// even, symmetric square looks like): magic ring, an inner round of dc, four
// straight dc sides, and a 3-dc shell at each corner — all via 4-fold symmetry.
function buildSample() {
  store.reset();
  store.setTitle('Sample Granny Square');
  store.setSymmetry({ order: 4, mirror: false });
  store.addStitch({ type: 'mr', x: 0, y: 0 }, { symmetry: false, select: false });
  store.addStitchesRaw(
    distributeRound({ radius: 44, count: 12, sequence: ['dc'], startAngle: -90, orient: 'radial' }),
    { select: false }
  );
  const shell = store.addCluster({ name: '3 dc shell', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 52 });
  // four straight sides: 3 dc on the top edge, replicated to all sides by symmetry
  for (const x of [-46, 0, 46]) store.addStitch({ type: 'dc', x, y: -120, rot: 0 }, { select: false });
  // one corner shell -> four corners via symmetry
  store.addStitch({ type: shell, x: 122, y: -122 }, { select: false });
  store.clearHistory();
  store.emit();
}

if (!tryRestore()) buildSample();
canvas.onLoad();
canvas.fit();

// ---- keyboard --------------------------------------------------------------
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  const meta = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (meta && k === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
  if (meta && k === 'y') { e.preventDefault(); store.redo(); return; }
  if (meta && k === 's') { e.preventDefault(); exporter.saveProject(); return; }
  if (meta) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.deleteSelection(); return; }
  if (e.key === 'Escape') { store.clearSelection(); return; }
  if (e.key === ' ') { e.preventDefault(); canvas.setSpace(true); return; }
  if (k === 'v') { toolbar.setTool('select'); return; }
  if (k === 'p') { toolbar.setTool('place'); return; }
  if (k === 'h') { toolbar.setTool('pan'); return; }
  if (k === 'r') { store.rotateSelectionBy(e.shiftKey ? -15 : 15); return; }
  const n = e.shiftKey ? 8 : 2;
  if (e.key === 'ArrowLeft') { e.preventDefault(); store.moveSelectionBy(-n, 0); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); store.moveSelectionBy(n, 0); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); store.moveSelectionBy(0, -n); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); store.moveSelectionBy(0, n); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') canvas.setSpace(false); });

// expose for debugging
window.stitchgrid = { store, canvas, exporter };
