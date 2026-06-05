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
import { chartInner, contentBounds, buildStitchShapes, shapesMarkup, topOfStitch, pickBase, nearestStitch } from './svg.js';

const NS = 'http://www.w3.org/2000/svg';
const GHOST = '#2f7bff';
const ORIGIN = '#5cb3ff'; // light blue — where the stitch comes from
const TARGET = '#e8830c'; // orange — what it's worked into (the base)

// Small markers (≈quarter the old size) for origin / target.
function dot(pt, color, r = 3.5) {
  return `<circle cx="${round(pt.x)}" cy="${round(pt.y)}" r="${r}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1.6"/>`;
}
function diamond(pt, color, s = 4.5) {
  const x = round(pt.x), y = round(pt.y);
  return `<path d="M ${x - s} ${y} L ${x} ${y - s} L ${x + s} ${y} L ${x} ${y + s} Z" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="1.6"/>`;
}

// A dashed connector between two chart points.
function link(x1, y1, x2, y2, color, dash) {
  return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${color}" stroke-width="1.6" stroke-dasharray="${dash}" opacity="0.8"/>`;
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
  // Insert flow stages: 'origin' (pick where you come from), 'base' (pick what to
  // crochet into — a stitch head or a space), 'head' (pick the top → locks it in).
  let stage = 'base';
  let lockedBase = null;
  let lastU = { x: 0, y: 0 };
  const hintEl = document.querySelector('.canvas-hint');
  const toastEl = document.getElementById('step-toast');

  // A start (round-0) element or a motif places in one click — there's nothing
  // to crochet into — so they skip the target/position steps.
  const isOneClick = () =>
    placement.kind === 'motif' || (placement.kind === 'stitch' && STARTS.includes(placement.ref));

  const cmap = () => store.state.clusterMap;
  // The chart point a base resolves to: a stitch's HEAD, or the midpoint of two
  // stitch heads for a space. (A base is always a head or a space — never free.)
  function basePoint(base) {
    if (!base) return null;
    if (base.kind === 'stitch') { const s = store.byId(base.id); return s ? topOfStitch(s, cmap()) : null; }
    if (base.kind === 'space') {
      const a = store.byId(base.ids[0]), b = store.byId(base.ids[1]);
      if (!a || !b) return null;
      const ta = topOfStitch(a, cmap()), tb = topOfStitch(b, cmap());
      return { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
    }
    return null;
  }

  function resetInsert() {
    lockedBase = null;
    // A fresh strand starts by picking the origin (if there's anything to pick);
    // once you're working, origin auto-advances so you go straight to the base.
    stage = store.currentOriginId() ? 'base' : (store.state.stitches.length ? 'origin' : 'base');
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

  // The stitch ghost, stretched to `len`, for each (already-transformed) base.
  function ghostMarkup(orbit, len) {
    const inner = shapesMarkup(buildStitchShapes(placement.ref, store.state.clusterMap, len).shapes, GHOST);
    let g = '';
    orbit.forEach((o, i) => {
      const m = o.mirror ? ' scale(-1,1)' : '';
      g += `<g transform="translate(${round(o.x)} ${round(o.y)}) rotate(${round(o.rot)})${m}" opacity="${i === 0 ? 0.6 : 0.28}">${inner}</g>`;
    });
    return g;
  }
  function baseMark(base) {
    const pt = basePoint(base);
    if (!pt) return '';
    return base.kind === 'space' ? diamond(pt, TARGET) : dot(pt, TARGET);
  }
  // Re-draw a placed stitch in a highlight colour — used to flag the origin
  // stitch (the one the next stitch comes from) in light blue.
  function stitchGlyphAt(st, color) {
    const { shapes } = buildStitchShapes(st.type, cmap(), st.len);
    const m = st.mirror ? ' scale(-1,1)' : '';
    return `<g transform="translate(${round(st.x)} ${round(st.y)}) rotate(${round(st.rot || 0)})${m}">${shapesMarkup(shapes, color)}</g>`;
  }

  function updateGhost(u) {
    lastU = u;
    if (tool !== 'place') return clearGhost();
    const p = store.snapPoint(u.x, u.y);
    const sym = store.state.settings.symmetry;

    // One-click placements (starts / motifs): a plain positional ghost.
    if (isOneClick()) {
      const g = placement.kind === 'motif' ? '' : ghostMarkup([{ x: p.x, y: p.y, rot: 0, mirror: false }]);
      cursorLayer.innerHTML = g || `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="3.6" fill="none" stroke="${GHOST}" stroke-width="1.4"/>`;
      return;
    }

    const originSt = store.byId(store.currentOriginId());
    const originGlyph = originSt ? stitchGlyphAt(originSt, ORIGIN) : ''; // recolour the origin light blue
    const reticle = (color) => `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="3" fill="none" stroke="${color}" stroke-width="1.4"/>`;

    if (stage === 'origin') {
      // Picking where we come from: preview the candidate origin in light blue.
      const cand = nearestStitch(store.state.stitches, p.x, p.y, cmap());
      cursorLayer.innerHTML = (cand ? stitchGlyphAt(cand, ORIGIN) : '') + reticle(ORIGIN);
      return;
    }
    if (stage === 'base') {
      // Picking the base: highlight the candidate stitch head / space.
      const base = pickBase(store.state.stitches, p.x, p.y, cmap());
      cursorLayer.innerHTML = originGlyph + reticle(TARGET) + baseMark(base);
      return;
    }

    // stage 'head': base is locked; draw the stitch as a line from base to cursor.
    const base = basePoint(lockedBase);
    if (!base) { cursorLayer.innerHTML = originGlyph; return; }
    const dx = p.x - base.x, dy = p.y - base.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    const rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const baseAtCenter = Math.hypot(base.x, base.y) < 1e-6;
    const useSym = (sym.order > 1 || sym.mirror) && !(baseAtCenter && len < 0.001);
    const orbit = useSym ? symmetryOrbit({ x: base.x, y: base.y, rot, mirror: false }, sym) : [{ x: base.x, y: base.y, rot, mirror: false }];
    const oh = originSt ? topOfStitch(originSt, cmap()) : null;
    const linkLine = oh ? link(oh.x, oh.y, base.x, base.y, ORIGIN, '4 3') : '';
    cursorLayer.innerHTML = linkLine + originGlyph + ghostMarkup(orbit, len) + dot(base, TARGET);
  }

  function placementName() {
    return (STITCHES[placement.ref] && STITCHES[placement.ref].name)
      || (store.state.clusterMap[placement.ref] && store.state.clusterMap[placement.ref].name)
      || (placement.kind === 'motif' ? 'motif' : 'stitch');
  }
  function updateToast() {
    if (!toastEl) return;
    if (tool !== 'place') { toastEl.hidden = true; return; }
    toastEl.hidden = false;
    if (isOneClick()) toastEl.textContent = `Click to place ${placementName()}`;
    else toastEl.textContent = stage === 'origin' ? 'Select origin stitch'
      : stage === 'base' ? 'Select stitch base' : 'Select stitch head';
  }
  function updateHint() {
    updateToast();
    if (!hintEl) return;
    if (tool === 'pan') { hintEl.textContent = 'Drag to pan · scroll to zoom'; return; }
    if (tool === 'select') {
      hintEl.textContent = 'Pick a stitch (or press its key) to start crocheting · drag to select / move · scroll to zoom · hold space to pan';
      return;
    }
    const name = placementName();
    if (isOneClick()) hintEl.textContent = `Click to place the ${name} · Esc to exit`;
    else if (stage === 'origin') hintEl.textContent = `Insert ${name} — click the stitch you're working from · Esc exits`;
    else if (stage === 'base') hintEl.textContent = `Insert ${name} — click its base: a stitch head or a space · Shift-click sets origin · Esc exits`;
    else hintEl.textContent = `Insert ${name} — click the head to lock it in · Esc cancels the base`;
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
      // Shift-click an existing stitch re-anchors the origin (working position).
      if (e.shiftKey && placement.kind !== 'motif') {
        const hit = e.target.closest('[data-id]');
        if (hit) { store.setOrigin(hit.getAttribute('data-id')); if (stage === 'origin') stage = 'base'; updateHint(); updateGhost(u); return; }
      }
      const p = store.snapPoint(u.x, u.y);
      if (placement.kind === 'motif') {
        store.placeMotif(placement.ref, p.x, p.y);
      } else if (isOneClick()) {
        // a start (round 0): one click, no origin/base — it's a fresh root.
        store.addStitch({ type: placement.ref, x: p.x, y: p.y, origin: null, target: null }, { select: false });
        resetInsert();
      } else if (stage === 'origin') {
        // pick where we're working from (or skip if nothing is nearby)
        const cand = nearestStitch(store.state.stitches, p.x, p.y, cmap(), 80);
        if (cand) store.setOrigin(cand.id);
        stage = 'base'; updateHint(); updateGhost(u); return;
      } else if (stage === 'base') {
        // pick the base: a stitch head or a space. (No free points — there must
        // be something to crochet into; if there's nothing near, wait.)
        const b = pickBase(store.state.stitches, p.x, p.y, cmap());
        if (b) { lockedBase = b; stage = 'head'; }
        updateHint(); updateGhost(u); return;
      } else {
        // pick the head: place the stitch as a line from its base to here
        const base = basePoint(lockedBase);
        if (!base) { resetInsert(); updateHint(); updateGhost(u); return; }
        const dx = p.x - base.x, dy = p.y - base.y;
        const len = Math.max(2, Math.hypot(dx, dy));
        const rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
        store.addStitch({
          type: placement.ref, x: base.x, y: base.y, rot, len,
          origin: store.currentOriginId(), target: lockedBase,
        }, { select: false });
        resetInsert(); // origin auto-advances to the new stitch -> next is 'base'
      }
      updateHint();
      updateGhost(u);
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
      if (stage === 'head') { resetInsert(); updateHint(); updateGhost(lastU); return true; }
      this.setTool('select');
      return true;
    },
    onLoad() {
      view = { ...store.state.view };
      resetInsert();
      updateHint();
      render();
    },
    setSpace(v) { spaceDown = v; },
  };
}
