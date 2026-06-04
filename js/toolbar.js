// toolbar.js — binds the top toolbar controls to the store and canvas.

import { SYMMETRY_ORDERS } from './symmetry.js';

export function initToolbar(store, canvas, exporter) {
  const $ = (id) => document.getElementById(id);

  // ---- tools (canvas owns the active tool; we just reflect it) -------------
  const toolButtons = [...document.querySelectorAll('[data-tool]')];
  canvas.setOnToolChange((t) => toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === t)));
  toolButtons.forEach((b) => b.addEventListener('click', () => canvas.setTool(b.dataset.tool)));

  // ---- symmetry ------------------------------------------------------------
  const symOrder = $('sym-order');
  symOrder.innerHTML = SYMMETRY_ORDERS.map((n) => `<option value="${n}">${n}-fold</option>`).join('');
  symOrder.addEventListener('change', () => store.setSymmetry({ order: +symOrder.value }));
  $('sym-mirror').addEventListener('change', (e) => store.setSymmetry({ mirror: e.target.checked }));

  // ---- snapping ------------------------------------------------------------
  $('snap-mode').addEventListener('change', (e) => store.setSnap({ mode: e.target.value }));
  $('snap-ring').addEventListener('change', (e) => store.setSnap({ ring: e.target.checked }));
  $('snap-spoke').addEventListener('change', (e) => store.setSnap({ spoke: e.target.checked }));
  $('snap-spoke-count').addEventListener('change', (e) => store.setSnap({ spokeCount: Math.max(1, +e.target.value | 0) }));
  $('snap-grid-step').addEventListener('change', (e) => store.setSnap({ gridStep: Math.max(2, +e.target.value) }));
  $('snap-autoradial').addEventListener('change', (e) => store.setSnap({ autoRadial: e.target.checked }));

  // ---- guides --------------------------------------------------------------
  $('guide-show').addEventListener('change', (e) => store.setGuides({ show: e.target.checked }));
  $('guide-anchors').addEventListener('change', (e) => store.setGuides({ showAnchors: e.target.checked }));

  // ---- zoom ----------------------------------------------------------------
  $('zoom-in').addEventListener('click', () => canvas.zoomIn());
  $('zoom-out').addEventListener('click', () => canvas.zoomOut());
  $('zoom-fit').addEventListener('click', () => canvas.fit());

  // ---- history -------------------------------------------------------------
  $('btn-undo').addEventListener('click', () => store.undo());
  $('btn-redo').addEventListener('click', () => store.redo());

  // ---- file / export -------------------------------------------------------
  $('file-new').addEventListener('click', () => {
    if (confirm('Start a new, empty chart? Unsaved changes will be lost.')) {
      store.reset();
      canvas.onLoad();
      canvas.fit();
    }
  });
  $('file-save').addEventListener('click', () => exporter.saveProject());
  $('file-open').addEventListener('click', () => exporter.openProject());
  $('export-svg').addEventListener('click', () => exporter.exportSVG());
  $('export-png').addEventListener('click', () => exporter.exportPNG());
  const pdfBtn = $('export-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', () => exporter.printPDF());

  // ---- title ---------------------------------------------------------------
  const title = $('title');
  title.addEventListener('change', () => store.setTitle(title.value));

  // ---- reflect state back into controls (e.g. after load/undo) -------------
  store.subscribe((state) => {
    const sy = state.settings.symmetry;
    const sn = state.settings.snap;
    const g = state.settings.guides;
    if (document.activeElement !== title) title.value = state.title;
    symOrder.value = sy.order;
    $('sym-mirror').checked = sy.mirror;
    $('snap-mode').value = sn.mode;
    $('snap-ring').checked = sn.ring;
    $('snap-spoke').checked = sn.spoke;
    $('snap-spoke-count').value = sn.spokeCount;
    $('snap-grid-step').value = sn.gridStep;
    $('snap-autoradial').checked = sn.autoRadial;
    $('guide-show').checked = g.show;
    $('guide-anchors').checked = g.showAnchors;
    $('btn-undo').disabled = store.undoStack.length === 0;
    $('btn-redo').disabled = store.redoStack.length === 0;
  });

  canvas.setTool('place');

  return { setTool: (t) => canvas.setTool(t) };
}
