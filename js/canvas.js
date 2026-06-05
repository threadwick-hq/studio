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
  let tool = 'place';
  let placement = { kind: 'stitch', ref: 'dc' };
  let onToolChange = () => {};
  let drag = null; // { leadId, ox, oy, startU, moved }
  let panning = null;
  let marquee = null; // { startU, additive, base:Set, moved }
  let spaceDown = false;

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

  function updateGhost(u) {
    if (tool !== 'place') return clearGhost();
    const p = store.snapPoint(u.x, u.y);
    const rot = store.defaultRotFor(p.x, p.y);
    const sym = store.state.settings.symmetry;
    const atCenter = Math.hypot(p.x, p.y) < 1e-6;
    const isStitch = placement.kind !== 'motif';
    // Connectivity: origin (where we come from) + target (what we work into).
    const originSt = isStitch ? store.byId(store.currentOriginId()) : null;
    const target = isStitch && !atCenter ? store.pickTarget(p.x, p.y) : null;
    const onOrigin = target && target.kind === 'stitch' && originSt && target.id === originSt.id;
    const tgtPt = onOrigin ? null : store.targetPoint(target);
    // Preview where symmetry will copy this stitch, so it's obvious before clicking.
    const useSym = isStitch && !atCenter && (sym.order > 1 || sym.mirror);
    const orbit = useSym
      ? symmetryOrbit({ x: p.x, y: p.y, rot, mirror: false }, sym)
      : [{ x: p.x, y: p.y, rot, mirror: false }];
    let links = '', ghost = '', marks = '', halos = '';
    if (originSt) {
      links += link(originSt.x, originSt.y, p.x, p.y, ORIGIN, '5 3');
      halos += halo(originSt, ORIGIN, 'origin');
    }
    if (tgtPt) {
      links += link(p.x, p.y, tgtPt.x, tgtPt.y, TARGET, '2 3');
      if (target.kind === 'space') halos += spaceMark(tgtPt, TARGET, 'sp');
      else halos += halo(tgtPt, TARGET, 'into');
    }
    if (isStitch) {
      const inner = shapesMarkup(buildStitchShapes(placement.ref, store.state.clusterMap).shapes, GHOST);
      orbit.forEach((o, i) => {
        const m = o.mirror ? ' scale(-1,1)' : '';
        ghost += `<g transform="translate(${round(o.x)} ${round(o.y)}) rotate(${round(o.rot)})${m}" opacity="${i === 0 ? 0.55 : 0.26}">${inner}</g>`;
      });
    }
    for (const o of orbit) {
      marks += `<circle cx="${round(o.x)}" cy="${round(o.y)}" r="3.2" fill="none" stroke="${GHOST}" stroke-width="1.2"/>`;
    }
    cursorLayer.innerHTML = links + ghost + marks + halos;
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
      } else {
        // Chain from the last-placed stitch; work into the explicit target under
        // the cursor (a stitch or a space). Don't select while placing — keeps
        // rapid placement clean and lets the origin/target highlight show.
        store.addStitch({
          type: placement.ref, x: p.x, y: p.y,
          origin: store.currentOriginId(),
          target: store.pickTarget(p.x, p.y),
        }, { select: false });
      }
      updateGhost(u); // refresh origin/target halos for the new chain head
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

  return {
    render,
    fit,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    setTool(t) {
      tool = t;
      clearGhost();
      const wrap = svg.closest('#canvas-wrap');
      if (wrap) wrap.dataset.tool = t;
      onToolChange(t);
    },
    getTool: () => tool,
    setOnToolChange(fn) { onToolChange = fn; },
    setPlacement(p) {
      placement = p;
      if (tool !== 'place') this.setTool('place');
    },
    getPlacement: () => placement,
    onLoad() {
      view = { ...store.state.view };
      render();
    },
    setSpace(v) { spaceDown = v; },
  };
}
