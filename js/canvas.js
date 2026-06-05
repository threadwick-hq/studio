// canvas.js — the interactive WYSIWYG surface.
//
// The chart is drawn by the shared renderer (svg.chartInner) straight into an
// <svg> via innerHTML; data-id attributes make hit-testing trivial. A separate
// persistent cursor layer shows the live snap ghost without re-rendering the
// whole chart on every mouse move. Zoom/pan only touch the viewBox (vectors
// scale for free), so they stay smooth regardless of stitch count.

import { clamp, round } from './util.js';
import { symmetryOrbit } from './symmetry.js';
import { ringRadii } from './rounds.js';
import { STARTS, STITCHES } from './stitches.js';
import { chartInner, contentBounds, buildStitchShapes, shapesMarkup } from './svg.js';

const NS = 'http://www.w3.org/2000/svg';
const GHOST = '#2f7bff';
const ORIGIN = '#1f9d55'; // where the next stitch comes from
const TARGET = '#e8830c'; // what it's worked into

// A coloured ring + label drawn around a stitch, to make origin/target obvious.
function halo(s, color, label) {
  return (
    `<circle cx="${round(s.x)}" cy="${round(s.y)}" r="14" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="2.8"/>` +
    `<text x="${round(s.x)}" y="${round(s.y) - 18}" text-anchor="middle" font-size="10" font-weight="700"` +
    ` fill="${color}" paint-order="stroke" stroke="#fff" stroke-width="3">${label}</text>`
  );
}

// A diamond + label marking a space target (the gap between two stitches).
function spaceMark(pt, color, label) {
  const x = round(pt.x), y = round(pt.y);
  return (
    `<path d="M ${x - 7} ${y} L ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} Z" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2.6"/>` +
    `<text x="${x}" y="${y - 13}" text-anchor="middle" font-size="10" font-weight="700"` +
    ` fill="${color}" paint-order="stroke" stroke="#fff" stroke-width="3">${label}</text>`
  );
}

// A dashed connector between two chart points.
function link(x1, y1, x2, y2, color, dash) {
  return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${color}" stroke-width="2.2" stroke-dasharray="${dash}" opacity="0.85"/>`;
}

export function initCanvas(store) {
  const svg = document.getElementById('canvas');
  const cursorLayer = document.createElementNS(NS, 'g');
  cursorLayer.setAttribute('class', 'cursor-layer');
  cursorLayer.setAttribute('pointer-events', 'none');

  let view = { ...store.state.view };
  let tool = 'select'; // Select is home base; pick a stitch to enter insert mode
  let placement = { kind: 'stitch', ref: 'dc' };
  let toolListeners = [];
  let drag = null; // { leadId, ox, oy, startU, moved }
  let panning = null;
  let marquee = null; // { startU, additive, base:Set, moved }
  let spaceDown = false;
  // Insert (two-click) flow: 'target' awaits the click on what to crochet into,
  // 'position' awaits the click that places the stitch. lockedTarget holds the
  // chosen target between the two clicks.
  let stage = 'target';
  let lockedTarget = null;
  let lastU = { x: 0, y: 0 };
  const hintEl = document.querySelector('.canvas-hint');

  // A start (round-0) element or a motif places in one click — there's nothing
  // to crochet into — so they skip the two-click target step.
  const isOneClick = () =>
    placement.kind === 'motif' || (placement.kind === 'stitch' && STARTS.includes(placement.ref));

  function resetInsert() {
    stage = 'target';
    lockedTarget = null;
  }

  const rect = () => svg.getBoundingClientRect();

  function toUser(clientX, clientY) {
    const r = rect();
    return {
      x: view.panX + (clientX - (r.left + r.width / 2)) / view.scale,
      y: view.panY + (clientY - (r.top + r.height / 2)) / view.scale,
    };
  }

  function applyViewBox() {
    const r = rect();
    const w = Math.max(1, r.width) / view.scale;
    const h = Math.max(1, r.height) / view.scale;
    svg.setAttribute('viewBox', `${view.panX - w / 2} ${view.panY - h / 2} ${w} ${h}`);
    store.state.view = { ...view };
  }

  function guidesOpts() {
    const g = store.state.settings.guides;
    const sn = store.state.settings.snap;
    return {
      rings: g.show ? ringRadii(store.state.rounds) : [],
      spokeCount: g.show && sn.mode === 'polar' && sn.spoke ? sn.spokeCount : 0,
      spokeMax: Math.max(280, ...ringRadii(store.state.rounds), 0) + 30,
      showGrid: g.show && (sn.mode === 'grid' || g.showGrid),
      gridStep: sn.gridStep,
      showCenter: g.show,
    };
  }

  function render() {
    applyViewBox();
    svg.innerHTML = chartInner(store.state, {
      includeGuides: store.state.settings.guides.show,
      guides: guidesOpts(),
      showAnchors: store.state.settings.guides.showAnchors,
      selection: store.selection,
    });
    svg.appendChild(cursorLayer);
  }

  function clearGhost() {
    cursorLayer.innerHTML = '';
  }

  function ghostMarkup(orbit) {
    const inner = shapesMarkup(buildStitchShapes(placement.ref, store.state.clusterMap).shapes, GHOST);
    let g = '', marks = '';
    orbit.forEach((o, i) => {
      const m = o.mirror ? ' scale(-1,1)' : '';
      g += `<g transform="translate(${round(o.x)} ${round(o.y)}) rotate(${round(o.rot)})${m}" opacity="${i === 0 ? 0.55 : 0.26}">${inner}</g>`;
    });
    for (const o of orbit) marks += `<circle cx="${round(o.x)}" cy="${round(o.y)}" r="3.2" fill="none" stroke="${GHOST}" stroke-width="1.2"/>`;
    return g + marks;
  }
  function targetMarkup(target, originSt) {
    const pt = store.targetPoint(target);
    if (!pt) return '';
    if (target.kind === 'stitch' && originSt && target.id === originSt.id) return ''; // == origin
    return target.kind === 'space' ? spaceMark(pt, TARGET, 'sp') : halo(pt, TARGET, 'into');
  }

  function updateGhost(u) {
    lastU = u;
    if (tool !== 'place') return clearGhost();
    const p = store.snapPoint(u.x, u.y);
    const rot = store.defaultRotFor(p.x, p.y);
    const sym = store.state.settings.symmetry;
    const atCenter = Math.hypot(p.x, p.y) < 1e-6;

    // One-click placements (starts / motifs): a plain positional ghost.
    if (isOneClick()) {
      const g = placement.kind === 'motif' ? '' : ghostMarkup([{ x: p.x, y: p.y, rot: 0, mirror: false }]);
      cursorLayer.innerHTML = g || `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="3.6" fill="none" stroke="${GHOST}" stroke-width="1.4"/>`;
      return;
    }

    const originSt = store.byId(store.currentOriginId());
    const originHalo = originSt ? halo(originSt, ORIGIN, 'origin') : '';

    if (stage === 'target') {
      // Choosing what to crochet into — highlight the candidate target + a reticle.
      const target = atCenter ? null : store.pickTarget(p.x, p.y);
      const reticle = `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="4" fill="none" stroke="${TARGET}" stroke-width="1.6"/>`;
      cursorLayer.innerHTML = reticle + targetMarkup(target, originSt) + originHalo;
      return;
    }

    // stage 'position': target is locked; the stitch goes where you click.
    const useSym = !atCenter && (sym.order > 1 || sym.mirror);
    const orbit = useSym ? symmetryOrbit({ x: p.x, y: p.y, rot, mirror: false }, sym) : [{ x: p.x, y: p.y, rot, mirror: false }];
    const tgtPt = store.targetPoint(lockedTarget);
    let links = '';
    if (originSt) links += link(originSt.x, originSt.y, p.x, p.y, ORIGIN, '5 3');
    if (tgtPt) links += link(p.x, p.y, tgtPt.x, tgtPt.y, TARGET, '2 3');
    cursorLayer.innerHTML = links + ghostMarkup(orbit) + originHalo + targetMarkup(lockedTarget, originSt);
  }

  function placementName() {
    return (STITCHES[placement.ref] && STITCHES[placement.ref].name)
      || (store.state.clusterMap[placement.ref] && store.state.clusterMap[placement.ref].name)
      || (placement.kind === 'motif' ? 'motif' : 'stitch');
  }
  function updateHint() {
    if (!hintEl) return;
    if (tool === 'pan') { hintEl.textContent = 'Drag to pan · scroll to zoom'; return; }
    if (tool === 'select') {
      hintEl.textContent = 'Pick a stitch (or press its key) to start crocheting · drag to select / move · scroll to zoom · hold space to pan';
      return;
    }
    const name = placementName();
    if (isOneClick()) hintEl.textContent = `Click to place the ${name} · Esc to exit`;
    else if (stage === 'target') hintEl.textContent = `Insert ${name} — click what to crochet into (target) · Shift-click sets origin · Esc exits`;
    else hintEl.textContent = `Insert ${name} — click to place it · Esc cancels the target`;
  }

  // ---- pointer interaction -------------------------------------------------
  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || tool === 'pan' || spaceDown) {
      panning = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const u = toUser(e.clientX, e.clientY);
    if (tool === 'place') {
      // Shift-click an existing stitch re-anchors the origin (working position),
      // so you can continue a new strand from anywhere without placing.
      if (e.shiftKey && placement.kind !== 'motif') {
        const hit = e.target.closest('[data-id]');
        if (hit) { store.setOrigin(hit.getAttribute('data-id')); updateGhost(u); return; }
      }
      const p = store.snapPoint(u.x, u.y);
      if (placement.kind === 'motif') {
        store.placeMotif(placement.ref, p.x, p.y);
      } else if (isOneClick()) {
        // a start (round 0): one click, no origin/target — it's a fresh root.
        store.addStitch({ type: placement.ref, x: p.x, y: p.y, origin: null, target: null }, { select: false });
      } else if (stage === 'target') {
        // first click: choose what to crochet into.
        const t = store.pickTarget(p.x, p.y);
        if (t) { lockedTarget = t; stage = 'position'; updateHint(); updateGhost(u); return; }
        // nothing here to work into → place freely in one click.
        store.addStitch({ type: placement.ref, x: p.x, y: p.y, origin: store.currentOriginId(), target: null }, { select: false });
      } else {
        // second click: place the stitch (origin auto-advances to it).
        store.addStitch({ type: placement.ref, x: p.x, y: p.y, origin: store.currentOriginId(), target: lockedTarget }, { select: false });
        resetInsert();
        updateHint();
      }
      updateGhost(u); // refresh halos for the new chain head / next target pick
      return;
    }
    // select tool
    const hit = e.target.closest('[data-id]');
    if (hit) {
      const id = hit.getAttribute('data-id');
      if (e.shiftKey) store.selectGroupOf(id, true);
      else if (!store.selection.has(id)) store.selectGroupOf(id, false);
      const lead = store.byId(id);
      drag = { leadId: id, ox: u.x - lead.x, oy: u.y - lead.y, startU: u, moved: false, shift: e.shiftKey };
      svg.setPointerCapture(e.pointerId);
    } else {
      // empty space: begin a rubber-band (box) selection
      marquee = { startU: u, additive: e.shiftKey, base: e.shiftKey ? new Set(store.selection) : new Set(), moved: false };
      svg.setPointerCapture(e.pointerId);
    }
  });

  svg.addEventListener('pointermove', (e) => {
    // Recover if a pointerup was missed (released off-window, capture lost):
    // no buttons held means the gesture is over.
    if ((drag || panning || marquee) && e.buttons === 0) {
      drag = null;
      panning = null;
      marquee = null;
      clearGhost();
      try { svg.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    const u = toUser(e.clientX, e.clientY);
    if (panning) {
      view.panX -= (e.clientX - panning.x) / view.scale;
      view.panY -= (e.clientY - panning.y) / view.scale;
      panning = { x: e.clientX, y: e.clientY };
      applyViewBox();
      return;
    }
    if (marquee) {
      marquee.moved = true;
      const x0 = Math.min(marquee.startU.x, u.x);
      const y0 = Math.min(marquee.startU.y, u.y);
      const w = Math.abs(u.x - marquee.startU.x);
      const h = Math.abs(u.y - marquee.startU.y);
      cursorLayer.innerHTML = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${GHOST}" fill-opacity="0.08" stroke="${GHOST}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      const ids = new Set(marquee.base);
      for (const st of store.state.stitches) {
        if (st.x >= x0 && st.x <= x0 + w && st.y >= y0 && st.y <= y0 + h) ids.add(st.id);
      }
      store.setSelection([...ids]);
      return;
    }
    if (drag) {
      if (!drag.moved) {
        const moved = Math.hypot(u.x - drag.startU.x, u.y - drag.startU.y) * view.scale;
        if (moved < 3) return;
        drag.moved = true;
        store.dragBegin();
      }
      const t = store.snapPoint(u.x - drag.ox, u.y - drag.oy);
      store.dragSelectionTo(drag.leadId, t.x, t.y);
      return;
    }
    updateGhost(u);
  });

  function endPointer(e) {
    // A click (no drag, no shift) on a stitch that's part of a larger selection
    // collapses the selection down to just that stitch's group.
    if (drag && !drag.moved && !drag.shift) store.selectGroupOf(drag.leadId, false);
    // An empty click (box-select that never moved) clears the selection.
    if (marquee && !marquee.moved && !marquee.additive) store.clearSelection();
    if (marquee) clearGhost();
    panning = null;
    drag = null;
    marquee = null;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', () => { if (!marquee && !drag && !panning) clearGhost(); });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = rect();
    const cxPix = e.clientX - (r.left + r.width / 2);
    const cyPix = e.clientY - (r.top + r.height / 2);
    const u0x = view.panX + cxPix / view.scale;
    const u0y = view.panY + cyPix / view.scale;
    view.scale = clamp(view.scale * Math.exp(-e.deltaY * 0.0012), 0.15, 9);
    view.panX = u0x - cxPix / view.scale;
    view.panY = u0y - cyPix / view.scale;
    applyViewBox();
  }, { passive: false });

  // ---- view helpers --------------------------------------------------------
  function fit() {
    const b = contentBounds(store.state.stitches, store.state.clusterMap);
    const r = rect();
    const bw = b.maxX - b.minX + 100;
    const bh = b.maxY - b.minY + 100;
    view.scale = clamp(Math.min(r.width / bw, r.height / bh), 0.15, 9);
    view.panX = (b.minX + b.maxX) / 2;
    view.panY = (b.minY + b.maxY) / 2;
    render();
  }
  function zoomBy(f) {
    view.scale = clamp(view.scale * f, 0.15, 9);
    applyViewBox();
  }

  // Coalesce store changes into one render per frame, so a live drag (which
  // emits on every pointermove) doesn't rebuild the whole chart repeatedly.
  let renderQueued = false;
  const raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (f) => setTimeout(f, 16);
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    raf(() => { renderQueued = false; render(); });
  }

  const ro = new ResizeObserver(() => applyViewBox());
  ro.observe(svg);

  store.subscribe(scheduleRender);
  render();
  updateHint();

  return {
    render,
    fit,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    setTool(t) {
      const changed = t !== tool;
      tool = t;
      if (changed) { resetInsert(); clearGhost(); } // re-selecting the same tool is a no-op
      const wrap = svg.closest('#canvas-wrap');
      if (wrap) wrap.dataset.tool = t;
      updateHint();
      for (const fn of toolListeners) fn(t);
    },
    getTool: () => tool,
    setOnToolChange(fn) { toolListeners.push(fn); },
    // enter=false sets the active stitch without leaving Select mode (used at
    // startup); a palette pick / shortcut uses enter=true to begin inserting.
    setPlacement(p, enter = true) {
      placement = p;
      resetInsert();
      if (enter && tool !== 'place') this.setTool('place');
      else { updateHint(); updateGhost(lastU); }
    },
    getPlacement: () => placement,
    // Step out of the current insert action: cancel a locked target, else leave
    // insert mode. Returns false when there's nothing to escape (Select mode).
    escape() {
      if (tool !== 'place') return false;
      if (stage === 'position') { resetInsert(); updateHint(); updateGhost(lastU); return true; }
      this.setTool('select');
      return true;
    },
    onLoad() {
      view = { ...store.state.view };
      render();
    },
    setSpace(v) { spaceDown = v; },
  };
}
